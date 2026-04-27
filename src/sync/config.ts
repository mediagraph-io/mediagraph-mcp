/**
 * Sync registry: per-sync config persisted at ~/.mediagraph/sync/<name>/config.json.
 *
 * One config = one named sync between a remote storage-folder subtree and a
 * local directory. Multiple syncs can coexist (e.g., a "stock-photos" pull
 * and a "field-uploads" push).
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

import { configPath, sanitize, syncDir, syncRoot } from './paths.js';

export type SyncMode = 'download' | 'upload' | 'two-way';
export type Frequency = 'manual' | 'hourly' | 'nightly' | 'every-15-min';

export interface SyncConfig {
  name: string;
  mode: SyncMode;
  /** Remote storage folder ID. `null` means "the org root" (all top-level folders). */
  storageFolderId: number | null;
  /** Absolute local directory. Will be created on first run. */
  localPath: string;
  /** Renditions to download (default: original only). Future-proofing. */
  size: 'original' | 'large' | 'small';
  /** Schedule hint for the installer; not enforced by `run` itself. */
  frequency: Frequency;
  /** When true, deletions on the source side are mirrored locally. Off by default. */
  prune: boolean;
  /** ISO timestamp (set by installer) */
  installedAt?: string;
  /** Free-form notes */
  description?: string;
}

export function loadConfig(name: string): SyncConfig {
  const path = configPath(name);
  if (!existsSync(path)) {
    throw new Error(`Sync "${name}" not found. Run \`mediagraph sync init ${name}\` first.`);
  }
  return JSON.parse(readFileSync(path, 'utf-8')) as SyncConfig;
}

export function saveConfig(config: SyncConfig): void {
  sanitize(config.name);
  const dir = syncDir(config.name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(configPath(config.name), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

export function listSyncs(): SyncConfig[] {
  const root = syncRoot();
  if (!existsSync(root)) return [];
  const out: SyncConfig[] = [];
  for (const entry of readdirSync(root)) {
    const cfg = configPath(entry);
    if (existsSync(cfg)) {
      try {
        out.push(JSON.parse(readFileSync(cfg, 'utf-8')) as SyncConfig);
      } catch {
        // ignore malformed entries
      }
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function deleteSync(name: string): void {
  const dir = syncDir(name);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

export function ensureLocalPath(localPath: string): void {
  mkdirSync(localPath, { recursive: true });
  // Verify writable
  try {
    statSync(localPath);
  } catch (e) {
    throw new Error(`Local path not accessible: ${localPath} (${(e as Error).message})`);
  }
}

void dirname; // keep import; reserved for future relative path expansion
