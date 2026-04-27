#!/usr/bin/env node
/**
 * Mediagraph MCP — single binary.
 *
 * Backwards-compatible behavior:
 *   - No args                    -> start the MCP server (stdio)
 *   - authorize/login/auth       -> auth login
 *   - logout/revoke              -> auth logout
 *   - status/whoami              -> auth status
 *
 * New CLI:
 *   - serve                      -> start the MCP server (explicit)
 *   - auth login|logout|status   -> grouped auth subcommands
 *   - list-tools                 -> JSON list of every tool
 *   - <tool_name> [flags]        -> invoke a tool, prints JSON to stdout
 */

import { runCli } from './cli/index.js';
import { runServer } from './server.js';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  // Bare invocation = MCP server (preserves existing Claude Desktop config).
  if (argv.length === 0) {
    await runServer();
    return;
  }

  await runCli(argv);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2)}\n`);
  process.exit(1);
});
