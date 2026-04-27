/**
 * `mediagraph skill` — print the agent skill guide.
 *
 * The skill guide (SKILL.md at the repo / package root) is the canonical
 * agent-targeted onboarding doc. It covers what Mediagraph is, the data
 * model, auth modes, the JSON I/O contract, error codes, search syntax,
 * the capability map, and common workflows.
 *
 * We resolve it relative to the running dist/index.js so the same code
 * works when invoked from a global npm install, an asdf shim, or a local
 * dev build.
 *
 * If SKILL.md isn't found on disk, we fall back to a brief embedded
 * description so an agent at least gets the discovery hint.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FALLBACK = `# Mediagraph CLI

Mediagraph is a digital asset management (DAM) platform. This CLI wraps
its REST API as ~157 tools, all returning JSON on stdout.

SKILL.md was not bundled with this install. Use these commands to
explore:

  mediagraph search-tools "<query>"   # ranked tool search
  mediagraph list-tools --brief       # all tools, one-line each
  mediagraph <tool_name> --help       # full schema for one tool

Headless auth: set MEDIAGRAPH_PAT and MEDIAGRAPH_ORGANIZATION_ID.
Interactive: \`mediagraph auth login\`.
Continuous folder sync: \`mediagraph sync help\`.
`;

export function runSkillCli(): void {
  process.stdout.write(`${loadSkillDoc()}\n`);
}

export function loadSkillDoc(): string {
  for (const path of candidatePaths()) {
    if (existsSync(path)) {
      try {
        return readFileSync(path, 'utf-8');
      } catch {
        // fall through to next candidate
      }
    }
  }
  return FALLBACK;
}

function candidatePaths(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    // Production npm install: dist/index.js → ../SKILL.md
    join(here, '..', 'SKILL.md'),
    // tsup-style build with chunked output: dist/chunk-*.js → ../SKILL.md
    join(here, '..', '..', 'SKILL.md'),
    // Repo dev: src/cli/skill.ts → ../../SKILL.md
    join(here, '..', '..', 'SKILL.md'),
  ];
}
