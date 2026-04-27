/**
 * Generic poll-until-terminal helper for async tools.
 *
 * The tool definition declares which sibling tool to call to fetch status
 * (`_meta.wait.pollTool`), where the id lives on the create response
 * (`idField`), and which field + states to compare on the poll response.
 *
 * The poll cadence backs off gently — 2s, 4s, 6s, 10s, 15s, capped at 15s —
 * which is plenty for jobs that take seconds to minutes. Caller can tune
 * with --poll-seconds.
 */

import type { ToolContext, ToolDefinition, ToolResult } from '../tools/shared.js';

export interface WaitOptions {
  timeoutMs: number;
  pollMs?: number;
}

export class WaitTimeout extends Error {
  constructor(public readonly elapsedMs: number, public readonly lastState: unknown) {
    super(`Wait timed out after ${elapsedMs}ms`);
  }
}

const BACKOFF = [2000, 4000, 6000, 10000, 15000];

export async function waitForTerminal(
  definition: ToolDefinition,
  createResult: unknown,
  invokeTool: (name: string, args: Record<string, unknown>) => Promise<ToolResult>,
  context: ToolContext,
  options: WaitOptions,
): Promise<unknown> {
  const meta = definition._meta?.wait;
  if (!meta) throw new Error(`Tool "${definition.name}" does not declare wait metadata`);

  const idField = meta.idField ?? 'id';
  const id = extractId(createResult, idField);
  if (id === undefined || id === null) {
    throw new Error(`Could not find "${idField}" on the result of ${definition.name} for --wait`);
  }

  const start = Date.now();
  let last: unknown = createResult;
  let attempt = 0;

  while (true) {
    const elapsed = Date.now() - start;
    if (elapsed >= options.timeoutMs) throw new WaitTimeout(elapsed, last);

    const delay = options.pollMs ?? BACKOFF[Math.min(attempt, BACKOFF.length - 1)];
    await sleep(delay);
    attempt += 1;

    const pollResult = await invokeTool(meta.pollTool, { [idField]: id });
    if (pollResult.isError) {
      // Transient errors — keep polling until timeout. Surface the last error
      // body via WaitTimeout if we never escape.
      last = pollResult.content[0]?.text;
      continue;
    }
    const text = pollResult.content[0]?.text ?? '';
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* plain text */ }
    last = body;

    const state = readState(body, meta.statusField, idField, id);
    if (state && meta.terminal.includes(String(state))) {
      return body;
    }
  }

  void context;
}

function extractId(result: unknown, idField: string): string | number | undefined {
  if (result === null || typeof result !== 'object') return undefined;
  const r = result as Record<string, unknown>;
  const v = r[idField];
  if (typeof v === 'string' || typeof v === 'number') return v;
  return undefined;
}

/**
 * Read the status field from a poll response. If the poll tool returns a
 * list (e.g., list_meta_downloads), find the entry matching idField=id.
 */
function readState(body: unknown, statusField: string, idField: string, id: string | number): unknown {
  if (Array.isArray(body)) {
    const match = body.find(entry => {
      if (!entry || typeof entry !== 'object') return false;
      return (entry as Record<string, unknown>)[idField] === id;
    });
    if (match && typeof match === 'object') {
      return (match as Record<string, unknown>)[statusField];
    }
    return undefined;
  }
  if (body && typeof body === 'object') {
    return (body as Record<string, unknown>)[statusField];
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
