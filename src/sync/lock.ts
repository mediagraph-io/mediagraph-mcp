/**
 * PID-aware advisory lock. Prevents two `sync run` processes from racing
 * on the same sync. Stale locks (PID no longer alive) are cleared on acquire.
 *
 * Not used as a security boundary — it's cooperative. A user with rm can
 * always blow it away.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { lockPath } from './paths.js';

export interface LockHandle {
  release: () => void;
}

export class SyncLockedError extends Error {
  constructor(public readonly pid: number, public readonly name: string) {
    super(`Sync "${name}" is already running (pid ${pid}). If that process is dead, delete ${lockPath(name)} and retry.`);
  }
}

function pidIsAlive(pid: number): boolean {
  try {
    // Signal 0 is a no-op probe — throws ESRCH if the PID is gone.
    process.kill(pid, 0);
    return true;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    // EPERM means the process exists but we can't signal it (still alive).
    return code === 'EPERM';
  }
}

export function acquireLock(name: string): LockHandle {
  const path = lockPath(name);
  mkdirSync(dirname(path), { recursive: true });

  if (existsSync(path)) {
    const raw = readFileSync(path, 'utf-8').trim();
    const pid = parseInt(raw, 10);
    if (!Number.isNaN(pid) && pidIsAlive(pid) && pid !== process.pid) {
      throw new SyncLockedError(pid, name);
    }
    // Stale — clear and continue.
    rmSync(path, { force: true });
  }

  writeFileSync(path, `${process.pid}\n`, { flag: 'wx', mode: 0o600 });

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try { rmSync(path, { force: true }); } catch { /* ignore */ }
  };

  // Best-effort cleanup on normal exit. Crashes leave the lock for the
  // next run to clear.
  process.once('exit', release);

  return { release };
}
