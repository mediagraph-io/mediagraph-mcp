/**
 * Strip dispatcher-level flags out of argv before tool-specific arg parsing.
 *
 * These flags are owned by the CLI itself, not the tool, so they shouldn't
 * collide with any tool's JSON-Schema input. Unknown flags fall through to
 * the tool parser unchanged.
 */

export interface GlobalFlags {
  all: boolean;
  limit?: number;
  dryRun: boolean;
  wait: boolean;
  waitTimeoutMs?: number;
  waitPollMs?: number;
  envelope: boolean;
  brief: boolean;
}

export interface StripResult {
  flags: GlobalFlags;
  rest: string[];
}

const KNOWN_NUMERIC = new Set(['limit', 'wait-timeout', 'wait-poll']);
const KNOWN_BOOL = new Set(['all', 'dry-run', 'wait', 'envelope', 'brief']);

export function stripGlobalFlags(argv: string[]): StripResult {
  const rest: string[] = [];
  const flags: GlobalFlags = { all: false, dryRun: false, wait: false, envelope: false, brief: false };

  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith('--')) {
      rest.push(t);
      continue;
    }

    let key = t.slice(2);
    let inline: string | undefined;
    const eq = key.indexOf('=');
    if (eq !== -1) {
      inline = key.slice(eq + 1);
      key = key.slice(0, eq);
    }

    if (KNOWN_BOOL.has(key)) {
      assignBool(flags, key, inline ?? true);
      continue;
    }
    if (KNOWN_NUMERIC.has(key)) {
      const raw = inline !== undefined ? inline : argv[++i];
      const n = Number(raw);
      if (Number.isNaN(n)) {
        rest.push(t);
        if (inline === undefined) i--;
        continue;
      }
      assignNumeric(flags, key, n);
      continue;
    }
    rest.push(t);
    if (inline === undefined && i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      // re-attach the value we would have consumed
      rest.push(argv[++i]);
    }
  }

  return { flags, rest };
}

function assignBool(flags: GlobalFlags, key: string, value: boolean | string): void {
  const v = typeof value === 'string' ? value !== 'false' : value;
  switch (key) {
    case 'all': flags.all = v; return;
    case 'dry-run': flags.dryRun = v; return;
    case 'wait': flags.wait = v; return;
    case 'envelope': flags.envelope = v; return;
    case 'brief': flags.brief = v; return;
  }
}

function assignNumeric(flags: GlobalFlags, key: string, n: number): void {
  switch (key) {
    case 'limit': flags.limit = n; return;
    case 'wait-timeout': flags.waitTimeoutMs = n * 1000; return;
    case 'wait-poll': flags.waitPollMs = n * 1000; return;
  }
}
