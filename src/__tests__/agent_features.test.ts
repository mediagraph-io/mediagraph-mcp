/**
 * Tests for the agentic-usage features added to the CLI:
 *   - Structured errors (CliError + classify)
 *   - PAT auth path through Runtime + MediagraphClient
 *   - Auto-pagination
 *   - Dry-run interception
 *   - Wait helper
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { CliError, classify } from '../cli/errors.js';
import { isPaginated, paginate } from '../cli/pagination.js';
import { stripGlobalFlags } from '../cli/global_flags.js';
import { waitForTerminal, WaitTimeout } from '../cli/wait.js';
import { MediagraphClient, MediagraphApiError, DryRunIntercept } from '../api/client.js';
import { getAuthStatus, type Runtime } from '../core/runtime.js';
import type { ToolDefinition, ToolResult } from '../tools/shared.js';
import { toolDefinitions } from '../tools/index.js';

describe('cli/errors', () => {
  it('classifies API 401 as AUTH_REQUIRED', () => {
    const apiErr = new MediagraphApiError(401, { error: 'unauthorized', message: 'expired' });
    const cli = classify(apiErr);
    expect(cli.code).toBe('AUTH_REQUIRED');
    expect(cli.hint).toMatch(/auth login/);
  });

  it('classifies API 404 as NOT_FOUND', () => {
    expect(classify(new MediagraphApiError(404, { error: 'nf', message: 'gone' })).code).toBe('NOT_FOUND');
  });

  it('classifies API 429 as RATE_LIMITED with Retry-After hint', () => {
    const apiErr = new MediagraphApiError(429, { error: 'too_many', message: 'slow' });
    apiErr.retryAfterMs = 30_000;
    const cli = classify(apiErr);
    expect(cli.code).toBe('RATE_LIMITED');
    expect(cli.hint).toMatch(/30s/);
    expect(cli.context).toMatchObject({ statusCode: 429, retryAfterMs: 30_000 });
  });

  it('classifies API 503 as NETWORK with retry-after', () => {
    const apiErr = new MediagraphApiError(503, { error: 'unavail', message: 'down' });
    apiErr.retryAfterMs = 5000;
    expect(classify(apiErr).code).toBe('NETWORK');
  });

  it('classifies disabled PAT as AUTH_REQUIRED with a specific hint', () => {
    const apiErr = new MediagraphApiError(401, { error: 'pat_disabled', message: 'PAT disabled' });
    apiErr.patDisabled = true;
    const cli = classify(apiErr);
    expect(cli.code).toBe('AUTH_REQUIRED');
    expect(cli.hint).toMatch(/PAT is disabled/);
  });

  describe('insufficient_scope envelope (entity-level)', () => {
    it('classifies an entity-level insufficient_scope 403 with entity + group context (acceptance)', () => {
      const apiErr = new MediagraphApiError(403, {
        error: 'insufficient_scope',
        message: 'token missing required scope',
        reason: 'scope',
        required: 'asset:write',
      } as never);
      apiErr.method = 'POST';
      apiErr.path = '/api/assets';

      const cli = classify(apiErr);
      expect(cli.code).toBe('INSUFFICIENT_SCOPE');
      // Must surface: method+path, the entity-level required scope verbatim,
      // the owning group ("assets"), the tier (basic), the reason, and a fix.
      expect(cli.message).toContain('POST /api/assets');
      expect(cli.message).toContain('asset:write');
      expect(cli.message).toContain('assets group');
      expect(cli.message).toContain('basic');
      expect(cli.message).toMatch(/Reason: scope/);
      expect(cli.message).toMatch(/Regenerate the PAT/);
      // Group-level back-compat hint should be offered too.
      expect(cli.message).toMatch(/assets:write/);
      expect(cli.context).toMatchObject({
        required: 'asset:write',
        entity: 'asset',
        group: 'assets',
        reason: 'scope',
        method: 'POST',
        path: '/api/assets',
        tier: 'basic',
      });
    });

    it('flags advanced tier and produces a different remediation for admin_required (acceptance)', () => {
      const apiErr = new MediagraphApiError(403, {
        error: 'insufficient_scope',
        message: 'admin role required to use this scope',
        reason: 'admin_required',
        required: 'webhook:write',
      } as never);
      apiErr.method = 'POST';
      apiErr.path = '/api/webhooks';

      const cli = classify(apiErr);
      expect(cli.code).toBe('INSUFFICIENT_SCOPE');
      expect(cli.message).toContain('webhooks group');
      expect(cli.message).toContain('advanced');
      expect(cli.message).toMatch(/Reason: admin_required/);
      expect(cli.message).toMatch(/lost admin role/);
      // Crucially, the admin_required remediation must NOT be the same prose
      // as the plain `scope` reason ("Regenerate the PAT...").
      expect(cli.message).not.toMatch(/Regenerate the PAT \(or reauthorize the OAuth app\) with `webhook:write`/);
      expect(cli.context).toMatchObject({
        entity: 'webhook',
        group: 'webhooks',
        tier: 'advanced',
        reason: 'admin_required',
      });
    });

    it('still surfaces a plain 403 (CanCan-style) as the existing AUTH_REQUIRED, not the new code', () => {
      const apiErr = new MediagraphApiError(403, {
        error: 'forbidden',
        message: 'You do not have permission to perform this action.',
      });
      // No insufficientScope flag → don't repath to the new code.
      const cli = classify(apiErr);
      expect(cli.code).toBe('AUTH_REQUIRED');
      expect(cli.code).not.toBe('INSUFFICIENT_SCOPE');
    });
  });

  it('classifies network failures', () => {
    expect(classify(new Error('fetch failed: ECONNREFUSED')).code).toBe('NETWORK');
  });

  it('treats CliError as-is', () => {
    const e = new CliError('BAD_ARGS', 'no');
    expect(classify(e)).toBe(e);
  });

  it('falls back to INTERNAL for unknown errors', () => {
    expect(classify(new Error('boom')).code).toBe('INTERNAL');
  });
});

describe('core/runtime — getAuthStatus exposes scopes', () => {
  // We hand-build a minimal Runtime stub: the only surface getAuthStatus
  // touches is isPatMode(), config.patOrganizationId, and tokenStore.load().
  function fakeRuntime(opts: {
    pat?: boolean;
    patOrgId?: number;
    stored?: {
      tokens?: { access_token: string; expires_at: number; refresh_token?: string; scope?: string; token_type: string; expires_in: number };
      organizationName?: string;
      organizationSlug?: string;
      organizationId?: number;
      userId?: number;
      userEmail?: string;
    } | null;
  }): Runtime {
    return {
      isPatMode: () => !!opts.pat,
      config: { patOrganizationId: opts.patOrgId },
      tokenStore: { load: () => opts.stored ?? null },
    } as unknown as Runtime;
  }

  it('OAuth: parses RFC 6749 scope string into array, marks granular as not full-access', () => {
    const status = getAuthStatus(fakeRuntime({
      stored: {
        tokens: {
          access_token: 't', expires_at: Date.now() + 600_000, token_type: 'Bearer', expires_in: 3600,
          scope: 'assets:read assets:write tags:read',
        },
        organizationName: 'Org', organizationSlug: 'org', organizationId: 1,
      },
    }));
    expect(status.authenticated).toBe(true);
    expect(status.mode).toBe('oauth');
    expect(status.scopes?.list).toEqual(['assets:read', 'assets:write', 'tags:read']);
    expect(status.scopes?.fullAccess).toBe(false);
  });

  it('OAuth: legacy [read, write] scope is full-access', () => {
    const status = getAuthStatus(fakeRuntime({
      stored: {
        tokens: { access_token: 't', expires_at: Date.now() + 1, token_type: 'Bearer', expires_in: 3600, scope: 'read write' },
      },
    }));
    expect(status.scopes?.list).toEqual(['read', 'write']);
    expect(status.scopes?.fullAccess).toBe(true);
  });

  it('OAuth: missing scope field surfaces empty list as full-access', () => {
    const status = getAuthStatus(fakeRuntime({
      stored: {
        tokens: { access_token: 't', expires_at: Date.now() + 1, token_type: 'Bearer', expires_in: 3600 },
      },
    }));
    expect(status.scopes?.list).toEqual([]);
    expect(status.scopes?.fullAccess).toBe(true);
  });

  it('PAT mode: scopes are unintrospectable from CLI; surfaces a hint instead of guessing', () => {
    const status = getAuthStatus(fakeRuntime({ pat: true, patOrgId: 7 }));
    expect(status.mode).toBe('pat');
    expect(status.scopes?.list).toBeUndefined();
    expect(status.scopes?.fullAccess).toBeUndefined();
    expect(status.scopes?.note).toMatch(/list_personal_access_tokens/);
  });

  it('Unauthenticated: returns no scopes block', () => {
    const status = getAuthStatus(fakeRuntime({ stored: null }));
    expect(status.authenticated).toBe(false);
    expect(status.scopes).toBeUndefined();
  });
});

describe('package version', () => {
  it('package.json version field is a real semver', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    // Test runs from repo root, so the package.json is right there.
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')) as { name: string; version: string };
    expect(pkg.name).toBe('@mediagraph/cli');
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('cli/global_flags', () => {
  it('extracts known boolean flags', () => {
    const { flags, rest } = stripGlobalFlags(['--all', '--dry-run', '--q', 'cats']);
    expect(flags.all).toBe(true);
    expect(flags.dryRun).toBe(true);
    expect(rest).toEqual(['--q', 'cats']);
  });

  it('extracts numeric flags with values', () => {
    const { flags } = stripGlobalFlags(['--limit', '50', '--wait-timeout', '120']);
    expect(flags.limit).toBe(50);
    expect(flags.waitTimeoutMs).toBe(120_000);
  });

  it('passes through unknown flags untouched', () => {
    const { flags, rest } = stripGlobalFlags(['--per_page', '10', '--all']);
    expect(flags.all).toBe(true);
    expect(rest).toEqual(['--per_page', '10']);
  });

  it('supports --flag=value form', () => {
    const { flags } = stripGlobalFlags(['--limit=25', '--all=true']);
    expect(flags.limit).toBe(25);
    expect(flags.all).toBe(true);
  });
});

describe('cli/pagination', () => {
  it('detects paginated tools', () => {
    const list = toolDefinitions.find(t => t.name === 'list_collections');
    expect(list && isPaginated(list)).toBe(true);
    const get = toolDefinitions.find(t => t.name === 'get_asset');
    expect(get && isPaginated(get)).toBe(false);
  });

  it('paginates an array-shaped response until exhausted', async () => {
    const pages = [
      Array.from({ length: 100 }, (_, i) => ({ id: i + 1 })),
      Array.from({ length: 100 }, (_, i) => ({ id: i + 101 })),
      Array.from({ length: 25 }, (_, i) => ({ id: i + 201 })),
    ];
    const invoke = vi.fn().mockImplementation(async (args: { page: number }) => pages[args.page - 1]);
    const result = await paginate({}, invoke);
    expect(Array.isArray(result)).toBe(true);
    expect((result as unknown[]).length).toBe(225);
    expect(invoke).toHaveBeenCalledTimes(3);
  });

  it('respects --limit', async () => {
    const pages = [
      Array.from({ length: 100 }, (_, i) => ({ id: i + 1 })),
      Array.from({ length: 100 }, (_, i) => ({ id: i + 101 })),
    ];
    const invoke = vi.fn().mockImplementation(async (args: { page: number }) => pages[args.page - 1]);
    const result = await paginate({}, invoke, { limit: 150 });
    expect((result as unknown[]).length).toBe(150);
  });

  it('paginates an envelope-shaped response (assets array)', async () => {
    const invoke = vi.fn()
      .mockResolvedValueOnce({ assets: Array.from({ length: 100 }, (_, i) => ({ id: i + 1 })), total: 105, page: 1 })
      .mockResolvedValueOnce({ assets: Array.from({ length: 5 }, (_, i) => ({ id: i + 101 })), total: 105, page: 2 });
    const result = await paginate({}, invoke) as Record<string, unknown>;
    expect(Array.isArray(result.assets)).toBe(true);
    expect((result.assets as unknown[]).length).toBe(105);
    expect(result.total).toBe(105);
    expect(result._paginated).toBe(true);
  });

  it('returns non-list responses unchanged', async () => {
    const result = await paginate({}, async () => ({ ok: true, status: 'ready' }));
    expect(result).toEqual({ ok: true, status: 'ready' });
  });
});

describe('api/client dry-run', () => {
  it('throws DryRunIntercept with method/path/body when dryRun is true', async () => {
    const client = new MediagraphClient({
      getAccessToken: async () => 'tok',
      dryRun: true,
    });
    await expect(client.getAsset(42)).rejects.toBeInstanceOf(DryRunIntercept);
    try {
      await client.deleteAsset(99);
    } catch (e) {
      const intercept = e as DryRunIntercept;
      expect(intercept.call.method).toBe('DELETE');
      expect(intercept.call.path).toBe('/api/assets/99');
    }
  });

  it('PAT mode sends Basic auth + OrganizationId header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, statusText: 'OK',
      headers: { get: (n: string) => n.toLowerCase() === 'content-type' ? 'application/json' : null },
      json: async () => ({ id: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new MediagraphClient({
      getAuth: async () => ({ mode: 'basic', pat: 'secret', organizationId: 42 }),
    });
    await client.getAsset(1);
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from(':secret').toString('base64')}`);
    expect(headers.OrganizationId).toBe('42');
  });

  it('Bearer mode sends Authorization: Bearer', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, statusText: 'OK',
      headers: { get: (n: string) => n.toLowerCase() === 'content-type' ? 'application/json' : null },
      json: async () => ({ id: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new MediagraphClient({ getAccessToken: async () => 'oauth-tok' });
    await client.getAsset(1);
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer oauth-tok');
    expect(headers.OrganizationId).toBeUndefined();
  });
});

describe('api/client 429 / 503 / PAT-disabled handling', () => {
  function rateLimited(retryAfter?: string) {
    return {
      ok: false, status: 429, statusText: 'Too Many Requests',
      headers: { get: (n: string) => (n === 'Retry-After' ? retryAfter ?? null : null) },
      json: async () => ({ error: 'rate_limited' }),
    };
  }
  function ok(body: unknown) {
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: { get: (n: string) => n.toLowerCase() === 'content-type' ? 'application/json' : null },
      json: async () => body,
    };
  }

  it('retries 429 with delta-seconds Retry-After then succeeds', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(rateLimited('1'))
      .mockResolvedValueOnce(ok({ id: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new MediagraphClient({ getAccessToken: async () => 'tok' });
    const promise = client.getAsset(1);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(promise).resolves.toMatchObject({ id: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('parses HTTP-date Retry-After', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const inFuture = new Date('2026-01-01T00:00:02Z').toUTCString();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(rateLimited(inFuture))
      .mockResolvedValueOnce(ok({ id: 2 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new MediagraphClient({ getAccessToken: async () => 'tok' });
    const promise = client.getAsset(2);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(promise).resolves.toMatchObject({ id: 2 });
    vi.useRealTimers();
  });

  it('throws MediagraphApiError(429) with retryAfterMs after exhausting retries', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(rateLimited('2'));
    vi.stubGlobal('fetch', fetchMock);

    const client = new MediagraphClient({ getAccessToken: async () => 'tok' });
    const promise = client.getAsset(3);
    promise.catch(() => { /* swallow */ });
    await vi.advanceTimersByTimeAsync(20_000);

    await expect(promise).rejects.toMatchObject({
      statusCode: 429,
      retryAfterMs: 2000,
    });
    expect(await promise.catch(e => e)).toBeInstanceOf(MediagraphApiError);
    vi.useRealTimers();
  });

  it('throws immediately when Retry-After exceeds the cap (no point looping)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(rateLimited('3600'));
    vi.stubGlobal('fetch', fetchMock);

    const client = new MediagraphClient({ getAccessToken: async () => 'tok' });
    await expect(client.getAsset(4)).rejects.toMatchObject({
      statusCode: 429,
      retryAfterMs: 3_600_000,
    });
    // Single attempt; no retries when wait would be too long.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats 503 like 429 (honors Retry-After)', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false, status: 503, statusText: 'Service Unavailable',
        headers: { get: (n: string) => (n === 'Retry-After' ? '1' : null) },
        json: async () => ({ error: 'unavailable' }),
      })
      .mockResolvedValueOnce(ok({ id: 5 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new MediagraphClient({ getAccessToken: async () => 'tok' });
    const promise = client.getAsset(5);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(promise).resolves.toMatchObject({ id: 5 });
    vi.useRealTimers();
  });

  it('surfaces X-PAT-Disabled as AUTH error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, statusText: 'OK',
      headers: {
        get: (n: string) => {
          if (n === 'X-PAT-Disabled') return '1';
          if (n === 'X-PAT-Disabled-Note') return 'Revoked by admin';
          if (n.toLowerCase() === 'content-type') return 'application/json';
          return null;
        },
      },
      json: async () => ({ id: 6 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new MediagraphClient({
      getAuth: async () => ({ mode: 'basic', pat: 'tok', organizationId: 1 }),
    });
    const err = await client.getAsset(6).catch(e => e);
    expect(err).toBeInstanceOf(MediagraphApiError);
    expect(err.statusCode).toBe(401);
    expect(err.patDisabled).toBe(true);
    expect(err.message).toMatch(/Revoked by admin/);
  });
});

describe('api/client streaming upload', () => {
  it('rejects files larger than the 5 GB single-PUT cap with a clear error', async () => {
    const { mkdtempSync, openSync, closeSync, ftruncateSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'mg-upload-'));
    const path = join(dir, 'huge.bin');
    // Sparse file: appears 6 GB to stat() but takes ~0 disk space.
    const fd = openSync(path, 'w');
    ftruncateSync(fd, 6 * 1024 * 1024 * 1024);
    closeSync(fd);

    const client = new MediagraphClient({ getAccessToken: async () => 'tok' });
    await expect(
      client.uploadFileToSignedUrl('https://x.test/signed', path, 'application/octet-stream'),
    ).rejects.toThrow(/single-PUT S3 limit is 5 GB|Multipart upload requires server-side support/);

    rmSync(dir, { recursive: true, force: true });
  });

  it('streams a small file successfully and sets Content-Length', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'mg-upload-'));
    const path = join(dir, 'small.bin');
    writeFileSync(path, 'hello world');

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK', text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);

    const client = new MediagraphClient({ getAccessToken: async () => 'tok' });
    await client.uploadFileToSignedUrl('https://x.test/signed', path, 'text/plain');

    // Verify call shape — content-length, content-type, and the duplex flag
    // that signals to undici we're streaming the body.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit & { duplex?: string; headers: Record<string, string> };
    expect(init.method).toBe('PUT');
    expect(init.headers['Content-Type']).toBe('text/plain');
    expect(init.headers['Content-Length']).toBe('11');
    expect(init.duplex).toBe('half');
    // body is a ReadableStream when streaming — verify type rather than content,
    // since our mock fetch never drains it.
    expect(init.body).toBeInstanceOf(ReadableStream);

    rmSync(dir, { recursive: true, force: true });
  });

  it('retries idempotently on transient 5xx and succeeds', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'mg-upload-'));
    const path = join(dir, 'small.bin');
    writeFileSync(path, 'retry me');

    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable', text: async () => 'down' })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);

    const client = new MediagraphClient({ getAccessToken: async () => 'tok' });
    const promise = client.uploadFileToSignedUrl('https://x.test/signed', path, 'text/plain', { maxRetries: 3 });
    await vi.advanceTimersByTimeAsync(2000);
    await expect(promise).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
    rmSync(dir, { recursive: true, force: true });
  });

  it('does not retry permanent errors (4xx)', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'mg-upload-'));
    const path = join(dir, 'small.bin');
    writeFileSync(path, 'no retry');

    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden', text: async () => 'access denied' });
    vi.stubGlobal('fetch', fetchMock);

    const client = new MediagraphClient({ getAccessToken: async () => 'tok' });
    await expect(
      client.uploadFileToSignedUrl('https://x.test/signed', path, 'text/plain', { maxRetries: 5 }),
    ).rejects.toThrow(/403/);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rmSync(dir, { recursive: true, force: true });
  });
});

describe('cli/wait', () => {
  const definition: ToolDefinition = {
    name: 'create_thing',
    description: 'd',
    inputSchema: { type: 'object', properties: {}, required: [] },
    _meta: {
      wait: { pollTool: 'get_thing', idField: 'id', statusField: 'state', terminal: ['done', 'failed'] },
    },
  };

  function ok(body: unknown): ToolResult {
    return { content: [{ type: 'text', text: JSON.stringify(body) }] };
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('returns the terminal state once status reaches a terminal value', async () => {
    const responses = [
      ok({ id: 1, state: 'queued' }),
      ok({ id: 1, state: 'running' }),
      ok({ id: 1, state: 'done', result: 'yay' }),
    ];
    const invoke = vi.fn().mockImplementation(async () => responses.shift()!);

    const promise = waitForTerminal(
      definition,
      { id: 1 },
      invoke,
      { client: {} as never },
      { timeoutMs: 600_000, pollMs: 10 },
    );
    await vi.advanceTimersByTimeAsync(60);
    const result = await promise;
    expect(result).toMatchObject({ id: 1, state: 'done' });
    expect(invoke).toHaveBeenCalledTimes(3);
  });

  it('throws WaitTimeout if it never reaches a terminal state', async () => {
    const invoke = vi.fn().mockResolvedValue(ok({ id: 1, state: 'running' }));
    const promise = waitForTerminal(
      definition,
      { id: 1 },
      invoke,
      { client: {} as never },
      { timeoutMs: 50, pollMs: 10 },
    );
    promise.catch(() => {/* swallow */});
    await vi.advanceTimersByTimeAsync(120);
    await expect(promise).rejects.toBeInstanceOf(WaitTimeout);
  });

  it('handles list-shaped poll responses (e.g. list_meta_downloads)', async () => {
    const meta: ToolDefinition = {
      ...definition,
      _meta: { wait: { pollTool: 'list_things', idField: 'guid', statusField: 'aasm_state', terminal: ['ready'] } },
    };
    const invoke = vi.fn()
      .mockResolvedValueOnce(ok([{ guid: 'abc', aasm_state: 'pending' }, { guid: 'xyz', aasm_state: 'ready' }]))
      .mockResolvedValueOnce(ok([{ guid: 'abc', aasm_state: 'ready' }]));

    const promise = waitForTerminal(
      meta,
      { guid: 'abc' },
      invoke,
      { client: {} as never },
      { timeoutMs: 600_000, pollMs: 10 },
    );
    await vi.advanceTimersByTimeAsync(60);
    const result = await promise;
    expect(result).toEqual([{ guid: 'abc', aasm_state: 'ready' }]);
  });
});
