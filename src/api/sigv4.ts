/**
 * AWS Signature Version 4 helpers — *with a remote signer*.
 *
 * The Mediagraph server holds the AWS secret key. Clients (browser via
 * Evaporate.js, this CLI) build the canonical request and string-to-sign
 * locally, post the string to `POST /api/assets/sign`, and use the returned
 * HMAC-SHA256 hex signature to assemble the `Authorization` header.
 *
 * We mirror that flow exactly so existing server endpoints work unchanged.
 *
 * Reference: https://docs.aws.amazon.com/general/latest/gr/sigv4_signing.html
 */

import { createHash } from 'node:crypto';

export type RemoteSigner = (toSign: string, datetime: string) => Promise<string>;

export interface SigV4Request {
  method: 'GET' | 'PUT' | 'POST' | 'DELETE' | 'HEAD';
  /** Full URL, e.g. `https://bucket.s3-accelerate.amazonaws.com/key?uploads` */
  url: string;
  /**
   * Headers to sign. `host` and `x-amz-date` are added automatically.
   * Lowercase header names recommended.
   */
  headers?: Record<string, string>;
  /**
   * SHA256 hex of the request body. Use the literal string `UNSIGNED-PAYLOAD`
   * for streaming bodies (S3 accepts this for SigV4 with the matching
   * `x-amz-content-sha256` header).
   */
  payloadSha256?: string;
}

export interface SignedRequest {
  url: string;
  headers: Record<string, string>;
}

export interface SignerContext {
  awsKey: string;
  region: string;
  service: 's3';
  /** Calls back to the server to compute the HMAC. */
  remoteSigner: RemoteSigner;
}

const ALGORITHM = 'AWS4-HMAC-SHA256';

/** Sign a single S3 request via the remote-signer pattern Evaporate.js uses. */
export async function signRequest(req: SigV4Request, ctx: SignerContext): Promise<SignedRequest> {
  const url = new URL(req.url);
  const datetime = amzDate(new Date());
  const date = datetime.slice(0, 8);
  const credentialScope = `${date}/${ctx.region}/${ctx.service}/aws4_request`;

  const payloadHash = req.payloadSha256 ?? 'UNSIGNED-PAYLOAD';

  // Headers we sign. Always include host, x-amz-date, x-amz-content-sha256.
  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-date': datetime,
    'x-amz-content-sha256': payloadHash,
    ...lowercaseKeys(req.headers ?? {}),
  };

  const sortedHeaderNames = Object.keys(headers).sort();
  const signedHeaders = sortedHeaderNames.join(';');
  const canonicalHeaders = sortedHeaderNames
    .map(name => `${name}:${headers[name].trim().replace(/\s+/g, ' ')}`)
    .join('\n') + '\n';

  const canonicalRequest = [
    req.method,
    canonicalUri(url.pathname),
    canonicalQueryString(url.searchParams),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const stringToSign = [
    ALGORITHM,
    datetime,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signature = await ctx.remoteSigner(stringToSign, datetime);
  const authorization = `${ALGORITHM} Credential=${ctx.awsKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: req.url,
    headers: {
      ...headers,
      Authorization: authorization,
    },
  };
}

/** YYYYMMDDTHHmmssZ */
function amzDate(d: Date): string {
  const iso = d.toISOString().replace(/[-:]/g, '');
  return `${iso.slice(0, 15)}Z`;
}

function sha256Hex(s: string | Uint8Array): string {
  return createHash('sha256').update(s).digest('hex');
}

/** Lowercase all keys; values untouched. */
function lowercaseKeys(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) out[k.toLowerCase()] = v;
  return out;
}

/**
 * Canonical URI: path with each segment URI-encoded, except the slashes.
 * S3 expects double-encoding (path-encode the already-encoded segments) for
 * SigV4 — see AWS docs. We don't double-encode because we're only ever
 * passing through paths the server gave us (s3_upload_key is plain ASCII).
 */
function canonicalUri(path: string): string {
  if (!path) return '/';
  return path.split('/').map(seg => encodeRfc3986(seg)).join('/');
}

function canonicalQueryString(params: URLSearchParams): string {
  const entries: [string, string][] = [];
  params.forEach((v, k) => entries.push([k, v]));
  entries.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  return entries
    .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
    .join('&');
}

function encodeRfc3986(s: string): string {
  return encodeURIComponent(s).replace(/[!*'()]/g, c =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
