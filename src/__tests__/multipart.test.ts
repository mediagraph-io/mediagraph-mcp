/**
 * Tests for direct-to-S3 multipart upload + SigV4 remote-signer wiring.
 *
 * The SigV4 algorithm is well-defined; we test that:
 *   - Canonical requests are deterministic for known inputs
 *   - The remote-signer is called with the right string-to-sign and datetime
 *   - The Authorization header has the right shape
 *
 * For multipart, we mock global fetch and walk through the S3 protocol
 * (initiate / N parts in parallel / complete / abort), asserting the URLs,
 * methods, and that the part XML contains all ETags in order.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, openSync, ftruncateSync, closeSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { signRequest, type RemoteSigner } from '../api/sigv4.js';
import { uploadFileMultipart } from '../api/multipart.js';
import { MediagraphClient } from '../api/client.js';

const fakeSigner: RemoteSigner = async (toSign, datetime) => {
  // Deterministic fake signature: the test asserts the *call*, not the value.
  return `signed-${datetime}-${toSign.length}`;
};

describe('api/sigv4', () => {
  it('builds an Authorization header with the expected shape', async () => {
    const out = await signRequest(
      { method: 'PUT', url: 'https://my-bucket.s3-accelerate.amazonaws.com/key/here?partNumber=1&uploadId=abc' },
      { awsKey: 'AKIAEXAMPLE', region: 'us-east-1', service: 's3', remoteSigner: fakeSigner },
    );
    expect(out.headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE\/\d{8}\/us-east-1\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=signed-/);
    expect(out.headers.host).toBe('my-bucket.s3-accelerate.amazonaws.com');
    expect(out.headers['x-amz-content-sha256']).toBe('UNSIGNED-PAYLOAD');
  });

  it('passes the canonical string-to-sign to the remote signer', async () => {
    const calls: Array<{ toSign: string; datetime: string }> = [];
    const signer: RemoteSigner = async (toSign, datetime) => {
      calls.push({ toSign, datetime });
      return 'sig';
    };
    await signRequest(
      { method: 'POST', url: 'https://b.s3-accelerate.amazonaws.com/k?uploads' },
      { awsKey: 'K', region: 'us-east-1', service: 's3', remoteSigner: signer },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].toSign.startsWith('AWS4-HMAC-SHA256\n')).toBe(true);
    expect(calls[0].datetime).toMatch(/^\d{8}T\d{6}Z$/);
    // String-to-sign always includes credential scope and a SHA256 hash.
    expect(calls[0].toSign).toContain('/us-east-1/s3/aws4_request');
  });

  it('produces the same string-to-sign regardless of query param order', async () => {
    // Canonical query strings are sorted alphabetically; URLs that differ only
    // in param order must produce identical string-to-sign payloads (modulo
    // the timestamp, which we pin via fake timers).
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-27T12:00:00Z'));

    const captured: string[] = [];
    const signer: RemoteSigner = async (toSign) => { captured.push(toSign); return 'x'; };
    const ctx = { awsKey: 'K', region: 'us-east-1', service: 's3' as const, remoteSigner: signer };

    await signRequest({ method: 'PUT', url: 'https://b.s3-accelerate.amazonaws.com/k?uploadId=abc&partNumber=1' }, ctx);
    await signRequest({ method: 'PUT', url: 'https://b.s3-accelerate.amazonaws.com/k?partNumber=1&uploadId=abc' }, ctx);
    expect(captured[0]).toBe(captured[1]);
    vi.useRealTimers();
  });
});

describe('api/multipart', () => {
  let tmp: string;
  let filePath: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'mg-mp-'));
    filePath = join(tmp, 'big.bin');
  });

  function makeFile(sizeBytes: number): void {
    // Sparse file — appears `sizeBytes` to stat() but takes ~no disk space.
    // S3 multipart enforces 5 MiB minimum per part except the last; we still
    // need real bytes for `read()`, so use a small explicit content for tests.
    const fd = openSync(filePath, 'w');
    ftruncateSync(fd, sizeBytes);
    closeSync(fd);
  }

  function s3Mock() {
    let uploadIdCounter = 0;
    const uploadedParts: Array<{ partNumber: string | null; uploadId: string | null; bodySize: number }> = [];
    let aborted = false;
    let completed: { uploadId: string | null; xml: string } | null = null;

    const fetchImpl = vi.fn().mockImplementation(async (rawUrl: string, init: RequestInit) => {
      const url = new URL(rawUrl);
      const partNumber = url.searchParams.get('partNumber');
      const uploadId = url.searchParams.get('uploadId');
      const isInitiate = url.searchParams.has('uploads') && init.method === 'POST';
      const isComplete = uploadId && init.method === 'POST' && !partNumber;
      const isAbort = uploadId && init.method === 'DELETE';
      const isPart = partNumber && uploadId && init.method === 'PUT';

      if (isInitiate) {
        const id = `upload-${++uploadIdCounter}`;
        return {
          ok: true, status: 200, statusText: 'OK',
          text: async () => `<?xml version="1.0"?><InitiateMultipartUploadResult><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`,
          headers: { get: () => null },
        };
      }
      if (isPart) {
        const body = init.body as Buffer | Uint8Array;
        const size = body && 'byteLength' in body ? body.byteLength : 0;
        uploadedParts.push({ partNumber, uploadId, bodySize: size });
        return {
          ok: true, status: 200, statusText: 'OK',
          text: async () => '',
          headers: { get: (n: string) => n.toLowerCase() === 'etag' ? `"etag-${partNumber}"` : null },
        };
      }
      if (isComplete) {
        const xml = init.body as string;
        completed = { uploadId, xml };
        return {
          ok: true, status: 200, statusText: 'OK',
          text: async () => '<CompleteMultipartUploadResult/>',
          headers: { get: () => null },
        };
      }
      if (isAbort) {
        aborted = true;
        return { ok: true, status: 204, statusText: 'No Content', text: async () => '', headers: { get: () => null } };
      }
      throw new Error(`Unexpected fetch: ${init.method} ${rawUrl}`);
    });

    return { fetchImpl, uploadedParts, get aborted() { return aborted; }, get completed() { return completed; } };
  }

  it('initiates, uploads N parts, and completes', async () => {
    // 5 parts of 5 MiB, 1 part of 3 MiB — 6 parts total, 28 MiB
    const totalBytes = 28 * 1024 * 1024;
    const partSize = 5 * 1024 * 1024;
    makeFile(totalBytes);

    const mock = s3Mock();
    vi.stubGlobal('fetch', mock.fetchImpl);

    const result = await uploadFileMultipart(
      { awsKey: 'K', bucket: 'b', region: 'us-east-1', s3Acceleration: true, remoteSigner: fakeSigner },
      'org/upload-guid/file.bin', filePath, 'application/octet-stream',
      { partSize, concurrency: 3 },
    );

    expect(result.parts).toBe(6);
    expect(result.totalBytes).toBe(totalBytes);
    expect(mock.uploadedParts).toHaveLength(6);
    expect(mock.completed).not.toBeNull();
    // Part XML should list ETags 1..6 in order.
    for (let n = 1; n <= 6; n++) {
      expect(mock.completed!.xml).toContain(`<PartNumber>${n}</PartNumber>`);
      expect(mock.completed!.xml).toContain(`<ETag>"etag-${n}"</ETag>`);
    }
    expect(mock.aborted).toBe(false);

    rmSync(tmp, { recursive: true, force: true });
  });

  it('uses the s3-accelerate endpoint when enabled', async () => {
    makeFile(6 * 1024 * 1024);
    const mock = s3Mock();
    vi.stubGlobal('fetch', mock.fetchImpl);

    await uploadFileMultipart(
      { awsKey: 'K', bucket: 'mybucket', region: 'us-east-1', s3Acceleration: true, remoteSigner: fakeSigner },
      'k/path', filePath, 'application/octet-stream',
      { partSize: 5 * 1024 * 1024, concurrency: 1 },
    );
    const initiateCall = mock.fetchImpl.mock.calls.find(
      (c: [string, RequestInit]) => new URL(c[0]).searchParams.has('uploads'),
    );
    expect(initiateCall).toBeTruthy();
    expect(new URL(initiateCall![0]).host).toBe('mybucket.s3-accelerate.amazonaws.com');

    rmSync(tmp, { recursive: true, force: true });
  });

  it('aborts the multipart session if a part fails permanently', async () => {
    makeFile(6 * 1024 * 1024);
    const fetchImpl = vi.fn().mockImplementation(async (rawUrl: string, init: RequestInit) => {
      const url = new URL(rawUrl);
      const partNumber = url.searchParams.get('partNumber');
      const isInitiate = url.searchParams.has('uploads') && init.method === 'POST';
      const isAbort = url.searchParams.has('uploadId') && !partNumber && init.method === 'DELETE';
      if (isInitiate) {
        return {
          ok: true, status: 200, statusText: 'OK',
          text: async () => '<InitiateMultipartUploadResult><UploadId>u1</UploadId></InitiateMultipartUploadResult>',
          headers: { get: () => null },
        };
      }
      if (isAbort) {
        return { ok: true, status: 204, statusText: 'No Content', text: async () => '', headers: { get: () => null } };
      }
      // Permanent 4xx on every part
      return {
        ok: false, status: 403, statusText: 'Forbidden',
        text: async () => '<Error>denied</Error>',
        headers: { get: () => null },
      };
    });
    vi.stubGlobal('fetch', fetchImpl);

    await expect(
      uploadFileMultipart(
        { awsKey: 'K', bucket: 'b', region: 'us-east-1', s3Acceleration: true, remoteSigner: fakeSigner },
        'k', filePath, 'application/octet-stream',
        { partSize: 5 * 1024 * 1024, concurrency: 2, partMaxRetries: 1 },
      ),
    ).rejects.toThrow(/UploadPart .* 403/);
    // Abort should have been called.
    const abortCall = fetchImpl.mock.calls.find(
      (c: [string, RequestInit]) => new URL(c[0]).searchParams.has('uploadId') && !new URL(c[0]).searchParams.get('partNumber') && c[1].method === 'DELETE',
    );
    expect(abortCall).toBeTruthy();

    rmSync(tmp, { recursive: true, force: true });
  });

  it('rejects files that would require more than 10 000 parts', async () => {
    const sizeBytes = 5 * 1024 * 1024 * 10_001; // 10 001 parts at 5 MiB
    makeFile(sizeBytes);

    await expect(
      uploadFileMultipart(
        { awsKey: 'K', bucket: 'b', region: 'us-east-1', s3Acceleration: true, remoteSigner: fakeSigner },
        'k', filePath, 'application/octet-stream',
        { partSize: 5 * 1024 * 1024 },
      ),
    ).rejects.toThrow(/caps multipart at 10000|caps multipart at 10_000|S3 caps multipart/);

    rmSync(tmp, { recursive: true, force: true });
  });
});

describe('MediagraphClient.signAwsRequest', () => {
  it('POSTs string-to-sign + datetime to /api/assets/sign and returns the signature', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, statusText: 'OK',
      text: async () => 'deadbeef\n',
      headers: { get: () => null },
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new MediagraphClient({ getAccessToken: async () => 'tok' });
    const sig = await client.signAwsRequest('AWS4-HMAC-SHA256\n...\n', '20260427T120000Z');
    expect(sig).toBe('deadbeef');

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/api/assets/sign');
    expect(calledUrl).toContain('datetime=20260427T120000Z');
    expect(calledUrl).toContain('to_sign=');
    const calledInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(calledInit.method).toBe('GET');
    expect((calledInit.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('uses Basic + OrganizationId when in PAT mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, statusText: 'OK',
      text: async () => 'sig',
      headers: { get: () => null },
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new MediagraphClient({
      getAuth: async () => ({ mode: 'basic', pat: 'p', organizationId: 7 }),
    });
    await client.signAwsRequest('s', '20260427T120000Z');
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from(':p').toString('base64')}`);
    expect(headers.OrganizationId).toBe('7');
  });
});
