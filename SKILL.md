---
name: mediagraph
description: |
  Use the `mediagraph` CLI to interact with Mediagraph (digital asset
  management). Covers asset search, tagging, collections, lightboxes,
  storage folders, rights packages, sharing, bulk jobs, uploads, custom
  meta, taxonomies, webhooks, and admin. Use when the user asks to find,
  organize, tag, share, export, or otherwise work with media assets in
  Mediagraph.
---

# Mediagraph CLI

A single binary that exposes the entire [Mediagraph](https://www.mediagraph.io)
API as both an MCP server (stdio) and a CLI. Agents should prefer the CLI
form — it returns plain JSON on stdout that you can parse and pipe.

**About Mediagraph:** a digital asset management (DAM) platform for
organizing, sharing, and AI-tagging media at scale. Product info, pricing,
and demos at [www.mediagraph.io](https://www.mediagraph.io); API reference
at [docs.mediagraph.io](https://docs.mediagraph.io).

## Install / setup

```bash
npm install -g @mediagraph/cli        # provides the `mediagraph` command
mediagraph skill                       # → prints this guide; start here cold
mediagraph auth login                  # OAuth, opens a browser, persists tokens (full read-write)
mediagraph auth login --read-only      # OAuth with :read on every entity (safer for grants)
mediagraph auth login --scope "asset:read,tag:write,collections:write"
                                       # OAuth with a specific scope set
mediagraph auth status                 # JSON: {authenticated, organization, user, token, scopes}
```

Tokens persist at `~/.mediagraph/tokens.enc`. Refresh is automatic.

### Scopes

Scopes are entity-level (`asset:write`, `comment:read`, `webhook:write`) with
group-level shorthand for back-compat (`assets:write` covers every entity in
the `assets` group). `write` implies `read` for the same key. Sibling
entities are independent unless granted via the group form.

`auth status` surfaces the current OAuth token's scopes (`scopes.list`) and
flags legacy/empty lists as `fullAccess: true`. PAT scopes can't be
introspected from the CLI — they're set at PAT creation. When the server
rejects a request with `error: "insufficient_scope"`, the CLI surfaces a
structured `INSUFFICIENT_SCOPE` error (exit 3) naming the missing scope, its
group, and how to remediate (`scope` → regenerate; `admin_required` →
reauthorize from an admin membership).

### Headless / CI auth (Personal Access Token)

For non-interactive environments, set both:

```bash
export MEDIAGRAPH_PAT="<your personal access token>"
export MEDIAGRAPH_ORGANIZATION_ID="<numeric org id>"
mediagraph auth status   # → {authenticated: true, mode: "pat", organization: {id: ...}}
```

Generate a PAT at Mediagraph → Profile → Personal Access Tokens, or via
`mediagraph create_personal_access_token --name "..."`.

Other env vars:

| Var | Purpose |
| --- | --- |
| `MEDIAGRAPH_API_URL` | Override API host (default `https://api.mediagraph.io`) |
| `MEDIAGRAPH_OAUTH_URL` | Override OAuth host (default `https://mediagraph.io`) |
| `MEDIAGRAPH_CLIENT_ID` | Custom OAuth client (default: bundled public client) |
| `MEDIAGRAPH_CLIENT_SECRET` | Confidential client secret (rare) |
| `MEDIAGRAPH_REDIRECT_PORT` | Local OAuth callback port (default 52584) |
| `MEDIAGRAPH_SYNC_ROOT` | Override sync state directory |
| `MEDIAGRAPH_CONFIG_DIR` | Override config dir (default `~/.mediagraph`) — used for the update-check cache |
| `MEDIAGRAPH_NO_UPDATE_CHECK` | `1` to disable the daily npm-registry update check + banner |

## Invocation contract

```bash
mediagraph <command|tool_name> [flags]
```

Output:
- **stdout**: JSON of the result (always JSON for tool calls). With
  `--envelope`, wraps in `{ok, tool, data, meta}`.
- **stderr**: structured error envelope `{ok: false, code, error, hint?, context?}`
- **exit code**:
  - `0` success
  - `1` runtime / network / tool error
  - `2` argument parse error (`BAD_ARGS`)
  - `3` auth required (`AUTH_REQUIRED`)

Stable error codes (`code` field): `AUTH_REQUIRED`, `INSUFFICIENT_SCOPE`,
`BAD_ARGS`, `UNKNOWN_COMMAND`, `UNKNOWN_TOOL`, `NOT_FOUND`, `RUN_LOCKED`,
`NETWORK`, `RATE_LIMITED`, `TOOL_ERROR`, `CONFIG_ERROR`, `INTERNAL`.

`INSUFFICIENT_SCOPE` (exit 3) is permanent for the current token — do not
retry. The error `context` carries `{required, entity, group, reason, tier,
method, path}` so you can decide whether to ask the user to re-`auth login`
with broader scopes, or to grant a specific one.

### Global flags (work with any tool)

| Flag | Purpose |
| --- | --- |
| `--all` | Auto-paginate `list_*` tools until exhausted |
| `--limit N` | Cap total rows when paginating (default 10000) |
| `--dry-run` | Print the HTTP call instead of executing — safe preview for mutations |
| `--wait` | After a `create_*`, poll the sibling `get_*` until terminal state |
| `--wait-timeout SEC` | Cap `--wait` duration (default 600) |
| `--envelope` | Wrap stdout in `{ok, tool, data, meta:{duration_ms, ...}}` |
| `--brief` | Trim `list-tools` descriptions to one line |

Examples:
```bash
# Full search results, capped at 500 rows
mediagraph search_assets --q "tag_text:nature" --all --limit 500

# Preview a destructive operation without making it
mediagraph delete_asset --id 42 --dry-run

# Kick off a bulk job and block until it finishes
mediagraph create_bulk_job --asset_ids 1,2,3 --tag_names sunset --tag_mode add --wait
```

Top-level commands:

| Command | Purpose |
| --- | --- |
| `skill` | Print this agent guide |
| `serve` | Start MCP server (stdio). Used by Claude Desktop, etc. |
| `auth login [--read-only \| --scope <CSV>]` / `auth logout` / `auth status` | OAuth lifecycle (default = full read-write) |
| `update` | Force a fresh npm-registry check; emits `{current, latest, updateAvailable, installCommand}` JSON |
| `list-tools` | Print every tool name, description, required + optional flags |
| `search-tools <query>` | Ranked keyword search over the tool registry |
| `sync ...` | Continuous folder sync (see below) |
| `watch <type> <id>` | Stream progress for a long-running job. Tries an ActionCable WebSocket subscription first (low-latency push), falls back to polling on any failure. Each event prints as a JSON line. Types: `bulk_job <guid>`, `upload <id>`, `asset <id>` (single-asset processing pipeline), `meta_import <id>`, `tag_import <id>`, `ingestion <id>`, `share <id>`, `bulk_upload <guid>`, `meta_download <id>`. Flags: `--timeout SEC`, `--poll-only`, `--ws-only`, `--poll-interval SEC`. |
| `<tool_name> --help` | Show flags for a single tool |
| `<tool_name> [flags]` | Invoke a tool, prints JSON |

Anything that isn't a built-in command is treated as a tool name.

## Passing arguments

Every tool's flags come from its JSON Schema. Two equivalent forms:

**Flag form** — derived from the schema:
```bash
mediagraph search_assets --q "tag_text:nature" --per_page 5
mediagraph create_bulk_job --asset_ids 12,34,56 --tag_names sunset,beach --tag_mode add
```

**JSON form** — pass the whole input as one blob:
```bash
mediagraph search_assets --json '{"q":"tag_text:nature","per_page":5}'
```

Type coercion:
- numbers/booleans/strings: as written (`--per_page 25`, `--enabled true`)
- booleans: `--flag` ⇒ true, `--no-flag` ⇒ false, or explicit `--flag true`
- arrays: comma-separated (`--asset_ids 1,2,3`), repeated (`--ids 1 --ids 2`), or JSON (`--ids '[1,2,3]'`)
- objects: JSON only (`--filter '{"k":"v"}'`)

If you don't know a tool's schema, run:
```bash
mediagraph list-tools                      # everything, JSON
mediagraph search-tools "rename file"     # ranked matches by keyword (cheap)
mediagraph <tool_name> --help              # one tool, human-readable
```

Prefer `search-tools` over `list-tools` when context budget matters — it
returns a ranked top-N with name, required flags, properties, and a snippet
from the description.

## Search syntax (`search_assets --q ...`)

The `q` parameter supports advanced operators:

| Form | Example | Meaning |
| --- | --- | --- |
| Term | `dog` | Match across all searchable fields (cross_fields) |
| Phrase | `"red barn"` | Both terms in same field, in order |
| Exclude | `NOT dog` or `-dog` | Exclude matches |
| Combine | `dog AND cat`, `dog OR cat` | Boolean ops |
| Field | `tag_text:nature`, `filename.keyword:IMG.jpg` | Field-scoped |
| Wildcard | `tag_text:part*`, `tag_text:?artial` | `*` any chars, `?` one char |
| Existence | `tag_text:**` / `NOT tag_text:**` | Has any value / has no value |
| Group | `(dog OR cat) AND ext:jpg` | Parenthesized |

Common fields: `tag_text`, `filename.keyword`, `description`, `title`, `ext`,
`creator_text`, `copyright`, `city`, `state`, `country`.

Sort: pass `order` or its alias `direction` (`asc`/`desc`). Results carry an
implicit `id:asc` tiebreaker.

## Capability map

The CLI exposes ~160 tools across these groups. Use `list-tools` for the
authoritative inventory; this map is the mental model.

**Discover** — `whoami`, `get_organization`, `get_organization_branding`,
`list_memberships`, `get_membership`, `list-tools`.

**Assets** — `search_assets`, `get_asset`, `update_asset`, `delete_asset`,
`get_asset_counts`, `get_trashed_assets`, `get_popular_assets`,
`add_tags_to_asset`, `get_asset_auto_tags`, `get_asset_face_taggings`,
`tag_video_face`, `detect_video_faces`, `explain_asset_search` (super-admin),
`get_asset_versions`, `revert_asset`, `get_asset_download`,
`delete_published_image`.

**Search & filters** — `list_search_queries`, `get_search_query`,
`create_search_query`, `update_search_query`, `delete_search_query`,
`list_filter_groups`, `get_filter_group`, `create_filter_group`,
`update_filter_group`, `delete_filter_group`.

**Groups** (Collections / Lightboxes / Storage Folders) —
`list_collections`, `get_collection`, `create_collection`,
`update_collection`, `delete_collection`, `get_collections_tree`,
`add_asset_to_collection`, `list_lightboxes`, `get_lightbox`,
`create_lightbox`, `update_lightbox`, `delete_lightbox`,
`get_lightboxes_tree`, `add_asset_to_lightbox`, `list_storage_folders`,
`get_storage_folder`, `create_storage_folder`, `update_storage_folder`,
`add_assets_to_group`.

**Tags & taxonomies** — `list_tags`, `get_tag`, `create_tag`, `update_tag`,
`delete_tag`, `merge_tags`, `check_tag_name`, `list_auto_tags`,
`get_auto_tag`, `delete_auto_tag`, `bulk_find_auto_tags`, `get_tagging`,
`delete_tagging`, `list_taxonomies`, `create_taxonomy`, `create_taxonomy_tag`,
`list_creator_tags`, `create_creator_tag`.

**Tag imports** (CSV/XLS) — `list_tag_imports`, `get_tag_import`,
`create_tag_import`, `update_tag_import`, `delete_tag_import`,
`update_tag_import_mapping`, `start_tag_import`, `get_tag_import_tags`.

**Rights & sharing** — `list_rights_packages`, `create_rights_package`,
`list_share_links`, `get_share_link`, `create_share_link`,
`delete_share_link`, `list_access_requests`, `get_access_request`,
`submit_access_request`, `get_share_status`, `list_shares`, `create_share`.

**Custom meta fields** — `list_custom_meta_fields`, `get_custom_meta_field`,
`create_custom_meta_field`, `update_custom_meta_field`,
`delete_custom_meta_field`, `export_custom_meta_fields`.

**Bulk jobs** — `list_bulk_jobs`, `get_bulk_job`, `create_bulk_job`,
`cancel_bulk_job`, `get_bulk_job_queue_position`, `preview_rename_bulk_job`,
`bulk_download_assets`, `list_meta_imports`, `get_meta_import`,
`list_ingestions`.

**Uploads** — `upload_file` (one file: file_path or base64 file_data),
`upload_files` (many local files), `create_upload_session` +
`set_upload_done` (long-lived sessions for batches), `add_assets_to_upload`
(register pre-built asset records), `can_upload` (quota check). Files
larger than 16 MiB automatically use direct-to-S3 multipart with parallel
parts and per-part retry; smaller files use a single signed PUT. Both
paths stream from disk — no whole-file buffering.

**Rename presets** — `list_rename_presets`, `get_rename_preset`,
`create_rename_preset`, `update_rename_preset`, `delete_rename_preset`,
`reorder_rename_presets`.

**Meta downloads** (background CSV export) — `list_meta_downloads`,
`get_meta_download_columns`, `create_meta_download`, `update_meta_download`.

**Workflows & comments** — `list_workflows`, `approve_workflow_step`,
`create_comment`, `delete_comment`, `update_comment`.

**Notifications** — `list_notifications`, `get_notification_count`.

**Webhooks** — `list_webhooks`, `create_webhook`, `update_webhook`,
`delete_webhook`, `get_webhook_logs`, `test_webhook`.

**Admin** — `list_user_groups`, `create_user_group`, `list_invites`,
`create_invite`, `update_invite`, `resend_invite`,
`list_personal_access_tokens`, `create_personal_access_token`,
`delete_personal_access_token`, `disable_personal_access_token`,
`enable_personal_access_token`, `add_organization_cai_budget`,
`grant_organization_cai_budget`, `mark_organization_cai_invoice_paid`,
`extend_organization_trial`.

**Reauthorize** — `reauthorize` switches to a different organization
(triggers a fresh OAuth flow).

**URLs** — `generate_url` builds deep-link URLs for any entity (asset,
collection, lightbox, storage_folder, tag, creator_tag, share_link, or
explore root). Honors the org's custom domain (e.g. `dam.mer.fm`) when
set, falls back to `https://mediagraph.io/{slug}/...`. Pass whichever
identifier you have (guid for assets; slug for collections/folders;
composite slug or id+name for lightboxes; id for tags). The tool will
autofetch the entity if needed to derive a missing identifier; pass
`--autofetch false` to skip and just build from what you provided.

## Common workflows

**Find all untagged JPEGs:**
```bash
mediagraph search_assets --q 'NOT tag_text:** AND ext:jpg' --per_page 100
```

**Bulk-tag a set of assets:**
```bash
mediagraph create_bulk_job --asset_ids 12,34,56 --tag_names sunset,beach --tag_mode add
mediagraph get_bulk_job --id <id_from_above>
```

**Preview a rename before submitting:**
```bash
mediagraph preview_rename_bulk_job --rename_preset_id 4 --asset_ids 1,2,3 --custom_text "trip"
```

**Export metadata to CSV (background):**
```bash
mediagraph create_meta_download --asset_ids "1,2,3,4" --column_preset basic --send_email true
mediagraph list_meta_downloads --per_page 5    # poll for the new row
```

**Share a collection and poll its status:**
```bash
mediagraph create_share_link --asset_group_id 42 --image_and_video_permission download_large
mediagraph get_share_status --id <share_id>
```

**Switch organizations:**
```bash
mediagraph reauthorize     # opens browser; pick a different org
```

**Generate a shareable link to an entity:**
```bash
# Have the asset id from a search? URL it:
mediagraph generate_url --type asset --id 17302979
# → https://dam.mer.fm/explore#/assets/<guid>

# Collection by slug, no autofetch needed:
mediagraph generate_url --type collection --slug doggies

# Tag — pass id (and optionally name for prettier slug):
mediagraph generate_url --type tag --id 609 --name Grandparent
```

**One-shot upload** (CLI creates + finalizes the session):
```bash
mediagraph upload_file --file_path /path/to/photo.jpg
# → asset id returned. Files >16 MiB auto-use S3 multipart.
```

**Batch upload across many calls** (agent owns the session lifecycle):
```bash
session=$(mediagraph create_upload_session --name "trip 2026" | jq -r .guid)
id=$(mediagraph create_upload_session ... | jq .id)   # or capture id from same call

for f in ~/Pictures/trip-2026/*.{jpg,raw}; do
  mediagraph upload_file --file_path "$f" --upload_guid "$session"
done

mediagraph set_upload_done --id "$id"
# Each upload_file is independently retryable; the session persists across
# crashes and reboots until you finalize it.
```

## Tips for agents

- For multi-step workflows, capture stdout into a variable and `jq` the IDs
  rather than re-querying.
- Pagination defaults are conservative; pass `--per_page 100` for bulk
  reads. Total counts live in the `total` field.
- For unfamiliar tools, run `<tool> --help` first — it prints the schema
  flags with descriptions; cheaper than guessing.
- The CLI is fully non-interactive after `auth login`. If `auth status` says
  `authenticated: false`, log in again before retrying.
- Treat the OpenAPI spec at `doc/open_api.json` (in this repo) as the
  authoritative source for response shapes if a tool's output is ambiguous.

## Continuous folder sync

Mirror a remote storage folder to a local directory (or vice versa) and keep
them in sync on a schedule. Resilient to crashes and reboots: every run is
idempotent, state persists at `~/.mediagraph/sync/<name>/state.json`, and
in-flight ops are resumed on the next run.

Three modes:
- **download** — pull-only. Auto-fetch new assets and new
  `data_version_number` bumps. Metadata-only changes do NOT re-download.
- **upload** — push-only. Walk a local directory, hash + skip unchanged,
  upload new files preserving folder structure.
- **two-way** — both. Conflicts (both sides changed) land as
  `<file>.conflict-v<N>` next to the local file; the local edit is uploaded.

Setup:
```bash
mediagraph sync init my-pull --mode download \\
  --storage-folder-id 42 --local-path ~/Pictures/mediagraph \\
  --frequency hourly
mediagraph sync run my-pull          # one-shot reconciliation; safe to repeat
mediagraph sync install my-pull      # registers a launchd job (macOS)
mediagraph sync status my-pull       # JSON summary of last run
```

Harness options (pick one — the run command is the same in all cases):
- **OS scheduler (recommended)**: `mediagraph sync install <name>` writes a
  launchd plist to `~/Library/LaunchAgents`. Survives reboots, captures logs.
- **Coding-agent loop**: in Claude Code, `/loop 1h mediagraph sync run <name>`.
- **Long-running watcher**: `mediagraph sync watch <name>` — useful on a
  laptop when you want low latency without a cron.
- **Manual**: just run `mediagraph sync run <name>` whenever.

`MEDIAGRAPH_SYNC_ROOT` env var overrides the state directory if you need a
portable install or per-environment isolation.

## When NOT to use

- Public/anonymous browsing of share links — use the share link URL directly
  in a browser.
- Real-time visual editing in a chat thread — use the `search_assets_visual`
  tool through the MCP server (Claude Desktop) instead; the plain CLI is
  designed for scripting, not interactive UI.
