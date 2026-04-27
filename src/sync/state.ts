/**
 * Per-sync durable state. Atomic writes via temp file + rename.
 *
 * Schema is intentionally flat — one record per asset (download mode) or per
 * local file (upload mode), keyed by a stable identifier:
 *   - download: keyed by remote asset id
 *   - upload:   keyed by relative local path
 *
 * Each entry carries a phase (`pending`, `in_flight`, `done`, `error`) so a
 * crashed run is resumable: on restart, anything in `in_flight` is retried.
 */

import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { statePath } from './paths.js';

export type Phase = 'pending' | 'in_flight' | 'done' | 'error';

export interface AssetEntry {
  /** Remote asset id (download) or null for pure-upload entries that haven't been registered yet */
  assetId?: number;
  /** Stable identifier for the local file: relative path under the sync root */
  relativePath: string;
  /** Last-applied data_version_number (download mode) */
  versionNumber?: number;
  /** SHA-256 of the local file (upload + two-way) */
  localHash?: string;
  /** Last filesystem mtime of the local file in ms */
  localMtime?: number;
  /** Last sync time in ISO 8601 */
  syncedAt?: string;
  /** Operation phase — survives crashes */
  phase: Phase;
  /** Last error message if phase === 'error' */
  error?: string;
}

export interface SyncState {
  schemaVersion: 1;
  /** Cursor for incremental fetches (server-side, opaque). Falls back to lastRunAt. */
  cursor?: string;
  lastRunAt?: string;
  lastRunOutcome?: 'ok' | 'partial' | 'error';
  /** Map keyed by `assetId` for download/two-way and by `relativePath` for upload-only. */
  entries: Record<string, AssetEntry>;
}

export function emptyState(): SyncState {
  return { schemaVersion: 1, entries: {} };
}

export function loadState(name: string): SyncState {
  const path = statePath(name);
  if (!existsSync(path)) return emptyState();
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as SyncState;
    if (parsed.schemaVersion !== 1) {
      throw new Error(`Unsupported state schema version: ${parsed.schemaVersion}`);
    }
    return parsed;
  } catch (e) {
    throw new Error(`Corrupt state for sync "${name}": ${(e as Error).message}`);
  }
}

/**
 * Atomic write: write to .tmp, fsync, rename over the live file.
 * `rename(2)` is atomic on POSIX within the same filesystem. We do not fsync
 * the directory entry — for a corrupt-on-power-loss guarantee we'd need that,
 * but a crashed run simply rolls back to the previous valid state file.
 */
export function saveState(name: string, state: SyncState): void {
  const path = statePath(name);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  const fd = openSync(tmp, 'w', 0o600);
  try {
    writeFileSync(fd, `${JSON.stringify(state, null, 2)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, path);
}

/**
 * Used by sync runners to mutate one entry at a time and commit.
 * Frequent commits trade IO for tighter crash recovery; that's the right
 * tradeoff for an asset-mirror tool — losing 100 ops on crash is bad,
 * losing 1 is fine.
 */
export function commitEntry(name: string, state: SyncState, key: string, entry: AssetEntry): void {
  state.entries[key] = entry;
  saveState(name, state);
}
