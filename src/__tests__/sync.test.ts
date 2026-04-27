/**
 * Sync system tests.
 *
 * Strategy:
 *   - Override HOME to a per-test tmp dir so config/state files don't clobber
 *     the user's real ~/.mediagraph directory.
 *   - Mock the MediagraphClient methods used by walker/download/upload — we
 *     test the reconciliation logic, not the HTTP client (covered elsewhere).
 *   - Stub global.fetch for the download path that hits a signed URL.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { saveConfig, loadConfig, listSyncs, deleteSync, type SyncConfig } from '../sync/config.js';
import { saveState, loadState, commitEntry, emptyState } from '../sync/state.js';
import { acquireLock, SyncLockedError } from '../sync/lock.js';
import { walkRemote } from '../sync/walker.js';
import { runDownload } from '../sync/download.js';
import { runUpload } from '../sync/upload.js';
import { runTwoWay } from '../sync/two_way.js';
import { searchTools } from '../cli/search.js';
import { configPath, lockPath, statePath, syncDir } from '../sync/paths.js';

let tmpHome: string;
let originalSyncRoot: string | undefined;

beforeEach(() => {
  originalSyncRoot = process.env.MEDIAGRAPH_SYNC_ROOT;
  tmpHome = mkdtempSync(join(tmpdir(), 'mg-sync-test-'));
  // Point the sync layer at the tmp dir. We override the sync root directly
  // (not HOME) because os.homedir() ignores HOME on most platforms.
  process.env.MEDIAGRAPH_SYNC_ROOT = join(tmpHome, '.mediagraph', 'sync');
});

afterEach(() => {
  if (originalSyncRoot === undefined) delete process.env.MEDIAGRAPH_SYNC_ROOT;
  else process.env.MEDIAGRAPH_SYNC_ROOT = originalSyncRoot;
  rmSync(tmpHome, { recursive: true, force: true });
});

function makeConfig(overrides: Partial<SyncConfig> = {}): SyncConfig {
  return {
    name: 'test1',
    mode: 'download',
    storageFolderId: 100,
    localPath: join(tmpHome, 'local'),
    size: 'original',
    frequency: 'manual',
    prune: false,
    ...overrides,
  };
}

describe('sync/config', () => {
  it('saves and loads a config round-trip', () => {
    const cfg = makeConfig({ description: 'hi' });
    saveConfig(cfg);
    expect(existsSync(configPath('test1'))).toBe(true);
    expect(loadConfig('test1')).toEqual(cfg);
  });

  it('lists all configured syncs sorted by name', () => {
    saveConfig(makeConfig({ name: 'beta' }));
    saveConfig(makeConfig({ name: 'alpha' }));
    expect(listSyncs().map(s => s.name)).toEqual(['alpha', 'beta']);
  });

  it('rejects invalid sync names', () => {
    expect(() => saveConfig(makeConfig({ name: '../etc/passwd' }))).toThrow(/Invalid sync name/);
    expect(() => saveConfig(makeConfig({ name: 'has spaces' }))).toThrow(/Invalid sync name/);
  });

  it('throws on load when sync does not exist', () => {
    expect(() => loadConfig('missing')).toThrow(/not found/);
  });

  it('removes the sync directory on delete', () => {
    saveConfig(makeConfig());
    expect(existsSync(syncDir('test1'))).toBe(true);
    deleteSync('test1');
    expect(existsSync(syncDir('test1'))).toBe(false);
  });
});

describe('sync/state', () => {
  it('returns empty state when none exists', () => {
    const state = loadState('fresh');
    expect(state).toEqual(emptyState());
  });

  it('persists entries through save/load', () => {
    const state = emptyState();
    state.entries['1'] = { assetId: 1, relativePath: 'a/b.jpg', versionNumber: 3, phase: 'done' };
    saveState('test1', state);
    expect(loadState('test1').entries['1']).toMatchObject({ assetId: 1, versionNumber: 3 });
  });

  it('atomic-writes: a corrupt state.json.tmp does not break loadState', () => {
    saveConfig(makeConfig());
    saveState('test1', emptyState());
    writeFileSync(`${statePath('test1')}.tmp`, 'BROKEN', 'utf-8');
    expect(() => loadState('test1')).not.toThrow();
  });

  it('commitEntry writes through to disk on every call', () => {
    const state = emptyState();
    commitEntry('test1', state, '1', { assetId: 1, relativePath: 'x.jpg', phase: 'done' });
    const reread = loadState('test1');
    expect(reread.entries['1']?.assetId).toBe(1);
  });

  it('rejects unknown schema versions', () => {
    saveConfig(makeConfig());
    mkdirSync(syncDir('test1'), { recursive: true });
    writeFileSync(statePath('test1'), JSON.stringify({ schemaVersion: 99, entries: {} }));
    expect(() => loadState('test1')).toThrow(/schema version/);
  });
});

describe('sync/lock', () => {
  it('acquires and releases a lock', () => {
    saveConfig(makeConfig());
    const lock = acquireLock('test1');
    expect(existsSync(lockPath('test1'))).toBe(true);
    lock.release();
    expect(existsSync(lockPath('test1'))).toBe(false);
  });

  it('rejects a lock held by a different live process', () => {
    saveConfig(makeConfig());
    // Use parent pid — guaranteed alive (it's running this test) and not us.
    mkdirSync(syncDir('test1'), { recursive: true });
    writeFileSync(lockPath('test1'), `${process.ppid}\n`);
    expect(() => acquireLock('test1')).toThrow(SyncLockedError);
  });

  it('clears a stale lock from a dead PID', () => {
    saveConfig(makeConfig());
    mkdirSync(syncDir('test1'), { recursive: true });
    // Pick a PID that is almost certainly not alive.
    writeFileSync(lockPath('test1'), '999999\n');
    const lock = acquireLock('test1');
    expect(readFileSync(lockPath('test1'), 'utf-8').trim()).toBe(String(process.pid));
    lock.release();
  });
});

describe('sync/walker', () => {
  it('walks a folder and yields assets with mirrored relative paths', async () => {
    const client = {
      getStorageFolder: vi.fn().mockResolvedValue({ id: 100, name: 'root' }),
      listStorageFolders: vi.fn()
        .mockResolvedValueOnce([{ id: 200, name: 'sub' }])
        .mockResolvedValueOnce([]),
      searchAssets: vi.fn()
        // root folder, page 1
        .mockResolvedValueOnce({ assets: [{ id: 1, filename: 'a.jpg', data_version_number: 1 }], total: 1 })
        // sub folder, page 1
        .mockResolvedValueOnce({ assets: [{ id: 2, filename: 'b.jpg', data_version_number: 1 }], total: 1 }),
    } as unknown as Parameters<typeof walkRemote>[0];

    const out: { id: number; path: string }[] = [];
    for await (const { asset, relativePath } of walkRemote(client, { rootFolderId: 100 })) {
      out.push({ id: asset.id, path: relativePath });
    }
    expect(out).toEqual([
      { id: 1, path: 'root/a.jpg' },
      { id: 2, path: 'root/sub/b.jpg' },
    ]);
  });
});

describe('sync/download', () => {
  it('downloads new + version-bumped assets, skips unchanged, writes atomically', async () => {
    saveConfig(makeConfig({ localPath: join(tmpHome, 'local') }));

    // mockImplementation returns a *fresh* ReadableStream on every call —
    // streams are consumed once, so a static mockResolvedValue would only
    // work for the first download.
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ({
      ok: true, status: 200, statusText: 'OK',
      body: streamFromBytes(Buffer.from('FILE-CONTENT')),
    })));

    const client = {
      getStorageFolder: vi.fn().mockResolvedValue({ id: 100, name: 'root' }),
      listStorageFolders: vi.fn().mockResolvedValue([]),
      searchAssets: vi.fn().mockResolvedValue({
        assets: [
          { id: 1, filename: 'a.jpg', data_version_number: 1 },
          { id: 2, filename: 'b.jpg', data_version_number: 1 },
        ],
        total: 2,
      }),
      getAssetDownload: vi.fn().mockResolvedValue({ url: 'https://example.test/signed', filename: 'x' }),
    } as never;

    const result = await runDownload(loadConfig('test1'), client, () => {});
    expect(result.scanned).toBe(2);
    expect(result.downloaded).toBe(2);
    expect(result.skipped).toBe(0);
    expect(existsSync(join(tmpHome, 'local', 'root', 'a.jpg'))).toBe(true);
    expect(readFileSync(join(tmpHome, 'local', 'root', 'a.jpg'), 'utf-8')).toBe('FILE-CONTENT');

    // Second run: same versions, should skip both.
    const result2 = await runDownload(loadConfig('test1'), client, () => {});
    expect(result2.skipped).toBe(2);
    expect(result2.downloaded).toBe(0);
  });

  it('re-downloads when data_version_number bumps', async () => {
    saveConfig(makeConfig({ localPath: join(tmpHome, 'local') }));
    let bytes = Buffer.from('v1');
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true, status: 200, statusText: 'OK',
      body: streamFromBytes(bytes),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const client = {
      getStorageFolder: vi.fn().mockResolvedValue({ id: 100, name: 'root' }),
      listStorageFolders: vi.fn().mockResolvedValue([]),
      searchAssets: vi.fn()
        .mockResolvedValueOnce({ assets: [{ id: 1, filename: 'a.jpg', data_version_number: 1 }], total: 1 })
        .mockResolvedValueOnce({ assets: [{ id: 1, filename: 'a.jpg', data_version_number: 2 }], total: 1 }),
      getAssetDownload: vi.fn().mockResolvedValue({ url: 'https://example.test/signed', filename: 'a' }),
    } as never;

    await runDownload(loadConfig('test1'), client, () => {});
    bytes = Buffer.from('v2');
    const r2 = await runDownload(loadConfig('test1'), client, () => {});
    expect(r2.downloaded).toBe(1);
    expect(readFileSync(join(tmpHome, 'local', 'root', 'a.jpg'), 'utf-8')).toBe('v2');
  });

  it('does not redownload when only metadata changes (version unchanged)', async () => {
    saveConfig(makeConfig({ localPath: join(tmpHome, 'local') }));
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ({
      ok: true, status: 200, statusText: 'OK',
      body: streamFromBytes(Buffer.from('original')),
    })));
    const search = vi.fn()
      // first run
      .mockResolvedValueOnce({ assets: [{ id: 1, filename: 'a.jpg', data_version_number: 5, description: 'old' }], total: 1 })
      // second run: description changed but version_number is the same
      .mockResolvedValueOnce({ assets: [{ id: 1, filename: 'a.jpg', data_version_number: 5, description: 'new' }], total: 1 });
    const client = {
      getStorageFolder: vi.fn().mockResolvedValue({ id: 100, name: 'root' }),
      listStorageFolders: vi.fn().mockResolvedValue([]),
      searchAssets: search,
      getAssetDownload: vi.fn().mockResolvedValue({ url: 'https://example.test/x', filename: 'a' }),
    } as never;

    await runDownload(loadConfig('test1'), client, () => {});
    const r2 = await runDownload(loadConfig('test1'), client, () => {});
    expect(r2.downloaded).toBe(0);
    expect(r2.skipped).toBe(1);
  });

  it('prunes locally-vanished remote assets when prune=true', async () => {
    saveConfig(makeConfig({ localPath: join(tmpHome, 'local'), prune: true }));
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ({
      ok: true, status: 200, statusText: 'OK',
      body: streamFromBytes(Buffer.from('x')),
    })));

    const search = vi.fn()
      .mockResolvedValueOnce({ assets: [{ id: 1, filename: 'a.jpg', data_version_number: 1 }, { id: 2, filename: 'b.jpg', data_version_number: 1 }], total: 2 })
      .mockResolvedValueOnce({ assets: [{ id: 1, filename: 'a.jpg', data_version_number: 1 }], total: 1 });
    const client = {
      getStorageFolder: vi.fn().mockResolvedValue({ id: 100, name: 'root' }),
      listStorageFolders: vi.fn().mockResolvedValue([]),
      searchAssets: search,
      getAssetDownload: vi.fn().mockResolvedValue({ url: 'https://example.test/x', filename: 'x' }),
    } as never;

    await runDownload(loadConfig('test1'), client, () => {});
    expect(existsSync(join(tmpHome, 'local', 'root', 'b.jpg'))).toBe(true);
    const r2 = await runDownload(loadConfig('test1'), client, () => {});
    expect(r2.pruned).toBe(1);
    expect(existsSync(join(tmpHome, 'local', 'root', 'b.jpg'))).toBe(false);
  });
});

describe('sync/upload', () => {
  it('uploads new files and skips unchanged on the next run', async () => {
    const localPath = join(tmpHome, 'local');
    mkdirSync(localPath, { recursive: true });
    writeFileSync(join(localPath, 'a.jpg'), 'AAA');

    saveConfig(makeConfig({ mode: 'upload', localPath }));

    const client = {
      canUpload: vi.fn().mockResolvedValue({ can_upload: true }),
      createUpload: vi.fn().mockResolvedValue({ id: 7, guid: 'upload-guid' }),
      prepareAssetUpload: vi.fn().mockResolvedValue({
        id: 42, guid: 'asset-guid', signed_upload_url: 'https://example.test/s3',
      }),
      uploadToSignedUrl: vi.fn().mockResolvedValue(undefined),
      setAssetUploaded: vi.fn().mockResolvedValue({ id: 42 }),
      setUploadDone: vi.fn().mockResolvedValue({ id: 7 }),
    } as never;

    const result = await runUpload(loadConfig('test1'), client, () => {});
    expect(result.scanned).toBe(1);
    expect(result.uploaded).toBe(1);

    const result2 = await runUpload(loadConfig('test1'), client, () => {});
    expect(result2.uploaded).toBe(0);
    expect(result2.skipped).toBe(1);
  });

  it('re-uploads when content changes but skips on touch (same hash, new mtime)', async () => {
    const localPath = join(tmpHome, 'local');
    mkdirSync(localPath, { recursive: true });
    const file = join(localPath, 'a.jpg');
    writeFileSync(file, 'AAA');
    saveConfig(makeConfig({ mode: 'upload', localPath }));

    const client = makeUploadClient();
    await runUpload(loadConfig('test1'), client as never, () => {});
    const before = client.prepareAssetUpload.mock.calls.length;

    // Touch with same content
    const stat = statSync(file);
    const newMtime = new Date(stat.mtimeMs + 5000);
    require('node:fs').utimesSync(file, newMtime, newMtime);
    const r2 = await runUpload(loadConfig('test1'), client as never, () => {});
    expect(r2.uploaded).toBe(0);
    expect(client.prepareAssetUpload.mock.calls.length).toBe(before);

    // Change content
    writeFileSync(file, 'BBB');
    const r3 = await runUpload(loadConfig('test1'), client as never, () => {});
    expect(r3.uploaded).toBe(1);
  });

  it('refuses to run when canUpload is false', async () => {
    const localPath = join(tmpHome, 'local');
    mkdirSync(localPath, { recursive: true });
    writeFileSync(join(localPath, 'a.jpg'), 'AAA');
    saveConfig(makeConfig({ mode: 'upload', localPath }));

    const client = {
      canUpload: vi.fn().mockResolvedValue({ can_upload: false, reason: 'quota' }),
    } as never;
    await expect(runUpload(loadConfig('test1'), client, () => {})).rejects.toThrow(/quota/);
  });
});

describe('sync/two_way', () => {
  it('detects local-only edits and uploads them as a new version', async () => {
    const localPath = join(tmpHome, 'local');
    mkdirSync(join(localPath, 'root'), { recursive: true });
    const file = join(localPath, 'root', 'a.jpg');
    writeFileSync(file, 'EDITED');

    saveConfig(makeConfig({ mode: 'two-way', localPath }));

    // Pre-populate state to look like we'd previously synced version 1 with a different hash.
    const state = emptyState();
    state.entries['1'] = {
      assetId: 1,
      relativePath: 'root/a.jpg',
      versionNumber: 1,
      localHash: 'OLD-HASH-THAT-WONT-MATCH',
      localMtime: 0,
      phase: 'done',
    };
    saveState('test1', state);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    }));

    const client = {
      getStorageFolder: vi.fn().mockResolvedValue({ id: 100, name: 'root' }),
      listStorageFolders: vi.fn().mockResolvedValue([]),
      searchAssets: vi.fn().mockResolvedValue({
        assets: [{ id: 1, filename: 'a.jpg', data_version_number: 1 }],
        total: 1,
      }),
      getAsset: vi.fn().mockResolvedValue({ id: 1, filename: 'a.jpg', data_version_number: 2 }),
      createUpload: vi.fn().mockResolvedValue({ id: 7, guid: 'u' }),
      prepareAssetUpload: vi.fn().mockResolvedValue({ id: 1, guid: 'a', signed_upload_url: 'https://x.test/s' }),
      uploadToSignedUrl: vi.fn().mockResolvedValue(undefined),
      setAssetUploaded: vi.fn().mockResolvedValue({}),
      setUploadDone: vi.fn().mockResolvedValue({}),
      getAssetDownload: vi.fn().mockResolvedValue({ url: 'https://x.test/d', filename: 'a' }),
    } as never;

    const result = await runTwoWay(loadConfig('test1'), client, () => {});
    expect(result.uploaded).toBe(1);
    expect(result.downloaded).toBe(0);
    expect(result.conflicts.length).toBe(0);
  });

  it('writes a .conflict file and uploads local when both sides changed', async () => {
    const localPath = join(tmpHome, 'local');
    mkdirSync(join(localPath, 'root'), { recursive: true });
    const file = join(localPath, 'root', 'a.jpg');
    writeFileSync(file, 'LOCAL-EDIT');

    saveConfig(makeConfig({ mode: 'two-way', localPath }));
    const state = emptyState();
    state.entries['1'] = {
      assetId: 1, relativePath: 'root/a.jpg', versionNumber: 1,
      localHash: 'OLD', localMtime: 0, phase: 'done',
    };
    saveState('test1', state);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode('REMOTE-EDIT').buffer),
    }));

    const client = {
      getStorageFolder: vi.fn().mockResolvedValue({ id: 100, name: 'root' }),
      listStorageFolders: vi.fn().mockResolvedValue([]),
      searchAssets: vi.fn().mockResolvedValue({
        assets: [{ id: 1, filename: 'a.jpg', data_version_number: 5 }],
        total: 1,
      }),
      getAsset: vi.fn().mockResolvedValue({ id: 1, filename: 'a.jpg', data_version_number: 6 }),
      createUpload: vi.fn().mockResolvedValue({ id: 7, guid: 'u' }),
      prepareAssetUpload: vi.fn().mockResolvedValue({ id: 1, guid: 'a', signed_upload_url: 'https://x.test/s' }),
      uploadToSignedUrl: vi.fn().mockResolvedValue(undefined),
      setAssetUploaded: vi.fn().mockResolvedValue({}),
      setUploadDone: vi.fn().mockResolvedValue({}),
      getAssetDownload: vi.fn().mockResolvedValue({ url: 'https://x.test/d', filename: 'a' }),
    } as never;

    const result = await runTwoWay(loadConfig('test1'), client, () => {});
    expect(result.conflicts.length).toBe(1);
    expect(existsSync(join(tmpHome, 'local', 'root', 'a.jpg.conflict-v5'))).toBe(true);
    expect(readFileSync(file, 'utf-8')).toBe('LOCAL-EDIT'); // local kept
  });
});

describe('cli/search', () => {
  it('finds a tool by exact name', () => {
    const hits = searchTools('search_assets');
    expect(hits[0].name).toBe('search_assets');
  });

  it('ranks token matches: name > description', () => {
    const hits = searchTools('rename');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].name).toMatch(/rename/);
  });

  it('returns empty for stopword-only queries', () => {
    expect(searchTools('the and of')).toEqual([]);
  });

  it('respects the limit argument', () => {
    const hits = searchTools('asset', 3);
    expect(hits.length).toBeLessThanOrEqual(3);
  });

  it('matches a flag/property name (e.g., "watermark")', () => {
    const hits = searchTools('watermark');
    expect(hits.length).toBeGreaterThan(0);
  });
});

// --- helpers --------------------------------------------------------------

function makeUploadClient() {
  return {
    canUpload: vi.fn().mockResolvedValue({ can_upload: true }),
    createUpload: vi.fn().mockResolvedValue({ id: 7, guid: 'u' }),
    prepareAssetUpload: vi.fn().mockResolvedValue({
      id: 42, guid: 'a', signed_upload_url: 'https://x.test/s',
    }),
    uploadToSignedUrl: vi.fn().mockResolvedValue(undefined),
    setAssetUploaded: vi.fn().mockResolvedValue({ id: 42 }),
    setUploadDone: vi.fn().mockResolvedValue({ id: 7 }),
  };
}

function streamFromBytes(buf: Buffer): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(buf));
      controller.close();
    },
  });
}
