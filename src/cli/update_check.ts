/**
 * Background update check against the npm registry.
 *
 * Goals:
 *   - Don't slow down the hot path: cache the latest-version lookup for 24h
 *     and refresh it asynchronously after the command starts running.
 *   - Don't pollute stdout / piped stderr: banners only print when stderr
 *     is a TTY (interactive use). Scripts and agents see nothing.
 *   - Don't keep the process alive: the background fetch is short-timeout
 *     and the cache write is fire-and-forget.
 *   - Opt out: MEDIAGRAPH_NO_UPDATE_CHECK=1.
 *
 * Cache file: ~/.mediagraph/update_check.json
 *   { checked_at: ms, latest_version: "1.4.1" }
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const NPM_REGISTRY_URL = 'https://registry.npmjs.org/@mediagraph/cli/latest';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FETCH_TIMEOUT_MS = 3000;

interface UpdateCacheEntry {
  checked_at: number;
  latest_version: string;
}

export interface UpdateCheckResult {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  cachedAt: number | null;
  installCommand: string;
}

function cachePath(): string {
  // MEDIAGRAPH_CONFIG_DIR overrides the default for tests / portable installs.
  // Mirrors the MEDIAGRAPH_SYNC_ROOT pattern (os.homedir() ignores $HOME on
  // POSIX platforms, so an explicit override is the only way to redirect).
  const root = process.env.MEDIAGRAPH_CONFIG_DIR || join(homedir(), '.mediagraph');
  return join(root, 'update_check.json');
}

function loadCache(): UpdateCacheEntry | null {
  const path = cachePath();
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8')) as UpdateCacheEntry;
    if (typeof data.checked_at !== 'number' || typeof data.latest_version !== 'string') return null;
    return data;
  } catch {
    return null;
  }
}

function saveCache(entry: UpdateCacheEntry): void {
  try {
    const path = cachePath();
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(path, JSON.stringify(entry), { mode: 0o600 });
  } catch {
    // best-effort — never fail the CLI because of a cache write
  }
}

/**
 * Compare two semver-shaped strings (MAJOR.MINOR.PATCH, optional pre-release
 * suffix ignored). Returns 1 if `a > b`, -1 if `a < b`, 0 if equal/invalid.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] | null => {
    const core = v.split('-')[0].split('+')[0];
    const parts = core.split('.').map(Number);
    if (parts.length < 3 || parts.some(p => !Number.isFinite(p))) return null;
    return parts.slice(0, 3);
  };
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch(NPM_REGISTRY_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return typeof data.version === 'string' ? data.version : null;
  } catch {
    return null;
  }
}

function isOptedOut(): boolean {
  const v = process.env.MEDIAGRAPH_NO_UPDATE_CHECK;
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * Synchronously read the cache and decide whether to print a banner. If the
 * cache is stale (or absent), kick off a background refresh that won't block
 * process exit. Safe to call once at the top of the dispatcher.
 *
 * Returns the cached UpdateCheckResult so callers (e.g. the explicit
 * `mediagraph update` command) can consult it without a second read.
 */
export function checkForUpdates(currentVersion: string): UpdateCheckResult {
  const cache = loadCache();
  const now = Date.now();
  const stale = !cache || (now - cache.checked_at) > CACHE_TTL_MS;

  if (stale && !isOptedOut()) {
    refreshCacheInBackground();
  }

  const latest = cache?.latest_version ?? null;
  return {
    current: currentVersion,
    latest,
    updateAvailable: latest !== null && compareVersions(latest, currentVersion) > 0,
    cachedAt: cache?.checked_at ?? null,
    installCommand: 'npm install -g @mediagraph/cli',
  };
}

/**
 * Force a fresh fetch (used by `mediagraph update`). Updates the cache and
 * returns the resolved result. Falls back to the cached value if the network
 * call fails.
 */
export async function checkForUpdatesNow(currentVersion: string): Promise<UpdateCheckResult> {
  const latest = await fetchLatestVersion();
  if (latest) {
    saveCache({ checked_at: Date.now(), latest_version: latest });
    return {
      current: currentVersion,
      latest,
      updateAvailable: compareVersions(latest, currentVersion) > 0,
      cachedAt: Date.now(),
      installCommand: 'npm install -g @mediagraph/cli',
    };
  }
  // Network failed; surface the cached state so the user still gets something.
  return checkForUpdates(currentVersion);
}

/**
 * Print a one-line update banner on stderr — only when stderr is a TTY (so
 * scripts/agents capturing stderr don't see it interleaved with the
 * structured error envelope).
 */
export function printUpdateBannerIfTTY(result: UpdateCheckResult): void {
  if (!result.updateAvailable || !result.latest) return;
  if (!process.stderr.isTTY) return;
  if (isOptedOut()) return;
  process.stderr.write(
    `[mediagraph] Update available: ${result.current} → ${result.latest}. Run \`${result.installCommand}\`.\n`,
  );
}

/**
 * Fire-and-forget refresh. Detached so the process exits as soon as the
 * primary command finishes; if the fetch hasn't returned by then, it's
 * dropped. The unref()-style detachment is implicit because fetch's
 * underlying socket has no `.ref()` keep-alive that we install.
 */
function refreshCacheInBackground(): void {
  // Don't await — let the CLI's main work proceed in parallel.
  void fetchLatestVersion().then(latest => {
    if (latest) saveCache({ checked_at: Date.now(), latest_version: latest });
  }).catch(() => { /* swallow */ });
}
