/**
 * CLI dispatcher.
 *
 * Subcommands:
 *   serve                       Start the MCP server (stdio).
 *   auth login | logout | status [--pat <token> --org <id>]
 *   skill | skills              Print agent guides and focused workflow recipes.
 *   list-tools [--brief]        Print all tool names + descriptions as JSON.
 *   search-tools <query>        Keyword search over the tool registry.
 *   sync ...                    Continuous folder sync.
 *   <tool_name> [flags]         Invoke a tool, prints JSON result.
 *
 * Global flags (consumed by the dispatcher, not the tool):
 *   --all                       Auto-paginate list tools until exhausted.
 *   --limit N                   Cap total results (with --all).
 *   --dry-run                   Print the HTTP call instead of executing.
 *   --wait [--wait-timeout N] [--wait-poll N]
 *                               After a create_*, poll until terminal state.
 *   --envelope                  Wrap output in {ok, tool, data, meta}.
 *   --brief                     Trim long fields (e.g., descriptions in list-tools).
 *
 * Output:
 *   stdout — JSON result. Bare or enveloped depending on --envelope.
 *   stderr — Structured error envelope when failing. See errors.ts.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { DryRunIntercept, type MediagraphClient } from '../api/client.js';
import { allEntityScopes, parseScopeArg } from '../api/scopes.js';
import { Runtime, getAuthStatus, runLogout } from '../core/runtime.js';
import { handleTool, toolDefinitions } from '../tools/index.js';
import type { ToolDefinition } from '../tools/shared.js';
import { ArgParseError, helpFor, parseToolArgs } from './args.js';
import { CliError, classify, exitCodeFor, emitError, failNow, type ErrorCode } from './errors.js';
import { stripGlobalFlags, type GlobalFlags } from './global_flags.js';
import { isPaginated, paginate } from './pagination.js';
import { checkForUpdates, checkForUpdatesNow, printUpdateBannerIfTTY } from './update_check.js';
import { waitForTerminal, WaitTimeout } from './wait.js';

const HELP = `Mediagraph CLI / MCP server

Mediagraph is a digital asset management (DAM) platform. This CLI exposes
the entire API as ~157 tools, all returning JSON on stdout. New here?
Run \`mediagraph skills\` for focused agent recipes, or \`mediagraph skill\`
for the full onboarding guide.

Usage:
  mediagraph --version                    Print the package version
  mediagraph update                       Force a fresh check for newer versions on npm (JSON)
  mediagraph skills [name|list|all]       Print focused agent recipes (start here)
  mediagraph skill [name]                 Print the full agent guide, or one focused guide
  mediagraph serve                        Start the MCP server (stdio)
  mediagraph auth login                   OAuth-authorize with Mediagraph (default: full read-write)
  mediagraph auth login --read-only       OAuth, request only :read on every entity
  mediagraph auth login --scope <CSV>     OAuth, request only the given scopes
                                          (e.g. "asset:read,tag:read,collections:write")
  mediagraph auth login --pat <T> --org <ID>
                                          Persist a PAT for headless use
  mediagraph auth logout                  Revoke and clear stored tokens
  mediagraph auth status                  Show current auth status + scopes (JSON)
  mediagraph list-tools [--brief]         List all tools (JSON)
  mediagraph search-tools <query>         Find tools by keyword
  mediagraph sync ...                     Continuous folder sync
  mediagraph watch <type> <id>            Stream progress for a long-running job
                                          (ActionCable WS, polling fallback). Types:
                                          bulk_job, upload, asset, meta_import, tag_import,
                                          ingestion, share, bulk_upload, meta_download
  mediagraph <tool_name> [flags]          Invoke a tool, prints JSON result
  mediagraph <tool_name> --help           Show flags for a specific tool

Global flags (work with any tool):
  --all                                   Auto-paginate list_* tools
  --limit N                               Cap total results when paginating
  --dry-run                               Show the HTTP call, don't execute
  --wait [--wait-timeout SEC]             Poll until async job is terminal
  --envelope                              Wrap stdout in {ok, tool, data, meta}

Headless auth:
  Set MEDIAGRAPH_PAT and MEDIAGRAPH_ORGANIZATION_ID for non-interactive use.
  PAT auth uses HTTP Basic + the OrganizationId header.

Environment:
  MEDIAGRAPH_PAT             Personal Access Token (headless auth)
  MEDIAGRAPH_ORGANIZATION_ID Organization id (required with PAT)
  MEDIAGRAPH_API_URL         API URL (default: https://api.mediagraph.io)
  MEDIAGRAPH_OAUTH_URL       OAuth URL (default: https://mediagraph.io)
  MEDIAGRAPH_CLIENT_ID       OAuth client ID (default: bundled)
  MEDIAGRAPH_CLIENT_SECRET   OAuth client secret (confidential clients only)
  MEDIAGRAPH_REDIRECT_PORT   Local OAuth callback port (default: 52584)
  MEDIAGRAPH_SYNC_ROOT       Override sync state directory
  MEDIAGRAPH_NO_UPDATE_CHECK Set to 1 to disable the daily update check`;

interface Envelope {
  ok: boolean;
  tool: string;
  data: unknown;
  meta: {
    duration_ms: number;
    dry_run?: boolean;
    waited?: boolean;
    paginated?: boolean;
  };
}

function emit(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export async function runCli(argv: string[]): Promise<void> {
  // Synchronously consult the update cache + show a TTY-only banner. Triggers
  // a background refresh when stale; never blocks the dispatcher.
  printUpdateBannerIfTTY(checkForUpdates(readPackageVersion()));

  try {
    await dispatch(argv);
  } catch (e) {
    const cliErr = classify(e);
    emitError(cliErr);
    process.exit(exitCodeFor(cliErr.code));
  }
}

async function dispatch(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;

  if (!command || command === '--help' || command === '-h' || command === 'help') {
    process.stdout.write(`${HELP}\n`);
    return;
  }

  if (command === '--version' || command === '-v' || command === 'version') {
    process.stdout.write(`${readPackageVersion()}\n`);
    return;
  }

  if (command === 'update' || command === 'check-update') {
    const result = await checkForUpdatesNow(readPackageVersion());
    emit(result);
    return;
  }

  if (command === 'serve') {
    const { runServer } = await import('../server.js');
    await runServer();
    return;
  }

  if (command === 'auth' || command === 'login' || command === 'logout' || command === 'status' || command === 'whoami') {
    const runtime = new Runtime();
    await runAuth(runtime, command, rest);
    return;
  }

  // Strip global flags up-front so subcommands and tool parsers don't see them.
  const { flags, rest: toolArgs } = stripGlobalFlags(rest);

  if (command === 'list-tools') {
    emit(toolDefinitions.map(t => ({
      name: t.name,
      description: flags.brief ? t.description.split('\n')[0] : t.description,
      required: t.inputSchema.required,
      properties: Object.keys(t.inputSchema.properties ?? {}),
      ...(t._meta?.wait ? { wait: true } : {}),
    })));
    return;
  }

  if (command === 'sync') {
    const { runSyncCli } = await import('./sync.js');
    await runSyncCli(rest);
    return;
  }

  if (command === 'watch') {
    const { runWatchCli } = await import('./watch.js');
    const runtime = new Runtime();
    if (!(await runtime.getAuth())) {
      throw new CliError('AUTH_REQUIRED', 'Not authenticated.',
        'Run `mediagraph auth login` (interactive) or set MEDIAGRAPH_PAT + MEDIAGRAPH_ORGANIZATION_ID for headless auth.');
    }
    await runWatchCli(rest, runtime);
    return;
  }

  if (command === 'search-tools' || command === 'find-tool') {
    const { runToolSearchCli } = await import('./search.js');
    runToolSearchCli(toolArgs);
    return;
  }

  if (command === 'skill') {
    const { runSkillCli } = await import('./skill.js');
    runSkillCli(rest);
    return;
  }

  if (command === 'skills') {
    const { runSkillsCli } = await import('./skill.js');
    runSkillsCli(rest);
    return;
  }

  // Tool invocation
  const definition = toolDefinitions.find(t => t.name === command);
  if (!definition) {
    throw new CliError('UNKNOWN_COMMAND', `Unknown command: ${command}`,
      'Run `mediagraph skills` for agent recipes, `mediagraph search-tools <query>` to find a tool, or `mediagraph --help`.');
  }

  let parsed;
  try {
    parsed = parseToolArgs(definition, toolArgs);
  } catch (e) {
    if (e instanceof ArgParseError) {
      throw new CliError('BAD_ARGS', e.message,
        `See: mediagraph ${definition.name} --help`);
    }
    throw e;
  }

  if (parsed.help) {
    process.stdout.write(`${helpFor(definition)}\n`);
    return;
  }

  await invokeTool(definition, parsed.args, flags);
}

async function invokeTool(
  definition: ToolDefinition,
  args: Record<string, unknown>,
  flags: GlobalFlags,
): Promise<void> {
  const runtime = new Runtime();

  if (definition.name !== 'reauthorize' && !flags.dryRun) {
    const auth = await runtime.getAuth();
    if (!auth) {
      const ok = await runtime.runAutoAuth();
      if (!ok) throw new CliError('AUTH_REQUIRED', 'Not authenticated.',
        'Run `mediagraph auth login` (interactive) or set MEDIAGRAPH_PAT + MEDIAGRAPH_ORGANIZATION_ID for headless auth.');
    }
  }

  if (flags.dryRun) {
    runtime.client.dryRun = true;
  }

  const start = performance.now();
  const ctx = runtime.toolContext();

  // --dry-run: catch the intercept thrown by client.request()
  const runOnce = async (a: Record<string, unknown>): Promise<unknown> => {
    const result = await handleTool(definition.name, a, ctx);
    return parseToolResult(result, definition);
  };

  let body: unknown;
  let paginated = false;

  try {
    if (flags.all && isPaginated(definition)) {
      body = await paginate(args, runOnce, { limit: flags.limit });
      paginated = true;
    } else {
      body = await runOnce(args);
    }
  } catch (e) {
    if (e instanceof DryRunIntercept) {
      const out = {
        dry_run: true,
        tool: definition.name,
        request: e.call,
      };
      writeOutput(out, definition, flags, performance.now() - start, { dryRun: true });
      return;
    }
    throw e;
  }

  let waited = false;
  if (flags.wait && definition._meta?.wait && !flags.dryRun) {
    try {
      body = await waitForTerminal(definition, body, async (toolName, toolArgs) => {
        return handleTool(toolName, toolArgs, ctx);
      }, ctx, {
        timeoutMs: flags.waitTimeoutMs ?? 600_000,
        pollMs: flags.waitPollMs,
      });
      waited = true;
    } catch (e) {
      if (e instanceof WaitTimeout) {
        throw new CliError('TOOL_ERROR', `--wait timed out after ${e.elapsedMs}ms`,
          'Increase --wait-timeout, or query the poll tool manually.', { lastState: e.lastState });
      }
      throw e;
    }
  }

  writeOutput(body, definition, flags, performance.now() - start, { paginated, waited });
}

function parseToolResult(result: { content: { text: string }[]; isError?: boolean }, definition: ToolDefinition): unknown {
  const text = result.content[0]?.text ?? '';
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* tool returned plain text */ }
  if (result.isError) {
    throw new CliError('TOOL_ERROR', typeof body === 'string' ? body : `Tool ${definition.name} returned an error`,
      undefined, typeof body === 'object' && body ? { result: body } : undefined);
  }
  return body;
}

function writeOutput(
  body: unknown,
  definition: ToolDefinition,
  flags: GlobalFlags,
  durationMs: number,
  extra: { dryRun?: boolean; waited?: boolean; paginated?: boolean } = {},
): void {
  if (!flags.envelope) {
    emit(body);
    return;
  }
  const env: Envelope = {
    ok: true,
    tool: definition.name,
    data: body,
    meta: {
      duration_ms: Math.round(durationMs),
      ...(extra.dryRun ? { dry_run: true } : {}),
      ...(extra.waited ? { waited: true } : {}),
      ...(extra.paginated ? { paginated: true } : {}),
    },
  };
  emit(env);
}

/**
 * Resolve scope flags on `auth login`:
 *   --read-only            preset: every entity at :read
 *   --scope <CSV>          explicit list (entity or group keys; bare → :write)
 *   (no flag)              default: every entity at :write (full read-write)
 *
 * The default emits entity-level scopes rather than legacy bare `write` —
 * the server's scope check honors `read` as full-read but does not treat
 * bare `write` as full-write. Entity-level is the modern, reliable shape.
 */
function parseLoginScopeFlags(args: string[]): string[] | undefined {
  const readOnly = args.includes('--read-only');
  const scopeIdx = args.findIndex(a => a === '--scope' || a === '--scopes');
  const explicit = scopeIdx !== -1 ? args[scopeIdx + 1] : undefined;

  if (readOnly && explicit !== undefined) {
    throw new CliError('BAD_ARGS', '--read-only and --scope are mutually exclusive.',
      'Pass one or the other.');
  }
  if (explicit !== undefined) {
    if (!explicit || explicit.startsWith('-')) {
      throw new CliError('BAD_ARGS', '--scope requires a value (CSV of scope keys).',
        'Example: --scope "asset:read,tag:read,collections:write"');
    }
    try {
      return parseScopeArg(explicit);
    } catch (e) {
      throw new CliError('BAD_ARGS', e instanceof Error ? e.message : String(e));
    }
  }
  if (readOnly) return allEntityScopes('read');
  return allEntityScopes('write');
}

async function runAuth(runtime: Runtime, command: string, rest: string[]): Promise<void> {
  const sub = command === 'auth' ? rest[0] : command;
  const subArgs = command === 'auth' ? rest.slice(1) : rest;

  switch (sub) {
    case 'login':
    case 'authorize': {
      const patIdx = subArgs.findIndex(a => a === '--pat');
      const orgIdx = subArgs.findIndex(a => a === '--org' || a === '--organization-id');
      if (patIdx !== -1) {
        const pat = subArgs[patIdx + 1];
        const org = orgIdx !== -1 ? Number(subArgs[orgIdx + 1]) : undefined;
        if (!pat) throw new CliError('BAD_ARGS', '--pat requires a token value.');
        if (!org) throw new CliError('BAD_ARGS', '--pat requires --org <organization-id>.');
        // For env-only headless mode we don't persist; tell the user how.
        process.stdout.write(`${JSON.stringify({
          ok: true,
          message: 'Set these env vars in your shell profile / CI secrets to use the PAT:',
          env: {
            MEDIAGRAPH_PAT: pat,
            MEDIAGRAPH_ORGANIZATION_ID: String(org),
          },
        }, null, 2)}\n`);
        return;
      }
      const scopes = parseLoginScopeFlags(subArgs);
      const ok = await runtime.runAutoAuth(scopes);
      if (!ok) throw new CliError('AUTH_REQUIRED', 'OAuth authorization failed.');
      emit(getAuthStatus(runtime));
      return;
    }
    case 'logout':
    case 'revoke': {
      const result = await runLogout(runtime);
      emit({ ok: true, loggedOut: true, ...result });
      return;
    }
    case 'status':
    case 'whoami':
    case undefined: {
      emit(getAuthStatus(runtime));
      return;
    }
    default:
      throw new CliError('UNKNOWN_COMMAND', `Unknown auth subcommand: ${sub}`, 'Use login, logout, or status.');
  }
}

/**
 * Read the package version from disk. We resolve relative to the running
 * dist/index.js so the same code works whether installed via global npm,
 * an asdf shim, or a local dev build.
 */
function readPackageVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, '..', 'package.json'),       // production: dist/index.js → ../package.json
    join(here, '..', '..', 'package.json'), // chunked build: dist/chunk-*.js → ../../
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const pkg = JSON.parse(readFileSync(path, 'utf-8')) as { name?: string; version?: string };
      // Guard against finding some unrelated package.json on the way up.
      if (pkg.name === '@mediagraph/cli' && pkg.version) return pkg.version;
    } catch { /* keep looking */ }
  }
  return 'unknown';
}

void exitCodeFor;
void emit;
type _ = ErrorCode | MediagraphClient;
