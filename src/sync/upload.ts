/**
 * Upload-only reconciliation.
 *
 * Walk the local directory, hash each file, and:
 *   - new file (no state entry, hash unknown to remote) -> upload
 *   - existing entry, same hash, same mtime              -> skip
 *   - existing entry, different hash                     -> upload as new version
 *
 * Folder structure is mirrored by setting `path` on the upload-asset
 * registration, so the remote storage folder hierarchy matches the local
 * directory layout.
 *
 * The actual upload uses the existing client.prepareAssetUpload + signed S3
 * PUT + setAssetUploaded pipeline.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative as relPath, join, sep } from 'node:path';

import type { MediagraphClient } from '../api/client.js';
import type { Upload } from '../api/types/uploads.js';
import type { SyncConfig } from './config.js';
import { ensureLocalPath } from './config.js';
import { commitEntry, loadState, saveState, type AssetEntry, type SyncState } from './state.js';

export interface UploadRunResult {
  scanned: number;
  uploaded: number;
  skipped: number;
  errors: Array<{ relativePath: string; error: string }>;
  durationMs: number;
  uploadGuid?: string;
}

export async function runUpload(
  config: SyncConfig,
  client: MediagraphClient,
  log: (msg: string) => void,
): Promise<UploadRunResult> {
  const startedAt = Date.now();
  ensureLocalPath(config.localPath);

  const state = loadState(config.name);
  resetInFlight(state);

  const result: UploadRunResult = {
    scanned: 0,
    uploaded: 0,
    skipped: 0,
    errors: [],
    durationMs: 0,
  };

  // Pre-flight quota check
  const can = await client.canUpload();
  if (!can.can_upload) {
    throw new Error(`Upload disallowed by server: ${can.reason || 'unknown reason'}`);
  }

  // Reuse one upload "session" for the run so all files end up in the same
  // batch on the server side (matches Mediagraph's upload UX).
  const session: { upload: Upload | null } = { upload: null };
  const ensureUpload = async (): Promise<Upload> => {
    if (session.upload) return session.upload;
    const created = await client.createUpload({ name: `mediagraph-sync ${config.name} ${new Date().toISOString()}` });
    session.upload = created;
    result.uploadGuid = created.guid;
    return created;
  };

  for (const file of walkLocal(config.localPath)) {
    result.scanned += 1;
    const relativePath = file.relativePath;
    const absolute = join(config.localPath, relativePath);
    const stat = statSync(absolute);
    if (!stat.isFile()) continue;

    const key = relativePath;
    const existing = state.entries[key];
    if (existing && existing.phase === 'done' && existing.localMtime === stat.mtimeMs) {
      result.skipped += 1;
      continue;
    }

    const hash = sha256Sync(absolute);
    if (existing && existing.phase === 'done' && existing.localHash === hash) {
      // mtime changed but content didn't (e.g., touch). Refresh mtime and skip.
      existing.localMtime = stat.mtimeMs;
      commitEntry(config.name, state, key, existing);
      result.skipped += 1;
      continue;
    }

    const entry: AssetEntry = {
      ...(existing ?? {}),
      relativePath,
      localHash: hash,
      localMtime: stat.mtimeMs,
      phase: 'in_flight',
    };
    commitEntry(config.name, state, key, entry);

    try {
      const upload = await ensureUpload();
      log(`upload: ${relativePath} (${stat.size} bytes)`);
      const filename = relativePath.split(sep).pop() || relativePath;
      const dirPath = relativePath.includes(sep) ? relativePath.slice(0, -filename.length - 1) : '';

      const prepared = await client.prepareAssetUpload(upload.guid, {
        filename,
        file_size: stat.size,
        path: dirPath || undefined,
        created_via: 'mediagraph-sync',
        created_via_id: config.name,
      });

      await client.uploadToSignedUrl(prepared.signed_upload_url, readFileSync(absolute), guessContentType(filename));
      await client.setAssetUploaded(prepared.guid, true);

      entry.assetId = prepared.id;
      entry.phase = 'done';
      entry.syncedAt = new Date().toISOString();
      entry.error = undefined;
      commitEntry(config.name, state, key, entry);
      result.uploaded += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      entry.phase = 'error';
      entry.error = message;
      commitEntry(config.name, state, key, entry);
      result.errors.push({ relativePath, error: message });
      log(`error: ${relativePath} — ${message}`);
    }
  }

  if (session.upload) {
    try { await client.setUploadDone(session.upload.id); } catch (e) {
      log(`warn: setUploadDone failed: ${(e as Error).message}`);
    }
  }

  state.lastRunAt = new Date().toISOString();
  state.lastRunOutcome = result.errors.length === 0 ? 'ok' : (result.uploaded > 0 ? 'partial' : 'error');
  saveState(config.name, state);
  result.durationMs = Date.now() - startedAt;
  return result;
}

function resetInFlight(state: SyncState): void {
  for (const entry of Object.values(state.entries)) {
    if (entry.phase === 'in_flight') entry.phase = 'pending';
  }
}

function* walkLocal(root: string): Generator<{ relativePath: string }, void, void> {
  const stack: string[] = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: import('node:fs').Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.name.startsWith('.')) continue; // skip dotfiles
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile()) {
        yield { relativePath: relPath(root, full) };
      }
    }
  }
}

function sha256Sync(path: string): string {
  const h = createHash('sha256');
  h.update(readFileSync(path));
  return h.digest('hex');
}

function guessContentType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() || '';
  switch (ext) {
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    case 'tif':
    case 'tiff': return 'image/tiff';
    case 'mp4': return 'video/mp4';
    case 'mov': return 'video/quicktime';
    case 'pdf': return 'application/pdf';
    default: return 'application/octet-stream';
  }
}
