/**
 * Unified error envelope for the CLI.
 *
 * Every failure emits one JSON object to stderr with a stable `code` so
 * agents can branch without parsing prose. Exit codes:
 *   1 — runtime/server/tool error (most cases)
 *   2 — argument parse error
 *   3 — permission / auth required (also used for INSUFFICIENT_SCOPE)
 *
 * Codes are flat strings (not numeric) so additions don't shift values.
 */

import { MediagraphApiError } from '../api/client.js';
import { groupForEntity, scopeTier, type ScopeLevel, type ScopeTier } from '../api/scopes.js';

export type ErrorCode =
  | 'AUTH_REQUIRED'      // No token, or refresh failed. Re-run `auth login`.
  | 'INSUFFICIENT_SCOPE' // Token authenticated but lacks the scope for this call.
  | 'BAD_ARGS'           // Caller passed bad/missing flags. Exit 2.
  | 'UNKNOWN_COMMAND'    // Top-level command isn't recognized.
  | 'UNKNOWN_TOOL'       // Tool name doesn't exist in the registry.
  | 'NOT_FOUND'          // Sync name, file, or remote resource missing.
  | 'RUN_LOCKED'         // Sync lock held by another process.
  | 'NETWORK'            // Connection / timeout / DNS failure.
  | 'RATE_LIMITED'       // 429 from the server.
  | 'TOOL_ERROR'         // Tool ran but returned isError or threw a domain error.
  | 'CONFIG_ERROR'       // Local config / state corruption.
  | 'INTERNAL';          // Unhandled bug. File an issue.

export interface CliErrorBody {
  ok: false;
  code: ErrorCode;
  error: string;
  hint?: string;
  context?: Record<string, unknown>;
}

export class CliError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly hint?: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export function emitError(err: CliError | Error | string, fallbackCode: ErrorCode = 'INTERNAL'): void {
  const body: CliErrorBody = err instanceof CliError
    ? { ok: false, code: err.code, error: err.message, hint: err.hint, context: err.context }
    : { ok: false, code: fallbackCode, error: err instanceof Error ? err.message : err };
  process.stderr.write(`${JSON.stringify(body, null, 2)}\n`);
}

export function exitCodeFor(code: ErrorCode): number {
  if (code === 'BAD_ARGS') return 2;
  if (code === 'AUTH_REQUIRED' || code === 'INSUFFICIENT_SCOPE') return 3;
  return 1;
}

export function failNow(code: ErrorCode, message: string, hint?: string, context?: Record<string, unknown>): never {
  emitError(new CliError(code, message, hint, context));
  process.exit(exitCodeFor(code));
}

/** Best-effort classification of arbitrary errors thrown by the client/network. */
export function classify(error: unknown): CliError {
  if (error instanceof CliError) return error;
  const message = error instanceof Error ? error.message : String(error);

  // Auth-shaped messages from runtime/oauth/api client
  if (/Not authenticated|authoriz/i.test(message)) {
    return new CliError('AUTH_REQUIRED', message, 'Run `mediagraph auth login` (interactive) or set MEDIAGRAPH_PAT for headless auth.');
  }
  if (error instanceof MediagraphApiError) {
    if (error.insufficientScope) return buildScopeError(error);
    if (error.patDisabled) {
      return new CliError('AUTH_REQUIRED', message,
        'PAT is disabled. Generate a new token, or contact an admin to re-enable it.');
    }
    if (error.statusCode === 401 || error.statusCode === 403) {
      return new CliError('AUTH_REQUIRED', message, 'Token may be expired or lacks scope. Re-run `mediagraph auth login`.');
    }
    if (error.statusCode === 404) {
      return new CliError('NOT_FOUND', message);
    }
    if (error.statusCode === 429 || error.statusCode === 503) {
      const seconds = error.retryAfterMs ? Math.ceil(error.retryAfterMs / 1000) : undefined;
      const hint = seconds !== undefined
        ? `Server requested a retry in ~${seconds}s. Re-run after that delay.`
        : 'Back off and retry. PAT default rate limit is 300 req/min.';
      const code: ErrorCode = error.statusCode === 429 ? 'RATE_LIMITED' : 'NETWORK';
      return new CliError(code, message, hint, { statusCode: error.statusCode, retryAfterMs: error.retryAfterMs });
    }
    return new CliError('TOOL_ERROR', message, undefined, { statusCode: error.statusCode, body: error.errorBody });
  }
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed/i.test(message)) {
    return new CliError('NETWORK', message, 'Check connectivity and MEDIAGRAPH_API_URL.');
  }
  return new CliError('INTERNAL', message);
}

// Server's `required` is entity-level (e.g. `asset:write`); we annotate with
// the owning group so the agent can either grant the entity scope or the
// group-level form that bridges siblings.
const TIER_NOTE: Record<ScopeTier, (group: string) => string> = {
  basic: (g) => ` (${g} group — basic; any member can grant)`,
  advanced: (g) => ` (${g} group — advanced; requires admin role on the issuing membership)`,
};

function buildScopeError(err: MediagraphApiError): CliError {
  const required = err.requiredScope ?? '<unknown>';
  const reason = err.scopeReason ?? 'scope';
  const [entity, levelRaw] = required.includes(':') ? required.split(':') : [null, null];
  const level: ScopeLevel = levelRaw === 'write' ? 'write' : 'read';
  const group = entity ? groupForEntity(entity) : null;
  let tier: ScopeTier | null = null;
  if (entity) {
    try { tier = scopeTier(entity); } catch { /* unknown entity → no tier */ }
  }
  const tierNote = tier && group ? TIER_NOTE[tier](group) : '';
  const where = err.method && err.path ? `${err.method} ${err.path}` : 'this request';
  const remediation = reason === 'admin_required'
    ? 'The token includes the scope but the issuing membership lost admin role. Have an admin restore the role, or reauthorize the token from an admin membership.'
    : `Regenerate the PAT (or reauthorize the OAuth app) with \`${required}\` included${group ? ` (or the group-level \`${group}:${level}\` for sibling entities)` : ''}.`;

  const message = [
    `Request blocked by token scope on ${where}: missing \`${required}\`${tierNote}.`,
    `Reason: ${reason}.`,
    `Fix: ${remediation}`,
  ].join(' ');
  return new CliError('INSUFFICIENT_SCOPE', message, remediation, {
    required,
    entity: entity ?? undefined,
    group: group ?? undefined,
    reason,
    method: err.method,
    path: err.path,
    tier: tier ?? undefined,
  });
}
