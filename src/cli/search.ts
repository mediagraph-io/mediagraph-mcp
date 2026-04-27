/**
 * Tool search — keyword retrieval over the static tool registry.
 *
 * Goal: an agent (or human) types `mediagraph search-tools "rename file"` and
 * gets back the few tools it cares about, without paging in 157 tool
 * descriptions.
 *
 * Scoring is a simple weighted token match — no TF-IDF, no fuzzy. It works
 * well because tool names and descriptions are dense with keywords.
 *
 *   - exact name match            : 100
 *   - token in name (per token)   : 20
 *   - token in flag/property name : 8
 *   - token in description (per)  : 4
 *   - token in description tag    : 2 (less weight for "if/and/the")
 *
 * Returns top-N matches as JSON, with a snippet from the description so the
 * caller doesn't need a follow-up `--help` for obvious choices.
 */

import { toolDefinitions } from '../tools/index.js';

interface Hit {
  name: string;
  score: number;
  description: string;
  required: string[];
  properties: string[];
  snippet: string;
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has',
  'have', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the',
  'to', 'was', 'were', 'will', 'with',
]);

export function searchTools(query: string, limit = 10): Hit[] {
  const queryTokens = tokenize(query).filter(t => !STOPWORDS.has(t));
  if (!queryTokens.length) return [];

  const hits: Hit[] = [];
  for (const tool of toolDefinitions) {
    const nameTokens = tokenize(tool.name);
    const descTokens = tokenize(tool.description);
    const propTokens = Object.keys(tool.inputSchema.properties ?? {}).flatMap(p => tokenize(p));

    let score = 0;
    if (queryTokens.join(' ') === tool.name) score += 100;

    for (const qt of queryTokens) {
      if (tool.name === qt) score += 100;
      if (nameTokens.includes(qt)) score += 20;
      if (propTokens.includes(qt)) score += 8;
      const descMatches = descTokens.filter(t => t === qt).length;
      score += descMatches * 4;
      // Substring fallback for partial matches like "thumb" in "thumbnail"
      if (score === 0 && tool.name.includes(qt)) score += 12;
      if (score === 0 && tool.description.toLowerCase().includes(qt)) score += 2;
    }

    if (score > 0) {
      hits.push({
        name: tool.name,
        score,
        description: tool.description,
        required: tool.inputSchema.required ?? [],
        properties: Object.keys(tool.inputSchema.properties ?? {}),
        snippet: makeSnippet(tool.description, queryTokens),
      });
    }
  }

  hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return hits.slice(0, limit);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .flatMap(t => t.split('_'));
}

function makeSnippet(description: string, queryTokens: string[]): string {
  const lowered = description.toLowerCase();
  let bestIdx = -1;
  for (const t of queryTokens) {
    const idx = lowered.indexOf(t);
    if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) bestIdx = idx;
  }
  if (bestIdx === -1) return description.slice(0, 120);
  const start = Math.max(0, bestIdx - 40);
  const end = Math.min(description.length, bestIdx + 80);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < description.length ? '…' : '';
  return `${prefix}${description.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`;
}

export function runToolSearchCli(args: string[]): void {
  const limitFlag = args.findIndex(a => a === '--limit' || a === '-n');
  let limit = 10;
  if (limitFlag !== -1) {
    limit = parseInt(args[limitFlag + 1] ?? '10', 10);
    args.splice(limitFlag, 2);
  }

  const query = args.join(' ').trim();
  if (!query) {
    process.stderr.write(`${JSON.stringify({ error: 'Query is required. Usage: mediagraph search-tools <query> [--limit N]' }, null, 2)}\n`);
    process.exit(2);
  }

  const hits = searchTools(query, limit);
  process.stdout.write(`${JSON.stringify(hits, null, 2)}\n`);
}
