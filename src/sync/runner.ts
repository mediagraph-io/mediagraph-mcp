/**
 * Top-level `sync run` orchestrator. Holds the lock, picks a mode, captures
 * a structured outcome to last-run.json.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { MediagraphClient } from '../api/client.js';
import { loadConfig, type SyncConfig } from './config.js';
import { runDownload, type DownloadRunResult } from './download.js';
import { runUpload, type UploadRunResult } from './upload.js';
import { runTwoWay, type TwoWayRunResult } from './two_way.js';
import { acquireLock } from './lock.js';
import { lastRunPath, logDir } from './paths.js';

export type RunResult =
  | ({ mode: 'download' } & DownloadRunResult)
  | ({ mode: 'upload' } & UploadRunResult)
  | ({ mode: 'two-way' } & TwoWayRunResult);

export interface RunSummary {
  name: string;
  mode: SyncConfig['mode'];
  startedAt: string;
  finishedAt: string;
  outcome: 'ok' | 'partial' | 'error';
  result: RunResult;
}

export async function runSync(name: string, client: MediagraphClient): Promise<RunSummary> {
  const config = loadConfig(name);
  const lock = acquireLock(name);
  const startedAt = new Date();

  mkdirSync(logDir(name), { recursive: true });
  const logFile = join(logDir(name), `${startedAt.toISOString().slice(0, 10)}.log`);
  const log = (msg: string) => {
    const line = `${new Date().toISOString()} ${msg}\n`;
    try { appendFileSync(logFile, line); } catch { /* ignore */ }
  };

  log(`run: mode=${config.mode} root=${config.storageFolderId ?? 'org'} local=${config.localPath}`);

  try {
    let result: RunResult;
    switch (config.mode) {
      case 'download':
        result = { mode: 'download', ...(await runDownload(config, client, log)) };
        break;
      case 'upload':
        result = { mode: 'upload', ...(await runUpload(config, client, log)) };
        break;
      case 'two-way':
        result = { mode: 'two-way', ...(await runTwoWay(config, client, log)) };
        break;
    }
    const outcome = result.errors.length === 0 ? 'ok' : ('downloaded' in result && result.downloaded > 0) || ('uploaded' in result && result.uploaded > 0) ? 'partial' : 'error';
    const summary: RunSummary = {
      name,
      mode: config.mode,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      outcome,
      result,
    };
    writeFileSync(lastRunPath(name), `${JSON.stringify(summary, null, 2)}\n`);
    log(`done: outcome=${outcome} duration=${result.durationMs}ms`);
    return summary;
  } finally {
    lock.release();
  }
}

export function readLastRun(name: string): RunSummary | null {
  const path = lastRunPath(name);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf-8')) as RunSummary; } catch { return null; }
}
