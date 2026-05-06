/**
 * Tests for `mediagraph watch` — focused on pure logic (arg parsing, URL
 * derivation, terminal predicates). The WS subscription itself is exercised
 * by live smoke tests, not unit tests.
 */

import { describe, it, expect, vi } from 'vitest';

// We need to call private helpers, so re-export-by-test by using dynamic
// import + casting. Keep watch.ts surface narrow; this is intentional.
import { CliError } from '../cli/errors.js';

// Spawn a mock runtime + client so runWatchCli can be exercised without a network.
import { runWatchCli } from '../cli/watch.js';
import type { Runtime } from '../core/runtime.js';

function fakeRuntime(overrides: Partial<{
  bulkJob: Record<string, unknown>;
  upload: Record<string, unknown>;
  asset: Record<string, unknown>;
  metaImport: Record<string, unknown>;
  tagImport: Record<string, unknown>;
  ingestion: Record<string, unknown>;
  shareStatus: Record<string, unknown>;
  bulkUploadStatus: Record<string, unknown>;
  metaDownload: Record<string, unknown>;
}> = {}): Runtime {
  return {
    client: {
      refreshJwt: vi.fn().mockRejectedValue(new Error('no JWT — forcing polling')),
      getBulkJob: vi.fn().mockResolvedValue(overrides.bulkJob ?? { aasm_state: 'processed', guid: 'g1', progress: 100 }),
      getUpload: vi.fn().mockResolvedValue(overrides.upload ?? { id: 1, done_at: '2026-05-05T00:00:00Z' }),
      getAsset: vi.fn().mockResolvedValue(overrides.asset ?? { id: 1, head: { aasm_state: 'processed' } }),
      getMetaImport: vi.fn().mockResolvedValue(overrides.metaImport ?? { id: 1, aasm_state: 'processed' }),
      getTagImport: vi.fn().mockResolvedValue(overrides.tagImport ?? { id: 1, aasm_state: 'processed' }),
      getIngestion: vi.fn().mockResolvedValue(overrides.ingestion ?? { id: 1, aasm_state: 'processed' }),
      getShareStatus: vi.fn().mockResolvedValue(overrides.shareStatus ?? { aasm_state: 'processed', progress: 100, code: 'abc', url: 'https://x' }),
      getBulkUploadStatus: vi.fn().mockResolvedValue(overrides.bulkUploadStatus ?? { aasm_state: 'completed', completed_at: '2026-05-05T00:00:00Z' }),
      getMetaDownload: vi.fn().mockResolvedValue(overrides.metaDownload ?? { id: 1, aasm_state: 'processed', file_url: 'https://x.csv' }),
    },
    config: { patOrganizationId: 53 },
    tokenStore: { load: () => ({ organizationId: 53 }) },
    getAuth: async () => ({ mode: 'bearer', token: 'tok' }),
  } as unknown as Runtime;
}

describe('runWatchCli — argument parsing', () => {
  it('rejects missing positional args', async () => {
    await expect(runWatchCli([], fakeRuntime())).rejects.toBeInstanceOf(CliError);
    await expect(runWatchCli(['bulk_job'], fakeRuntime())).rejects.toBeInstanceOf(CliError);
  });

  it('rejects unknown watch type', async () => {
    await expect(runWatchCli(['mystery', 'abc'], fakeRuntime())).rejects.toMatchObject({
      code: 'BAD_ARGS',
      message: expect.stringMatching(/Unknown watch type/),
    });
  });

  it('rejects unknown flags', async () => {
    await expect(runWatchCli(['bulk_job', 'g1', '--no-such-flag'], fakeRuntime())).rejects.toMatchObject({
      code: 'BAD_ARGS',
    });
  });
});

describe('runWatchCli — polling fallback (terminal-state happy path)', () => {
  it('bulk_job returns immediately when first poll is terminal', async () => {
    const runtime = fakeRuntime({
      bulkJob: { aasm_state: 'processed', guid: 'g1', progress: 100, total_count: 5 },
    });
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await runWatchCli(['bulk_job', 'g1', '--poll-only', '--poll-interval', '1'], runtime);

    expect(runtime.client.getBulkJob).toHaveBeenCalledWith('g1');
    const lines = writeSpy.mock.calls.map(c => String(c[0]));
    expect(lines.length).toBeGreaterThan(0);
    const event = JSON.parse(lines[0]);
    expect(event).toMatchObject({ type: 'poll', id: 'g1', aasm_state: 'processed' });

    writeSpy.mockRestore();
  });

  it('upload terminal on done_at presence', async () => {
    const runtime = fakeRuntime({
      upload: { id: 1, done_at: '2026-05-05T00:00:00Z', aasm_state: 'completed' },
    });
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await runWatchCli(['upload', '1', '--poll-only'], runtime);

    expect(runtime.client.getUpload).toHaveBeenCalledWith('1');
    const lines = writeSpy.mock.calls.map(c => String(c[0]));
    // Snapshot's own `id` (number) wins over the watch arg id (string) — expected.
    expect(JSON.parse(lines[0])).toMatchObject({ type: 'poll', done_at: expect.any(String) });

    writeSpy.mockRestore();
  });

  it('falls back to polling automatically when WS auth fails', async () => {
    const runtime = fakeRuntime({
      bulkJob: { aasm_state: 'processed', guid: 'g1', progress: 100 },
    });
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    // No --poll-only, but refreshJwt throws → fallback to polling.
    await runWatchCli(['bulk_job', 'g1'], runtime);

    expect(runtime.client.refreshJwt).toHaveBeenCalled();
    expect(runtime.client.getBulkJob).toHaveBeenCalled();
    // The fallback meta line is emitted on stderr.
    const errOut = errSpy.mock.calls.map(c => String(c[0])).join('');
    expect(errOut).toMatch(/fallback.*polling/);

    writeSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('--ws-only surfaces NETWORK error instead of falling back', async () => {
    const runtime = fakeRuntime();
    await expect(runWatchCli(['bulk_job', 'g1', '--ws-only', '--timeout', '1'], runtime))
      .rejects.toMatchObject({ code: 'NETWORK' });
  });
});

describe('runWatchCli — additional types (polling terminal detection)', () => {
  const cases = [
    { type: 'asset', clientMethod: 'getAsset' },
    { type: 'meta_import', clientMethod: 'getMetaImport' },
    { type: 'tag_import', clientMethod: 'getTagImport' },
    { type: 'ingestion', clientMethod: 'getIngestion' },
    { type: 'share', clientMethod: 'getShareStatus' },
    { type: 'bulk_upload', clientMethod: 'getBulkUploadStatus' },
    { type: 'meta_download', clientMethod: 'getMetaDownload' },
  ] as const;

  for (const c of cases) {
    it(`${c.type} polling exits on terminal default snapshot`, async () => {
      const runtime = fakeRuntime();
      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      await runWatchCli([c.type, '1', '--poll-only', '--poll-interval', '0'], runtime);
      expect((runtime.client as unknown as Record<string, ReturnType<typeof vi.fn>>)[c.clientMethod]).toHaveBeenCalled();
    });
  }
});

describe('runWatchCli — polling timeout', () => {
  it('times out when polled state never goes terminal', async () => {
    const runtime = fakeRuntime({
      bulkJob: { aasm_state: 'processing', guid: 'g1', progress: 50 },
    });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(
      runWatchCli(['bulk_job', 'g1', '--poll-only', '--timeout', '0', '--poll-interval', '0'], runtime),
    ).rejects.toMatchObject({ code: 'TOOL_ERROR', message: expect.stringMatching(/timed out/) });
  });
});
