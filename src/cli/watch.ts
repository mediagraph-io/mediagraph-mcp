/**
 * `mediagraph watch <type> <id>` — stream progress for a long-running job.
 *
 * Tries an ActionCable WebSocket subscription first (low-latency push from
 * the server), falls back to polling the REST endpoint on any failure.
 * Each event is printed as a JSON line on stdout. Process exits 0 on a
 * terminal state, 1 on timeout / unknown error, 2 on bad args.
 *
 * Auth: ActionCable expects a Devise JWT in the `?token=` query param plus
 * `?organization_id=`. We mint the JWT via `POST /api/refresh` using the
 * existing OAuth Bearer / PAT — `find_verified_user` only accepts JWTs.
 */

import WebSocket from 'ws';

import { CliError } from './errors.js';
import type { Runtime } from '../core/runtime.js';

interface WatchTypeConfig<T> {
  /** Human label used in error messages. */
  label: string;
  /** ActionCable channel + identifier params. */
  cableIdentifier: (id: string) => Record<string, unknown>;
  /** Filter inbound cable messages — return null if irrelevant to this watch. */
  matchEvent: (id: string, event: unknown) => Record<string, unknown> | null;
  /** Predicate: is this event a terminal state? */
  isTerminal: (event: Record<string, unknown>) => boolean;
  /** Fallback poll: hit a REST endpoint, return the current snapshot or null. */
  poll: (id: string, runtime: Runtime) => Promise<Record<string, unknown> | null>;
  /** Predicate on the polled snapshot. */
  isPolledTerminal: (snapshot: Record<string, unknown>) => boolean;
}

const TYPES: Record<string, WatchTypeConfig<unknown>> = {
  bulk_job: {
    label: 'bulk job',
    // BulkJob progress is broadcast through UserChannel — there is no
    // BulkJobChannel. We subscribe to the user stream and filter by guid.
    cableIdentifier: () => ({ channel: 'UserChannel' }),
    matchEvent: (guid, event) => {
      if (!isObject(event)) return null;
      if (event.type !== 'bulkJobProgress') return null;
      if (event.guid !== guid) return null;
      return event;
    },
    isTerminal: (event) => event.progress === 100 || event.canceled === true,
    poll: async (guid, runtime) => {
      const job = await runtime.client.getBulkJob(guid) as unknown as Record<string, unknown>;
      return job;
    },
    isPolledTerminal: (snapshot) => {
      const state = snapshot.aasm_state;
      return state === 'processed' || state === 'errored' || state === 'canceled';
    },
  },
  upload: {
    label: 'upload',
    cableIdentifier: (id) => ({ channel: 'UploadChannel', id: Number(id) }),
    matchEvent: (_id, event) => {
      if (!isObject(event)) return null;
      return event;
    },
    isTerminal: (event) => {
      const t = event.type;
      return t === 'done' || t === 'cancelled' || t === 'stalled';
    },
    poll: async (id, runtime) => {
      const status = await runtime.client.getUpload(id) as unknown as Record<string, unknown>;
      return status;
    },
    isPolledTerminal: (snapshot) => !!snapshot.done_at || snapshot.aasm_state === 'cancelled',
  },

  // Single-asset processing pipeline (post-upload: thumbs, transcode, AI tagging,
  // face indexing). Broadcasts `processingProgress` events on UserChannel filtered
  // by asset_id. Polling falls back to GET /api/assets/:id and watches aasm_state.
  asset: {
    label: 'asset',
    cableIdentifier: () => ({ channel: 'UserChannel' }),
    matchEvent: (id, event) => {
      if (!isObject(event)) return null;
      if (event.type !== 'processingProgress') return null;
      if (String(event.asset_id) !== String(id)) return null;
      return event;
    },
    // The pipeline emits many events; consider it terminal once `final_storage`
    // is announced or aasm_state hits a terminal value. Both arrive as `attrs`.
    isTerminal: (event) => {
      const attrs = isObject(event.attrs) ? event.attrs : {};
      if (attrs.final_storage === true) return true;
      const state = attrs.aasm_state;
      return state === 'processed' || state === 'processing_error';
    },
    poll: async (id, runtime) => {
      const asset = await runtime.client.getAsset(id) as unknown as Record<string, unknown>;
      return asset;
    },
    isPolledTerminal: (snapshot) => {
      const head = isObject(snapshot.head) ? snapshot.head : null;
      const state = head?.aasm_state ?? snapshot.aasm_state;
      return state === 'processed' || state === 'processing_error';
    },
  },

  // CSV metadata import (apply external metadata to existing assets).
  meta_import: {
    label: 'meta import',
    cableIdentifier: () => ({ channel: 'UserChannel' }),
    matchEvent: (id, event) => {
      if (!isObject(event)) return null;
      if (event.type !== 'metaImportProgress' && event.type !== 'metaImport') return null;
      if (event.id !== undefined && String(event.id) !== String(id)) return null;
      return event;
    },
    isTerminal: (event) => event.done === true || event.progress === 100,
    poll: async (id, runtime) => {
      const mi = await runtime.client.getMetaImport(id) as unknown as Record<string, unknown>;
      return mi;
    },
    isPolledTerminal: (snapshot) => {
      const state = snapshot.aasm_state;
      return state === 'processed' || state === 'errored' || !!snapshot.processed_at;
    },
  },

  // CSV tag import (bulk-create or merge tags from a spreadsheet).
  tag_import: {
    label: 'tag import',
    cableIdentifier: () => ({ channel: 'UserChannel' }),
    matchEvent: (id, event) => {
      if (!isObject(event)) return null;
      if (event.type !== 'tagImportProgress' && event.type !== 'tagImport') return null;
      if (event.id !== undefined && String(event.id) !== String(id)) return null;
      return event;
    },
    isTerminal: (event) => event.done === true || event.progress === 100,
    poll: async (id, runtime) => {
      const ti = await runtime.client.getTagImport(id) as unknown as Record<string, unknown>;
      return ti;
    },
    isPolledTerminal: (snapshot) => {
      const state = snapshot.aasm_state;
      return state === 'processed' || state === 'errored' || !!snapshot.processed_at;
    },
  },

  // FTP / Frame.io style ingestion.
  ingestion: {
    label: 'ingestion',
    cableIdentifier: () => ({ channel: 'UserChannel' }),
    matchEvent: (id, event) => {
      if (!isObject(event)) return null;
      const t = event.type;
      if (t !== 'ingestionAssetAdded' && t !== 'ingestionDone' && t !== 'ingestionCanceled') return null;
      if (event.ingestion_id !== undefined && String(event.ingestion_id) !== String(id)) return null;
      return event;
    },
    isTerminal: (event) => event.type === 'ingestionDone' || event.type === 'ingestionCanceled',
    poll: async (id, runtime) => {
      const ing = await runtime.client.getIngestion(id) as unknown as Record<string, unknown>;
      return ing;
    },
    isPolledTerminal: (snapshot) => {
      const state = snapshot.aasm_state;
      return state === 'processed' || state === 'canceled' || state === 'errored';
    },
  },

  // Share generation pipeline (typically zip prep + URL signing).
  share: {
    label: 'share',
    cableIdentifier: () => ({ channel: 'SharesChannel' }),
    matchEvent: (id, event) => {
      if (!isObject(event)) return null;
      if (String(event.id) !== String(id)) return null;
      return event;
    },
    isTerminal: (event) => event.progress === 100 || typeof event.code === 'string',
    poll: async (id, runtime) => {
      const status = await runtime.client.getShareStatus(id) as unknown as Record<string, unknown>;
      return status;
    },
    isPolledTerminal: (snapshot) => snapshot.progress === 100 || typeof snapshot.code === 'string' || typeof snapshot.url === 'string',
  },

  // Large bulk-upload session — broadcasts on a raw stream keyed by guid.
  // No standard ActionCable identifier here; ws path identifies via stream
  // name. Polling is the reliable surface.
  bulk_upload: {
    label: 'bulk upload',
    cableIdentifier: (guid) => ({ channel: 'BulkUploadsChannel', guid }),
    matchEvent: (_id, event) => {
      if (!isObject(event)) return null;
      return event;
    },
    // Bulk-upload streams emit per-asset events; "done" semantics live on the
    // model's status endpoint, so we lean on the poll for terminal detection
    // even when WS is connected. WS still surfaces real-time progress.
    isTerminal: () => false,
    poll: async (id, runtime) => {
      const status = await runtime.client.getBulkUploadStatus(id) as unknown as Record<string, unknown>;
      return status;
    },
    isPolledTerminal: (snapshot) => {
      const state = snapshot.aasm_state;
      return state === 'completed' || state === 'cancelled' || state === 'errored' || !!snapshot.completed_at;
    },
  },

  // Background CSV export of asset metadata.
  meta_download: {
    label: 'meta download',
    cableIdentifier: () => ({ channel: 'UserChannel' }),
    matchEvent: (_id, event) => {
      if (!isObject(event)) return null;
      // meta_download broadcasts come through as untyped UserChannel events.
      return event;
    },
    isTerminal: (event) => event.done === true || event.progress === 100 || typeof event.file_url === 'string',
    poll: async (id, runtime) => {
      const md = await runtime.client.getMetaDownload(id) as unknown as Record<string, unknown>;
      return md;
    },
    isPolledTerminal: (snapshot) => {
      const state = snapshot.aasm_state;
      return state === 'processed' || state === 'errored' || typeof snapshot.file_url === 'string';
    },
  },
};

export interface WatchFlags {
  timeoutMs: number;
  pollOnly: boolean;
  wsOnly: boolean;
  pollIntervalMs: number;
}

export async function runWatchCli(rest: string[], runtime: Runtime): Promise<void> {
  const { type, id, flags } = parseWatchArgs(rest);
  const config = TYPES[type];
  if (!config) {
    throw new CliError(
      'BAD_ARGS',
      `Unknown watch type: ${type}`,
      `Supported: ${Object.keys(TYPES).join(', ')}`,
    );
  }

  // 1. Try ActionCable unless --poll-only.
  if (!flags.pollOnly) {
    try {
      await runViaCable(type, id, config, runtime, flags);
      return;
    } catch (e) {
      if (flags.wsOnly) {
        throw new CliError('NETWORK', `WS subscription failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      // Fall through to polling.
      emitMeta({ fallback: 'polling', reason: e instanceof Error ? e.message : String(e) });
    }
  }

  // 2. Polling fallback.
  await runViaPolling(id, config, runtime, flags);
}

async function runViaCable(
  type: string,
  id: string,
  config: WatchTypeConfig<unknown>,
  runtime: Runtime,
  flags: WatchFlags,
): Promise<void> {
  const { token } = await runtime.client.refreshJwt();
  const orgId = runtime.tokenStore.load()?.organizationId ?? runtime.config.patOrganizationId;
  if (!orgId) throw new Error('No organization id available for ActionCable connection.');

  const cableUrl = buildCableUrl(runtime.config.apiUrl, token, orgId);
  const identifierObj = config.cableIdentifier(id);
  const identifier = JSON.stringify(identifierObj);

  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(cableUrl);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`watch timed out after ${flags.timeoutMs}ms`));
    }, flags.timeoutMs);

    ws.on('open', () => {
      ws.send(JSON.stringify({ command: 'subscribe', identifier }));
    });

    ws.on('message', (raw) => {
      let msg: unknown;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (!isObject(msg)) return;

      // ActionCable control frames: welcome, ping, confirm_subscription, reject_subscription, disconnect.
      if (msg.type === 'reject_subscription') {
        clearTimeout(timer);
        ws.close();
        reject(new Error('cable subscription rejected (auth or ability denial)'));
        return;
      }
      if (msg.type === 'welcome' || msg.type === 'ping' || msg.type === 'confirm_subscription') return;
      if (msg.type === 'disconnect') {
        clearTimeout(timer);
        ws.close();
        reject(new Error(`cable disconnected: ${JSON.stringify(msg)}`));
        return;
      }

      // Real broadcast: { identifier: "...", message: {...} }
      const event = msg.message;
      const matched = config.matchEvent(id, event);
      if (!matched) return;
      emitEvent(type, id, matched);
      if (config.isTerminal(matched)) {
        clearTimeout(timer);
        ws.close();
        resolve();
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    ws.on('close', () => {
      clearTimeout(timer);
      // close before terminal == abnormal; only reject if not already resolved.
      reject(new Error('cable connection closed before terminal state'));
    });
  });
}

async function runViaPolling(
  id: string,
  config: WatchTypeConfig<unknown>,
  runtime: Runtime,
  flags: WatchFlags,
): Promise<void> {
  const deadline = Date.now() + flags.timeoutMs;
  let lastSnapshot: string | null = null;
  while (Date.now() < deadline) {
    const snap = await config.poll(id, runtime);
    if (snap) {
      const stable = JSON.stringify(snap);
      if (stable !== lastSnapshot) {
        lastSnapshot = stable;
        emitEvent('poll', id, snap);
      }
      if (config.isPolledTerminal(snap)) return;
    }
    await sleep(flags.pollIntervalMs);
  }
  throw new CliError('TOOL_ERROR', `watch timed out after ${flags.timeoutMs}ms (no terminal state reached)`);
}

function buildCableUrl(apiUrl: string, token: string, orgId: number | string): string {
  const u = new URL(apiUrl);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.pathname = '/cable';
  u.searchParams.set('token', token);
  u.searchParams.set('organization_id', String(orgId));
  return u.toString();
}

function parseWatchArgs(rest: string[]): { type: string; id: string; flags: WatchFlags } {
  const flags: WatchFlags = {
    timeoutMs: 600_000,
    pollOnly: false,
    wsOnly: false,
    pollIntervalMs: 2000,
  };
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--timeout' || a === '--timeout-sec') {
      flags.timeoutMs = parseInt(rest[++i] ?? '', 10) * 1000;
    } else if (a === '--poll-only') {
      flags.pollOnly = true;
    } else if (a === '--ws-only') {
      flags.wsOnly = true;
    } else if (a === '--poll-interval' || a === '--poll-interval-sec') {
      flags.pollIntervalMs = parseInt(rest[++i] ?? '', 10) * 1000;
    } else if (a.startsWith('--')) {
      throw new CliError('BAD_ARGS', `Unknown flag: ${a}`);
    } else {
      positional.push(a);
    }
  }
  const [type, id] = positional;
  if (!type || !id) {
    throw new CliError(
      'BAD_ARGS',
      'Usage: mediagraph watch <type> <id|guid> [--timeout SEC] [--poll-only|--ws-only] [--poll-interval SEC]',
      `Types: ${Object.keys(TYPES).join(', ')}`,
    );
  }
  return { type, id, flags };
}

function emitEvent(type: string, id: string, event: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify({ type, id, ...event })}\n`);
}

function emitMeta(meta: Record<string, unknown>): void {
  process.stderr.write(`${JSON.stringify({ meta })}\n`);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
