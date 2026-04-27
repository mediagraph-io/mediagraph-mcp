/**
 * Generic auto-pagination over the existing tool registry.
 *
 * Detection: a tool is "paginated" if its inputSchema has `page` and
 * `per_page` properties. That covers every list_* tool we ship.
 *
 * Strategy:
 *   - Caller passes `--all` (and optionally `--limit N`).
 *   - We loop: page=1,2,3..., calling the tool's handler with per_page set
 *     to a large value (default 100, the API's max).
 *   - We accumulate results from each page. The shape is decided by the
 *     first response: if it's an array, we extend it; if it's an object
 *     with a known list field (`assets`, `data`, `items`, `results`, etc.),
 *     we extend that field on the accumulator and update totals.
 *   - We stop when:
 *       - the latest page is shorter than per_page (no more data), or
 *       - we hit `--limit`, or
 *       - we hit a hard safety cap (10000 rows by default).
 *
 * Errors propagate as-is — auto-pagination doesn't suppress them.
 */

import type { ToolDefinition } from '../tools/shared.js';

export const PAGINATED_LIST_FIELDS = ['assets', 'data', 'items', 'results', 'records'] as const;
const DEFAULT_PER_PAGE = 100;
const HARD_CAP = 10_000;

export function isPaginated(definition: ToolDefinition): boolean {
  const props = definition.inputSchema.properties as Record<string, unknown> | undefined;
  if (!props) return false;
  return 'page' in props && 'per_page' in props;
}

export interface PaginateOptions {
  limit?: number;
  perPage?: number;
}

/**
 * Run a tool repeatedly until exhausted. `invoke` returns the parsed body.
 * The accumulator either is an array (extended) or an object whose list
 * field is extended.
 */
export async function paginate(
  args: Record<string, unknown>,
  invoke: (args: Record<string, unknown>) => Promise<unknown>,
  options: PaginateOptions = {},
): Promise<unknown> {
  const limit = Math.min(options.limit ?? HARD_CAP, HARD_CAP);
  const perPage = Math.min(options.perPage ?? DEFAULT_PER_PAGE, 100);

  let page = 1;
  let collected = 0;
  let envelope: unknown = null;
  let listField: string | null = null;

  while (collected < limit) {
    const pageArgs = { ...args, page, per_page: perPage };
    const body = await invoke(pageArgs);

    if (envelope === null) {
      // First page determines shape.
      if (Array.isArray(body)) {
        envelope = [];
        listField = null;
      } else if (body && typeof body === 'object') {
        listField = detectListField(body as Record<string, unknown>);
        if (!listField) {
          // No list field — there's nothing to paginate. Return the response
          // unchanged.
          return body;
        }
        envelope = { ...(body as Record<string, unknown>) };
        (envelope as Record<string, unknown>)[listField] = [];
      } else {
        // Non-list response — return it as-is, no pagination possible.
        return body;
      }
    }

    const items = extractItems(body, listField);
    if (Array.isArray(envelope)) {
      const room = limit - collected;
      const slice = items.slice(0, room);
      (envelope as unknown[]).push(...slice);
      collected += slice.length;
    } else if (envelope && typeof envelope === 'object' && listField) {
      const arr = (envelope as Record<string, unknown>)[listField] as unknown[];
      const room = limit - collected;
      const slice = items.slice(0, room);
      arr.push(...slice);
      collected += slice.length;
      // Carry forward total/aggs from the latest page if present.
      copyMetaFields(body, envelope as Record<string, unknown>);
    }

    if (items.length < perPage) break;
    if (collected >= limit) break;
    page += 1;
  }

  if (envelope && typeof envelope === 'object' && !Array.isArray(envelope)) {
    (envelope as Record<string, unknown>)._paginated = true;
    (envelope as Record<string, unknown>)._pages_fetched = page;
    (envelope as Record<string, unknown>)._collected = collected;
  }

  return envelope;
}

function detectListField(body: Record<string, unknown>): string | null {
  for (const candidate of PAGINATED_LIST_FIELDS) {
    if (Array.isArray(body[candidate])) return candidate;
  }
  // Fallback: first array-valued field, if any
  for (const [k, v] of Object.entries(body)) {
    if (Array.isArray(v)) return k;
  }
  return null;
}

function extractItems(body: unknown, listField: string | null): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object' && listField) {
    const v = (body as Record<string, unknown>)[listField];
    return Array.isArray(v) ? v : [];
  }
  return [];
}

function copyMetaFields(latest: unknown, into: Record<string, unknown>): void {
  if (!latest || typeof latest !== 'object') return;
  for (const [k, v] of Object.entries(latest as Record<string, unknown>)) {
    if (k === 'page' || k === 'per_page') continue;
    if (k === 'total' || k === 'total_pages' || k === 'aggs') {
      into[k] = v;
    }
  }
}
