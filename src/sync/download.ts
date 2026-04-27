/**
 * Download-only reconciliation.
 *
 * For each remote asset:
 *   - first time seen          -> mark `pending`, download to mirrored path
 *   - data_version_number bumped -> mark `pending`, re-download (overwrites in place atomically)
 *   - same version              -> skip
 *
 * Metadata-only changes do NOT bump data_version_number, so they're correctly ignored.
 *
 * Atomic file write: download to `<path>.partial`, fsync, rename to `<path>`.
 *
 * Crash recovery: any entry left in `in_flight` from a previous run is reset
 * to `pending` at startup and retried.
 */

import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, renameSync, rmSync, statSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { MediagraphClient } from '../api/client.js';
import type { SyncConfig } from './config.js';
import { ensureLocalPath } from './config.js';
import { commitEntry, loadState, saveState, type AssetEntry, type SyncState } from './state.js';
import { walkRemote } from './walker.js';

export interface DownloadRunResult {
  scanned: number;
  downloaded: number;
  skipped: number;
  pruned: number;
  errors: Array<{ assetId: number; relativePath: string; error: string }>;
  durationMs: number;
}

export async function runDownload(
  config: SyncConfig,
  client: MediagraphClient,
  log: (msg: string) => void,
): Promise<DownloadRunResult> {
  const startedAt = Date.now();
  ensureLocalPath(config.localPath);

  const state = loadState(config.name);
  resetInFlight(state);

  const result: DownloadRunResult = {
    scanned: 0,
    downloaded: 0,
    skipped: 0,
    pruned: 0,
    errors: [],
    durationMs: 0,
  };

  const seenAssetIds = new Set<number>();

  for await (const { asset, relativePath } of walkRemote(client, { rootFolderId: config.storageFolderId })) {
    result.scanned += 1;
    seenAssetIds.add(asset.id);

    const key = String(asset.id);
    const existing = state.entries[key];
    const remoteVersion = asset.data_version_number ?? 0;

    if (existing && existing.phase === 'done' && existing.versionNumber === remoteVersion && fileExists(config.localPath, existing.relativePath)) {
      result.skipped += 1;
      continue;
    }

    const entry: AssetEntry = {
      assetId: asset.id,
      relativePath,
      versionNumber: remoteVersion,
      phase: 'in_flight',
    };
    commitEntry(config.name, state, key, entry);

    try {
      log(`download: ${relativePath} (v${remoteVersion})`);
      await downloadAsset(client, asset.id, remoteVersion, join(config.localPath, relativePath));
      entry.phase = 'done';
      entry.syncedAt = new Date().toISOString();
      try {
        entry.localMtime = statSync(join(config.localPath, relativePath)).mtimeMs;
      } catch { /* ignore */ }
      commitEntry(config.name, state, key, entry);
      result.downloaded += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      entry.phase = 'error';
      entry.error = message;
      commitEntry(config.name, state, key, entry);
      result.errors.push({ assetId: asset.id, relativePath, error: message });
      log(`error: ${relativePath} — ${message}`);
    }
  }

  if (config.prune) {
    for (const [key, entry] of Object.entries(state.entries)) {
      if (!entry.assetId) continue;
      if (seenAssetIds.has(entry.assetId)) continue;
      const localFile = join(config.localPath, entry.relativePath);
      if (existsSync(localFile)) {
        log(`prune: ${entry.relativePath}`);
        try { rmSync(localFile, { force: true }); } catch { /* ignore */ }
        result.pruned += 1;
      }
      delete state.entries[key];
    }
    saveState(config.name, state);
  }

  state.lastRunAt = new Date().toISOString();
  state.lastRunOutcome = result.errors.length === 0 ? 'ok' : (result.downloaded > 0 ? 'partial' : 'error');
  saveState(config.name, state);
  result.durationMs = Date.now() - startedAt;
  return result;
}

function resetInFlight(state: SyncState): void {
  for (const entry of Object.values(state.entries)) {
    if (entry.phase === 'in_flight') entry.phase = 'pending';
  }
}

function fileExists(root: string, relative: string): boolean {
  try {
    statSync(join(root, relative));
    return true;
  } catch {
    return false;
  }
}

async function downloadAsset(
  client: MediagraphClient,
  assetId: number,
  versionNumber: number,
  destination: string,
): Promise<void> {
  const { url } = await client.getAssetDownload(assetId, {
    size: 'original',
    version_number: versionNumber || undefined,
    via: 'mediagraph-sync',
    skip_meta: true,
  });

  mkdirSync(dirname(destination), { recursive: true });
  const partial = `${destination}.partial`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download HTTP ${response.status}: ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error('Download response had no body');
  }

  const fd = openSync(partial, 'w', 0o644);
  try {
    const reader = response.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) writeSync(fd, value);
    }
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(partial, destination);
}
