/**
 * Direct-to-S3 multipart upload using a remote SigV4 signer.
 *
 * Mirrors what the Mediagraph browser does via Evaporate.js: server holds the
 * AWS secret and signs request descriptors via POST /api/assets/sign; the
 * client talks directly to S3 (S3 Transfer Acceleration endpoint) for
 * `CreateMultipartUpload`, `UploadPart`, and `CompleteMultipartUpload`.
 *
 * Why direct-to-S3 instead of routing bytes through Mediagraph: the server
 * never sees the file, so very large uploads (multi-GB) don't push CPU /
 * bandwidth through Rails. The server only signs ~one request per part
 * (~tens of KB of HTTP), regardless of file size.
 *
 * Concurrency: we hold N parts in flight simultaneously. Default 3 matches
 * Evaporate.js. Each part is read fresh from disk on retry so memory stays
 * bounded at `concurrency * partSize`.
 *
 * Failure handling: any unrecoverable error triggers `AbortMultipartUpload`
 * so we don't leave orphaned multipart sessions accruing storage cost.
 */

import { createHash } from 'node:crypto';
import { open, type FileHandle } from 'node:fs/promises';

import { signRequest, type RemoteSigner } from './sigv4.js';

export interface MultipartConfig {
  awsKey: string;
  bucket: string;
  region: string;          // default 'us-east-1'
  s3Acceleration: boolean; // default true (matches Evaporate config)
  remoteSigner: RemoteSigner;
}

export interface MultipartOptions {
  /** Bytes per part. S3 minimum 5 MiB except last; max 5 GiB. Default 8 MiB. */
  partSize?: number;
  /** Parallel parts in flight. Default 3 (matches Evaporate). */
  concurrency?: number;
  /** Per-part retry budget. PUTs are idempotent, retries are safe. Default 3. */
  partMaxRetries?: number;
  /** Optional progress callback fired after each part completes. */
  onProgress?: (bytesSent: number, totalBytes: number) => void;
}

const DEFAULT_PART_SIZE = 8 * 1024 * 1024;
const MIN_PART_SIZE = 5 * 1024 * 1024;
const MAX_PART_COUNT = 10_000;

export async function uploadFileMultipart(
  config: MultipartConfig,
  s3Key: string,
  filePath: string,
  contentType: string,
  options: MultipartOptions = {},
): Promise<{ uploadId: string; parts: number; totalBytes: number }> {
  const partSize = Math.max(options.partSize ?? DEFAULT_PART_SIZE, MIN_PART_SIZE);
  const concurrency = Math.max(1, options.concurrency ?? 3);
  const partMaxRetries = options.partMaxRetries ?? 3;

  const fh = await open(filePath, 'r');
  let stat;
  try {
    stat = await fh.stat();
  } catch (e) {
    await fh.close();
    throw e;
  }
  const totalBytes = stat.size;
  const partCount = Math.ceil(totalBytes / partSize);
  if (partCount > MAX_PART_COUNT) {
    await fh.close();
    throw new Error(
      `File requires ${partCount} parts but S3 caps multipart at ${MAX_PART_COUNT}. ` +
      `Increase --part-size or split the file.`,
    );
  }

  const baseUrl = endpointUrl(config, s3Key);
  let uploadId: string | null = null;

  try {
    uploadId = await initiateMultipart(config, baseUrl, contentType);
    const parts = await uploadAllParts(config, baseUrl, uploadId, fh, totalBytes, partSize, concurrency, partMaxRetries, options.onProgress);
    await completeMultipart(config, baseUrl, uploadId, parts);
    return { uploadId, parts: parts.length, totalBytes };
  } catch (err) {
    // Best-effort abort. Don't mask the original failure.
    if (uploadId) {
      try { await abortMultipart(config, baseUrl, uploadId); } catch { /* ignore */ }
    }
    throw err;
  } finally {
    await fh.close();
  }
}

interface PartResult {
  partNumber: number;
  etag: string;
}

async function initiateMultipart(config: MultipartConfig, baseUrl: string, contentType: string): Promise<string> {
  const url = `${baseUrl}?uploads`;
  const signed = await signRequest(
    { method: 'POST', url, headers: { 'content-type': contentType } },
    signerContext(config),
  );
  const response = await fetch(url, { method: 'POST', headers: signed.headers });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`CreateMultipartUpload failed: ${response.status} ${response.statusText} ${detail.slice(0, 300)}`);
  }
  const xml = await response.text();
  const match = xml.match(/<UploadId>([^<]+)<\/UploadId>/);
  if (!match) throw new Error(`CreateMultipartUpload response missing UploadId: ${xml.slice(0, 200)}`);
  return match[1];
}

async function uploadAllParts(
  config: MultipartConfig,
  baseUrl: string,
  uploadId: string,
  fh: FileHandle,
  totalBytes: number,
  partSize: number,
  concurrency: number,
  partMaxRetries: number,
  onProgress?: (sent: number, total: number) => void,
): Promise<PartResult[]> {
  const partCount = Math.ceil(totalBytes / partSize);
  const results: PartResult[] = new Array(partCount);
  let bytesSent = 0;
  let nextIndex = 0;
  let firstError: Error | null = null;

  const worker = async (): Promise<void> => {
    while (true) {
      if (firstError) return;
      const idx = nextIndex++;
      if (idx >= partCount) return;

      const start = idx * partSize;
      const end = Math.min(start + partSize, totalBytes);
      const length = end - start;

      try {
        const etag = await uploadOnePart(config, baseUrl, uploadId, idx + 1, fh, start, length, partMaxRetries);
        results[idx] = { partNumber: idx + 1, etag };
        bytesSent += length;
        onProgress?.(bytesSent, totalBytes);
      } catch (err) {
        if (!firstError) firstError = err as Error;
        return;
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  if (firstError) throw firstError;
  return results;
}

async function uploadOnePart(
  config: MultipartConfig,
  baseUrl: string,
  uploadId: string,
  partNumber: number,
  fh: FileHandle,
  offset: number,
  length: number,
  maxRetries: number,
): Promise<string> {
  // Read part fresh on each attempt so retries don't recycle a half-consumed
  // buffer. With 8 MiB parts this is bounded memory and the sync read
  // overlaps with the fetch over the wire.
  let attempt = 0;
  let lastErr: unknown;
  while (attempt < maxRetries) {
    attempt += 1;
    const buf = Buffer.alloc(length);
    const { bytesRead } = await fh.read(buf, 0, length, offset);
    if (bytesRead !== length) {
      throw new Error(`Short read at offset ${offset}: got ${bytesRead}, expected ${length}`);
    }

    const url = `${baseUrl}?partNumber=${partNumber}&uploadId=${encodeURIComponent(uploadId)}`;
    const payloadSha = createHash('sha256').update(buf).digest('hex');
    const signed = await signRequest(
      { method: 'PUT', url, payloadSha256: payloadSha, headers: { 'content-length': String(length) } },
      signerContext(config),
    );

    try {
      const response = await fetch(url, { method: 'PUT', body: buf, headers: signed.headers });
      if (response.ok) {
        const etag = response.headers.get('ETag') || response.headers.get('etag');
        if (!etag) throw new Error(`UploadPart ${partNumber} response missing ETag`);
        return etag;
      }
      // 5xx and 429 are retryable; others abort.
      if (response.status >= 500 || response.status === 429) {
        lastErr = new Error(`UploadPart ${partNumber} HTTP ${response.status}`);
      } else {
        const detail = await response.text().catch(() => '');
        throw new Error(`UploadPart ${partNumber} failed: ${response.status} ${response.statusText} ${detail.slice(0, 200)}`);
      }
    } catch (err) {
      lastErr = err;
      if (!isTransientFetchError(err) && !(err instanceof Error && /UploadPart .* HTTP/.test(err.message))) throw err;
    }

    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`UploadPart ${partNumber} failed after ${maxRetries} attempts`);
}

async function completeMultipart(
  config: MultipartConfig,
  baseUrl: string,
  uploadId: string,
  parts: PartResult[],
): Promise<void> {
  const xml = buildCompleteXml(parts);
  const url = `${baseUrl}?uploadId=${encodeURIComponent(uploadId)}`;
  const payloadSha = createHash('sha256').update(xml).digest('hex');
  const signed = await signRequest(
    { method: 'POST', url, payloadSha256: payloadSha, headers: { 'content-type': 'application/xml' } },
    signerContext(config),
  );
  const response = await fetch(url, { method: 'POST', body: xml, headers: signed.headers });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`CompleteMultipartUpload failed: ${response.status} ${response.statusText} ${detail.slice(0, 300)}`);
  }
  // S3 may return 200 with an error in the body. Check for <Error>.
  const body = await response.text();
  if (body.includes('<Error>')) {
    throw new Error(`CompleteMultipartUpload returned error body: ${body.slice(0, 300)}`);
  }
}

async function abortMultipart(config: MultipartConfig, baseUrl: string, uploadId: string): Promise<void> {
  const url = `${baseUrl}?uploadId=${encodeURIComponent(uploadId)}`;
  const signed = await signRequest({ method: 'DELETE', url }, signerContext(config));
  await fetch(url, { method: 'DELETE', headers: signed.headers });
}

function endpointUrl(config: MultipartConfig, key: string): string {
  // S3 Transfer Acceleration uses a virtual-hosted-style endpoint that's
  // distinct from the regional one; Evaporate.js sets s3Acceleration: true.
  const host = config.s3Acceleration
    ? `${config.bucket}.s3-accelerate.amazonaws.com`
    : `${config.bucket}.s3.${config.region}.amazonaws.com`;
  // Encode each path segment, preserve slashes.
  const path = key.split('/').map(encodeURIComponent).join('/');
  return `https://${host}/${path}`;
}

function signerContext(config: MultipartConfig) {
  return {
    awsKey: config.awsKey,
    region: config.region,
    service: 's3' as const,
    remoteSigner: config.remoteSigner,
  };
}

function buildCompleteXml(parts: PartResult[]): string {
  const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);
  const items = sorted
    .map(p => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag}</ETag></Part>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<CompleteMultipartUpload xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${items}</CompleteMultipartUpload>`;
}

function isTransientFetchError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|fetch failed|socket hang up/i.test(msg);
}
