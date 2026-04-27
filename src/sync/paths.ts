/**
 * Filesystem layout for sync state.
 *
 *   ~/.mediagraph/sync/<name>/
 *     config.json    — mode, root storage folder, local path, frequency
 *     state.json     — per-asset progress + cursor
 *     state.json.tmp — atomic write staging
 *     lock           — PID-aware advisory lock
 *     log/           — run logs (rotated by date)
 *     last-run.json  — outcome of the most recent run (status, duration, errors)
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

export function syncRoot(): string {
  const override = process.env.MEDIAGRAPH_SYNC_ROOT;
  if (override) return override;
  return join(homedir(), '.mediagraph', 'sync');
}

export function syncDir(name: string): string {
  return join(syncRoot(), sanitize(name));
}

export function configPath(name: string): string {
  return join(syncDir(name), 'config.json');
}

export function statePath(name: string): string {
  return join(syncDir(name), 'state.json');
}

export function lockPath(name: string): string {
  return join(syncDir(name), 'lock');
}

export function lastRunPath(name: string): string {
  return join(syncDir(name), 'last-run.json');
}

export function logDir(name: string): string {
  return join(syncDir(name), 'log');
}

export function sanitize(name: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`Invalid sync name: "${name}". Use only letters, numbers, hyphens, underscores.`);
  }
  return name;
}
