/**
 * `mediagraph sync ...` subcommand dispatcher.
 *
 * Subcommands (all output JSON, except `watch` which is line-streamed):
 *   sync init <name> --mode <download|upload|two-way> [--storage-folder-id N] --local-path PATH [--frequency hourly|nightly|every-15-min|manual] [--prune]
 *   sync list
 *   sync show <name>
 *   sync run <name>
 *   sync watch <name> [--interval-seconds N]
 *   sync status <name>
 *   sync remove <name>
 *   sync install <name>
 *   sync uninstall <name>
 */

import { resolve as resolvePath } from 'node:path';

import { Runtime } from '../core/runtime.js';
import { deleteSync, listSyncs, loadConfig, saveConfig, type Frequency, type SyncConfig, type SyncMode } from '../sync/config.js';
import { install, uninstall } from '../sync/installer.js';
import { lastRunPath, syncDir } from '../sync/paths.js';
import { runSync } from '../sync/runner.js';
import { watchSync } from '../sync/watcher.js';
import { loadState } from '../sync/state.js';
import { existsSync, readFileSync } from 'node:fs';

export async function runSyncCli(argv: string[]): Promise<void> {
  const [sub, ...rest] = argv;

  switch (sub) {
    case undefined:
    case '--help':
    case '-h':
    case 'help':
      printHelp();
      return;
    case 'init': return cmdInit(rest);
    case 'list': return cmdList();
    case 'show': return cmdShow(rest);
    case 'run': return cmdRun(rest);
    case 'watch': return cmdWatch(rest);
    case 'status': return cmdStatus(rest);
    case 'remove':
    case 'rm':
    case 'delete': return cmdRemove(rest);
    case 'install': return cmdInstall(rest);
    case 'uninstall': return cmdUninstall(rest);
    default:
      fail(`Unknown sync subcommand: ${sub}`);
  }
}

function printHelp(): void {
  process.stdout.write(`mediagraph sync — Continuous folder sync between local FS and Mediagraph

Subcommands:
  init <name> --mode <download|upload|two-way> --local-path PATH
              [--storage-folder-id N] [--frequency hourly|nightly|every-15-min|manual]
              [--prune] [--description "..."]
  list                          List configured syncs (JSON)
  show <name>                   Show config + last run + entry counts
  run <name>                    Reconcile once. Idempotent. Safe to invoke from cron.
  watch <name> [--interval-seconds N]
                                Long-running loop. interval defaults to the sync's
                                frequency, or 3600s.
  status <name>                 Print last-run summary (JSON)
  remove <name>                 Delete config + state (does not delete local files)
  install <name>                Register an OS scheduler job (launchd on macOS)
  uninstall <name>              Remove the scheduler job
`);
}

async function cmdInit(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const name = flags._[0];
  if (!name) fail('Usage: sync init <name> --mode ... --local-path ...');
  const mode = (flags.mode as SyncMode) || 'download';
  if (!['download', 'upload', 'two-way'].includes(mode)) fail(`Invalid --mode: ${mode}`);
  const localPath = flags['local-path'] as string | undefined;
  if (!localPath) fail('--local-path is required');

  const storageFolderId = flags['storage-folder-id'] !== undefined ? Number(flags['storage-folder-id']) : null;
  const frequency = (flags.frequency as Frequency) || 'manual';
  const prune = !!flags.prune;
  const size = (flags.size as 'original' | 'large' | 'small' | undefined) || 'original';

  const config: SyncConfig = {
    name,
    mode,
    storageFolderId,
    localPath: resolvePath(localPath!),
    size,
    frequency,
    prune,
    description: flags.description as string | undefined,
  };
  saveConfig(config);
  emit({ created: true, config });
}

function cmdList(): void {
  emit(listSyncs());
}

function cmdShow(args: string[]): void {
  const name = requireName(args);
  const config = loadConfig(name);
  const state = loadState(name);
  emit({
    config,
    entryCount: Object.keys(state.entries).length,
    lastRunAt: state.lastRunAt,
    lastRunOutcome: state.lastRunOutcome,
  });
}

async function cmdRun(args: string[]): Promise<void> {
  const name = requireName(args);
  const runtime = new Runtime();
  await ensureAuth(runtime);
  const summary = await runSync(name, runtime.client);
  emit(summary);
}

async function cmdWatch(args: string[]): Promise<void> {
  const name = requireName(args);
  const flags = parseFlags(args.slice(1));
  const config = loadConfig(name);
  const intervalSeconds = flags['interval-seconds'] !== undefined
    ? Number(flags['interval-seconds'])
    : frequencySeconds(config.frequency);

  const runtime = new Runtime();
  await ensureAuth(runtime);
  process.stdout.write(`Watching "${name}" every ${intervalSeconds}s (Ctrl+C to stop)\n`);
  await watchSync(name, runtime.client, { intervalMs: intervalSeconds * 1000 }, msg => {
    process.stdout.write(`${new Date().toISOString()} ${msg}\n`);
  });
}

function cmdStatus(args: string[]): void {
  const name = requireName(args);
  const path = lastRunPath(name);
  if (!existsSync(path)) {
    emit({ name, lastRun: null, message: 'No runs yet.' });
    return;
  }
  emit(JSON.parse(readFileSync(path, 'utf-8')));
}

function cmdRemove(args: string[]): void {
  const name = requireName(args);
  // Best-effort uninstall scheduler too
  try { uninstall(name); } catch { /* ignore */ }
  deleteSync(name);
  emit({ removed: true, name, dir: syncDir(name) });
}

function cmdInstall(args: string[]): void {
  const name = requireName(args);
  const config = loadConfig(name);
  const result = install(name, config.frequency);
  emit(result);
}

function cmdUninstall(args: string[]): void {
  const name = requireName(args);
  emit(uninstall(name));
}

function frequencySeconds(frequency: Frequency): number {
  switch (frequency) {
    case 'every-15-min': return 900;
    case 'hourly': return 3600;
    case 'nightly': return 86400;
    default: return 3600;
  }
}

async function ensureAuth(runtime: Runtime): Promise<void> {
  const token = await runtime.getAccessToken();
  if (!token) {
    const ok = await runtime.runAutoAuth();
    if (!ok) fail('Authentication failed. Run `mediagraph auth login`.');
  }
}

function requireName(args: string[]): string {
  if (!args[0] || args[0].startsWith('--')) fail('Sync name is required');
  return args[0];
}

interface Flags { _: string[]; [k: string]: unknown }
function parseFlags(args: string[]): Flags {
  const out: Flags = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const t = args[i];
    if (!t.startsWith('--')) {
      out._.push(t);
      continue;
    }
    const eq = t.indexOf('=');
    let key: string;
    let value: string | boolean | undefined;
    if (eq !== -1) {
      key = t.slice(2, eq);
      value = t.slice(eq + 1);
    } else {
      key = t.slice(2);
      const next = args[i + 1];
      if (next === undefined || next.startsWith('--')) {
        value = true;
      } else {
        value = next;
        i++;
      }
    }
    out[key] = value;
  }
  return out;
}

function emit(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(message: string): never {
  process.stderr.write(`${JSON.stringify({ error: message }, null, 2)}\n`);
  process.exit(1);
}
