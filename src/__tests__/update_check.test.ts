/**
 * Tests for the CLI auto-update check.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  checkForUpdates,
  checkForUpdatesNow,
  compareVersions,
  printUpdateBannerIfTTY,
} from '../cli/update_check.js';

describe('compareVersions', () => {
  it('detects patch / minor / major bumps', () => {
    expect(compareVersions('1.4.2', '1.4.1')).toBe(1);
    expect(compareVersions('1.5.0', '1.4.9')).toBe(1);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
  });
  it('returns -1 for downgrades, 0 for equal', () => {
    expect(compareVersions('1.4.0', '1.4.1')).toBe(-1);
    expect(compareVersions('1.4.1', '1.4.1')).toBe(0);
  });
  it('ignores pre-release suffixes', () => {
    expect(compareVersions('1.4.1-rc.1', '1.4.1')).toBe(0);
    expect(compareVersions('1.4.2-beta', '1.4.1')).toBe(1);
  });
  it('returns 0 on malformed input rather than throwing', () => {
    expect(compareVersions('not-a-version', '1.4.1')).toBe(0);
    expect(compareVersions('1.4', '1.4.1')).toBe(0);
  });
});

describe('checkForUpdates — cache + banner gating', () => {
  let configDir: string;
  let originalConfigDir: string | undefined;
  let originalOptOut: string | undefined;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'mg-update-test-'));
    originalConfigDir = process.env.MEDIAGRAPH_CONFIG_DIR;
    originalOptOut = process.env.MEDIAGRAPH_NO_UPDATE_CHECK;
    process.env.MEDIAGRAPH_CONFIG_DIR = configDir;
    // Default to opt-out so tests don't trigger real npm registry calls.
    // Individual tests opt back in when verifying refresh / banner behavior.
    process.env.MEDIAGRAPH_NO_UPDATE_CHECK = '1';
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
    if (originalConfigDir === undefined) delete process.env.MEDIAGRAPH_CONFIG_DIR;
    else process.env.MEDIAGRAPH_CONFIG_DIR = originalConfigDir;
    if (originalOptOut === undefined) delete process.env.MEDIAGRAPH_NO_UPDATE_CHECK;
    else process.env.MEDIAGRAPH_NO_UPDATE_CHECK = originalOptOut;
    vi.unstubAllGlobals();
  });

  function writeCache(latestVersion: string, ageMs: number): void {
    if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
    const path = join(configDir, 'update_check.json');
    writeFileSync(path, JSON.stringify({
      checked_at: Date.now() - ageMs,
      latest_version: latestVersion,
    }));
  }

  it('flags an update when the cached latest > current', () => {
    writeCache('1.5.0', 60_000);
    const result = checkForUpdates('1.4.1');
    expect(result.updateAvailable).toBe(true);
    expect(result.latest).toBe('1.5.0');
    expect(result.installCommand).toContain('npm install -g @mediagraph/cli');
  });

  it('does NOT flag an update when current >= cached latest', () => {
    writeCache('1.4.1', 60_000);
    const result = checkForUpdates('1.4.1');
    expect(result.updateAvailable).toBe(false);
    expect(result.latest).toBe('1.4.1');
  });

  it('returns latest=null and updateAvailable=false when cache is missing', () => {
    const result = checkForUpdates('1.4.1');
    expect(result.latest).toBeNull();
    expect(result.updateAvailable).toBe(false);
  });

  it('opt-out: MEDIAGRAPH_NO_UPDATE_CHECK=1 still reads cache but does not refresh', () => {
    process.env.MEDIAGRAPH_NO_UPDATE_CHECK = '1';
    writeCache('1.5.0', 30 * 60 * 60 * 1000); // older than 24h, would normally refresh
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = checkForUpdates('1.4.1');
    expect(result.updateAvailable).toBe(true); // banner state still derived from cache
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('printUpdateBannerIfTTY emits to stderr only when stderr is a TTY', () => {
    delete process.env.MEDIAGRAPH_NO_UPDATE_CHECK; // banner is suppressed when opted out
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const isTTY = process.stderr.isTTY;

    Object.defineProperty(process.stderr, 'isTTY', { value: false, configurable: true });
    printUpdateBannerIfTTY({
      current: '1.4.1', latest: '1.5.0', updateAvailable: true, cachedAt: Date.now(), installCommand: 'npm install -g @mediagraph/cli',
    });
    expect(writeSpy).not.toHaveBeenCalled();

    Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true });
    printUpdateBannerIfTTY({
      current: '1.4.1', latest: '1.5.0', updateAvailable: true, cachedAt: Date.now(), installCommand: 'npm install -g @mediagraph/cli',
    });
    expect(writeSpy).toHaveBeenCalledOnce();
    expect(writeSpy.mock.calls[0][0]).toMatch(/1\.4\.1 → 1\.5\.0/);

    Object.defineProperty(process.stderr, 'isTTY', { value: isTTY, configurable: true });
    writeSpy.mockRestore();
  });

  it('printUpdateBannerIfTTY skips when no update available', () => {
    delete process.env.MEDIAGRAPH_NO_UPDATE_CHECK;
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true });
    printUpdateBannerIfTTY({
      current: '1.4.1', latest: '1.4.1', updateAvailable: false, cachedAt: Date.now(), installCommand: 'npm install -g @mediagraph/cli',
    });
    expect(writeSpy).not.toHaveBeenCalled();
    writeSpy.mockRestore();
  });
});

describe('checkForUpdatesNow — fresh fetch', () => {
  let configDir: string;
  let originalConfigDir: string | undefined;
  let originalOptOut: string | undefined;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'mg-update-now-'));
    originalConfigDir = process.env.MEDIAGRAPH_CONFIG_DIR;
    originalOptOut = process.env.MEDIAGRAPH_NO_UPDATE_CHECK;
    process.env.MEDIAGRAPH_CONFIG_DIR = configDir;
    process.env.MEDIAGRAPH_NO_UPDATE_CHECK = '1';
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
    if (originalConfigDir === undefined) delete process.env.MEDIAGRAPH_CONFIG_DIR;
    else process.env.MEDIAGRAPH_CONFIG_DIR = originalConfigDir;
    if (originalOptOut === undefined) delete process.env.MEDIAGRAPH_NO_UPDATE_CHECK;
    else process.env.MEDIAGRAPH_NO_UPDATE_CHECK = originalOptOut;
    vi.unstubAllGlobals();
  });

  it('fetches the npm registry and writes the cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ name: '@mediagraph/cli', version: '1.5.0' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkForUpdatesNow('1.4.1');
    expect(result.latest).toBe('1.5.0');
    expect(result.updateAvailable).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://registry.npmjs.org/@mediagraph/cli/latest',
      expect.objectContaining({ headers: expect.objectContaining({ Accept: 'application/json' }) }),
    );

    const cache = JSON.parse(readFileSync(join(configDir, 'update_check.json'), 'utf-8'));
    expect(cache.latest_version).toBe('1.5.0');
  });

  it('falls back to cached state on network failure', async () => {
    // Pre-seed the cache, then make fetch fail.
    writeFileSync(
      join(configDir, 'update_check.json'),
      JSON.stringify({ checked_at: Date.now(), latest_version: '1.4.5' }),
    );

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ENETDOWN')));
    const result = await checkForUpdatesNow('1.4.1');
    expect(result.latest).toBe('1.4.5');
    expect(result.updateAvailable).toBe(true);
  });
});
