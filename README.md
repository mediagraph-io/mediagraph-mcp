# Mediagraph CLI

A single binary that exposes the entire [Mediagraph](https://mediagraph.io) API to AI agents and shells. Ships as both a CLI (`mediagraph <tool>`) and an MCP server (`mediagraph serve`) — same code path, same auth, same output shape.

Built for agent workflows: every tool call returns JSON on stdout, errors on stderr with stable codes, and global flags handle the boring stuff (auth, pagination, retries, dry-runs, polling).

## Install

```bash
npm install -g @mediagraph/cli     # ships the `mediagraph` command
```

## Authentication

### Interactive (developer machines)

```bash
mediagraph auth login        # opens a browser, completes OAuth, persists tokens
mediagraph auth status       # {authenticated, organization, user, token}
```

Tokens are stored encrypted at `~/.mediagraph/tokens.enc` and refreshed automatically.

### Headless (CI, sandboxes, agents)

Use a Personal Access Token. Set both env vars:

```bash
export MEDIAGRAPH_PAT="<token>"
export MEDIAGRAPH_ORGANIZATION_ID="<numeric org id>"
mediagraph auth status       # → {authenticated: true, mode: "pat", ...}
```

Generate a PAT in Mediagraph → Profile → Personal Access Tokens, or via `mediagraph create_personal_access_token --name "ci"`.

## CLI usage

```bash
mediagraph <tool> [flags]              # invoke any tool, prints JSON
mediagraph <tool> --help               # show flags for a tool
mediagraph list-tools [--brief]        # every tool, JSON
mediagraph search-tools "<query>"      # ranked keyword search over the registry
mediagraph sync ...                    # continuous folder sync (see below)
mediagraph serve                       # start the MCP server on stdio
mediagraph auth login | logout | status
```

### Tool flags

Every tool's flags are derived from its JSON Schema:

```bash
# Flag form
mediagraph search_assets --q "tag_text:nature" --per_page 5
mediagraph create_bulk_job --asset_ids 12,34,56 --tag_names sunset --tag_mode add

# Or pass the whole input as JSON
mediagraph search_assets --json '{"q":"tag_text:nature","per_page":5}'
```

Type coercion: numbers, booleans (`--flag` / `--no-flag`), arrays (comma-separated, repeated, or JSON), objects (JSON only).

### Global flags

These work with any tool:

| Flag | Purpose |
| --- | --- |
| `--all` | Auto-paginate `list_*` tools until exhausted |
| `--limit N` | Cap total rows when paginating (default 10000) |
| `--dry-run` | Print the HTTP call instead of executing — safe preview for mutations |
| `--wait` | After a `create_*`, poll the sibling status tool until terminal |
| `--wait-timeout SEC` | Cap `--wait` duration (default 600) |
| `--envelope` | Wrap stdout in `{ok, tool, data, meta:{duration_ms, ...}}` |
| `--brief` | Trim `list-tools` descriptions to one line |

Examples:

```bash
# Get all assets matching a query, capped at 500
mediagraph search_assets --q "tag_text:nature" --all --limit 500

# Preview a destructive op
mediagraph delete_asset --id 42 --dry-run

# Block until a bulk job finishes
mediagraph create_bulk_job --asset_ids 1,2,3 --tag_names sunset --tag_mode add --wait
```

## Output contract

- **stdout** — JSON only (always parseable). With `--envelope`, wrapped in `{ok, tool, data, meta}`.
- **stderr** — structured error envelope: `{ok: false, code, error, hint?, context?}`.
- **exit code** — `0` success, `1` runtime/tool/network, `2` argument parse error, `3` auth required.

Stable error codes: `AUTH_REQUIRED`, `BAD_ARGS`, `UNKNOWN_COMMAND`, `UNKNOWN_TOOL`, `NOT_FOUND`, `RUN_LOCKED`, `NETWORK`, `RATE_LIMITED`, `TOOL_ERROR`, `CONFIG_ERROR`, `INTERNAL`.

The client honors `Retry-After` on 429/503 (delta-seconds and HTTP-date forms), caps backoff at 60s, and surfaces `X-PAT-Disabled` as a structured auth error.

## Search syntax

The `q` parameter on `search_assets` accepts advanced operators:

| Form | Example | Meaning |
| --- | --- | --- |
| Term | `dog` | Match across all searchable fields (cross_fields) |
| Phrase | `"red barn"` | Both terms in same field, in order |
| Exclude | `NOT dog`, `-dog` | Exclude matches |
| Combine | `dog AND cat`, `dog OR cat` | Boolean ops |
| Field | `tag_text:nature`, `filename.keyword:IMG.jpg` | Field-scoped |
| Wildcard | `tag_text:part*`, `tag_text:?artial` | `*` any chars, `?` one char |
| Existence | `tag_text:**` / `NOT tag_text:**` | Has any value / has no value |
| Group | `(dog OR cat) AND ext:jpg` | Parenthesized |

Common fields: `tag_text`, `filename.keyword`, `description`, `title`, `ext`, `creator_text`, `copyright`, `city`, `state`, `country`.

## Continuous folder sync

Mirror a remote storage folder to a local directory (or vice versa) and keep them in sync on a schedule. Resilient to crashes and reboots: every run is idempotent, state persists at `~/.mediagraph/sync/<name>/state.json`, and in-flight ops are resumed on the next run.

Three modes: **download** (pull-only — auto-fetch new assets and new `data_version_number` bumps; metadata-only changes do NOT re-download), **upload** (push-only — hash + skip unchanged, mirror folder structure), **two-way** (conflicts land as `<file>.conflict-v<N>` next to the local file).

```bash
mediagraph sync init my-pull --mode download \
  --storage-folder-id 42 --local-path ~/Pictures/mediagraph \
  --frequency hourly
mediagraph sync run my-pull       # one-shot reconciliation; safe to repeat
mediagraph sync install my-pull   # registers a launchd job (macOS)
mediagraph sync status my-pull    # JSON summary of last run
```

Harness options (the `run` command is the same in all cases):
- **OS scheduler (recommended)**: `mediagraph sync install <name>` writes a launchd plist on macOS. Survives reboots, captures logs.
- **Coding-agent loop**: in Claude Code, `/loop 1h mediagraph sync run <name>`.
- **Long-running watcher**: `mediagraph sync watch <name>` for low latency without a cron.
- **Manual**: just run `mediagraph sync run <name>` whenever.

## Discovering tools

The CLI ships ~157 tools. Don't load them all — search:

```bash
mediagraph search-tools "rename file" --limit 5
mediagraph search-tools "watermark"
mediagraph create_bulk_job --help     # one tool, full schema
```

Tool groups: assets, search & filters, collections / lightboxes / storage folders, tags & taxonomies, tag imports, rights & sharing, custom meta fields, bulk jobs & uploads, rename presets, meta downloads (background CSV export), workflows, comments, notifications, webhooks, admin (user groups, invites, PATs, organization budget).

## Use as an MCP server

For Claude Desktop and other MCP clients:

```json
{
  "mcpServers": {
    "mediagraph": {
      "command": "npx",
      "args": ["@mediagraph/cli", "serve"]
    }
  }
}
```

Or one-click: download the latest [`mediagraph-mcp.mcpb`](https://github.com/mediagraph-io/mediagraph-mcp/releases/latest/download/mediagraph-mcp.mcpb) bundle from [Releases](https://github.com/mediagraph-io/mediagraph-mcp/releases).

The MCP server exposes the same tools and a few resources:
- `mediagraph://asset/{id}` — asset details
- `mediagraph://collection/{id}` — collection with assets
- `mediagraph://lightbox/{id}` — lightbox with assets
- `mediagraph://search?q={query}` — search results

It also includes an interactive visual gallery (`search_assets_visual`) for thumbnail browsing, inline editing, ratings, tagging, and bulk downloads inside Claude Desktop.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `MEDIAGRAPH_PAT` | — | Personal Access Token (headless auth) |
| `MEDIAGRAPH_ORGANIZATION_ID` | — | Organization id (required with PAT) |
| `MEDIAGRAPH_API_URL` | `https://api.mediagraph.io` | API host |
| `MEDIAGRAPH_OAUTH_URL` | `https://mediagraph.io` | OAuth host |
| `MEDIAGRAPH_CLIENT_ID` | *(bundled)* | OAuth client id (custom apps) |
| `MEDIAGRAPH_CLIENT_SECRET` | — | OAuth client secret (confidential clients) |
| `MEDIAGRAPH_REDIRECT_PORT` | `52584` | Local OAuth callback port |
| `MEDIAGRAPH_SYNC_ROOT` | `~/.mediagraph/sync` | Override sync state directory |

## Agent skill file

`SKILL.md` is included for agents (Claude, etc.) — it covers auth, the JSON I/O contract, search syntax, the capability map, and common workflows. Drop it into your agent's skill directory.

## Security

- Tokens encrypted at `~/.mediagraph/tokens.enc`
- OAuth uses PKCE for public clients
- PAT auth uses HTTP Basic + `OrganizationId` header (matches Mediagraph server-side path)
- Access tokens auto-refreshed before expiration
- No secrets logged or exposed in errors

## Development

```bash
git clone https://github.com/mediagraph-io/mediagraph-mcp.git
cd mediagraph-mcp
npm install
npm run build       # tsup bundle to dist/
npm test            # vitest, ~110 tests
npm run typecheck
```

Run the local build:

```bash
node dist/index.js auth status
node dist/index.js search_assets --q "test" --per_page 5
```

Test with the MCP inspector:

```bash
npx @modelcontextprotocol/inspector node dist/index.js serve
```

## License

MIT — see [LICENSE](LICENSE).

## Support

- [API Documentation](https://docs.mediagraph.io)
- [GitHub Issues](https://github.com/mediagraph/mediagraph-mcp/issues)
