/**
 * Long-running watcher: re-runs `runSync` on a fixed cadence with backoff.
 *
 * Use this when you want lower-latency sync than a once-an-hour cron, but
 * don't want to install a launchd job. It's just a loop — kill the process
 * and the next OS schedule (or manual `sync run`) will pick up where it left
 * off.
 */

import type { MediagraphClient } from '../api/client.js';
import { runSync } from './runner.js';

export interface WatchOptions {
  intervalMs: number;
  /** When set, watcher exits after this many runs. For tests. */
  maxRuns?: number;
}

export async function watchSync(
  name: string,
  client: MediagraphClient,
  options: WatchOptions,
  log: (msg: string) => void,
): Promise<void> {
  let runs = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const next = Date.now() + options.intervalMs;
    try {
      const summary = await runSync(name, client);
      log(`run #${runs + 1} outcome=${summary.outcome} duration=${summary.result.durationMs}ms`);
    } catch (e) {
      log(`run #${runs + 1} failed: ${(e as Error).message}`);
    }
    runs += 1;
    if (options.maxRuns && runs >= options.maxRuns) return;
    const delay = Math.max(1000, next - Date.now());
    await new Promise(r => setTimeout(r, delay));
  }
}
