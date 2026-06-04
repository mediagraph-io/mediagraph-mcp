/**
 * Agent-oriented Markdown guides.
 *
 * `mediagraph skill` keeps printing the package-level SKILL.md for backwards
 * compatibility. `mediagraph skills` exposes a small registry of focused
 * Markdown recipes that teach agents the Mediagraph app model and common CLI
 * workflows without requiring auth or network access.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CliError } from './errors.js';

export interface SkillDoc {
  name: string;
  title: string;
  description: string;
  markdown: string;
}

const ROOT_FALLBACK = [
  '# Mediagraph CLI',
  '',
  'Mediagraph is a digital asset management (DAM) platform. This CLI wraps',
  'its REST API as tools, all returning JSON on stdout.',
  '',
  'SKILL.md was not bundled with this install. Use these commands to explore:',
  '',
  '```bash',
  'mediagraph skills                    # focused agent recipe index',
  'mediagraph skills search             # asset search and inspection recipes',
  'mediagraph search-tools "<query>"    # ranked tool search',
  'mediagraph list-tools --brief        # all tools, one-line each',
  'mediagraph <tool_name> --help        # full schema for one tool',
  '```',
  '',
  'Headless auth: set MEDIAGRAPH_PAT and MEDIAGRAPH_ORGANIZATION_ID.',
  'Interactive: `mediagraph auth login`.',
  'Continuous folder sync: `mediagraph sync help`.',
].join('\n');

const SKILL_DOCS: SkillDoc[] = [
  {
    name: 'search',
    title: 'Search, Inspect, And Link Assets',
    description: 'Find assets, inspect metadata/renditions, generate deep links, and download files.',
    markdown: [
      '# Mediagraph Skill: Search, Inspect, And Link Assets',
      '',
      'Use this when the user asks to find media, audit what exists, inspect metadata, produce a DAM link, or download originals/previews.',
      '',
      '## Mental Model',
      '',
      '- `Asset` is the core media record. Processing state lives on the head `AssetDataVersion`, so `get_asset` and `watch asset` are better indicators than guessing from search results.',
      '- Search is backed by the Rails app\'s `AssetIndex` Elasticsearch index. Important indexed fields include `tag_text`, `filename.keyword`, `description`, `title`, `ext`, `creator_tag_text`, `ocr_content`, `content`, `storage_folder_path`, `collection_paths`, `lightbox_paths`, and `cmf1` through `cmf50`.',
      '- `search_assets` is the broad entry point. Use `get_asset` when you need full details, renditions, metadata, or a stable id/GUID for follow-up tools.',
      '- In MCP clients with UI support, `search_assets_visual` opens the visual gallery for thumbnail browsing and inline edits. The plain CLI is better for scripting.',
      '',
      '## Recipe: Find And Inspect',
      '',
      '```bash',
      'mediagraph search_assets --q \'tag_text:nature AND ext:jpg\' --per_page 25 --include_totals true',
      'mediagraph get_asset --id 123 --include_renditions true --include_meta true',
      'mediagraph generate_url --type asset --id 123',
      '```',
      '',
      '## Recipe: Find Gaps',
      '',
      '```bash',
      'mediagraph search_assets --q \'NOT tag_text:** AND ext:jpg\' --per_page 100',
      'mediagraph search_assets --q \'NOT description:**\' --per_page 100',
      'mediagraph search_assets --q \'ocr_content:invoice OR content:contract\' --per_page 25',
      '```',
      '',
      '## Recipe: Download Or Share A File',
      '',
      '```bash',
      'mediagraph get_asset_download --id 123 --size original',
      'mediagraph get_asset_download --id 123 --size permalink --watermarked true',
      'mediagraph bulk_download_assets --asset_ids 123,456 --size full --skip_meta true',
      '```',
      '',
      '## Search Syntax Reminders',
      '',
      '- Quote exact phrases: `"red barn"`.',
      '- Use boolean grouping for precise sets: `(dog OR cat) AND ext:jpg`.',
      '- Use existence checks: `tag_text:**` or `NOT tag_text:**`.',
      '- Use `.keyword` for exact filenames: `filename.keyword:IMG_1234.jpg`.',
      '- Prefer `--per_page 100` plus `--all --limit N` when collecting a full working set.',
      '',
      '## Follow-Up Tools',
      '',
      '- Organize found assets: `mediagraph skills organize`.',
      '- Bulk edit found assets: `mediagraph skills bulk`.',
      '- Rights/share found assets: `mediagraph skills sharing`.',
    ].join('\n'),
  },
  {
    name: 'organize',
    title: 'Organize Assets Into Folders, Collections, And Lightboxes',
    description: 'Understand asset groups, trees, membership, and safe ways to move or group assets.',
    markdown: [
      '# Mediagraph Skill: Organize Assets',
      '',
      'Use this when the user wants to structure a library, put assets into a collection/lightbox/storage folder, inspect trees, or invite people to a group.',
      '',
      '## Mental Model',
      '',
      '- `AssetGroup` is a Rails STI tree with three user-facing types: `StorageFolder`, `Collection`, and `Lightbox`.',
      '- `StorageFolder` is the file-system-like home for an asset. Assets belong directly by `storage_folder_id`.',
      '- `Collection` and `Lightbox` are curated groupings through `AssetGroupAsset` joins. Use them when one asset should appear in multiple contexts.',
      '- Trees use ancestry paths. Moving folders or changing memberships can require search reindexing before `collection_paths` or `lightbox_paths` searches reflect the change.',
      '- Lightbox sharing has per-user memberships. A specific-lightbox search can depend on `lightbox_paths`; a broad "all lightboxes" view can still work via `lightbox_ids`.',
      '',
      '## Recipe: Explore Trees',
      '',
      '```bash',
      'mediagraph get_storage_folders_tree',
      'mediagraph get_collections_tree',
      'mediagraph get_lightboxes_tree',
      'mediagraph list_collections --q "campaign" --per_page 20',
      '```',
      '',
      '## Recipe: Build A Curated Set',
      '',
      '```bash',
      'mediagraph create_collection --name "Spring campaign selects"',
      'mediagraph add_assets_to_group --asset_group_id 42 --ids 123,456,789',
      'mediagraph generate_url --type collection --id 42',
      '```',
      '',
      '## Recipe: Make A Temporary Review Space',
      '',
      '```bash',
      'mediagraph create_lightbox --name "Agency review"',
      'mediagraph add_asset_to_lightbox --lightbox_id 77 --asset_id 123',
      'mediagraph create_asset_group_invite --asset_group_id 77 --email reviewer@example.com --role viewer',
      '```',
      '',
      '## Recipe: Put Assets Into A Storage Folder',
      '',
      'For a few assets, use a bulk job so the server performs permission checks and reindexing consistently:',
      '',
      '```bash',
      'mediagraph create_bulk_job --asset_ids 123,456 --add_asset_group_id 88 --add_asset_group_type StorageFolder --wait',
      '```',
      '',
      '## Safety Notes',
      '',
      '- Use `--dry-run` on destructive tools like `delete_collection`, `delete_lightbox`, or `delete_asset` when available.',
      '- For large moves or duplicate operations, prefer `create_bulk_job` and `mediagraph watch bulk_job <guid>`.',
      '- If a user reports that a shared lightbox has assets in one view but zero in another, suspect stale `lightbox_paths` and re-check search/indexing state rather than assuming the assets are missing.',
    ].join('\n'),
  },
  {
    name: 'metadata',
    title: 'Tags, Taxonomies, Custom Metadata, And AI Fields',
    description: 'Tag assets, manage taxonomy terms, write custom meta fields, and run AI-backed metadata tasks.',
    markdown: [
      '# Mediagraph Skill: Metadata',
      '',
      'Use this when the user asks to enrich, normalize, tag, classify, or audit asset metadata.',
      '',
      '## Mental Model',
      '',
      '- Tags are searchable through `tag_text`; taxonomy paths are indexed separately for hierarchy-aware discovery.',
      '- Creator tags are distinct from normal tags and are useful for photographers, artists, and rights attribution.',
      '- Custom meta fields (CMFs) can be free text, single-select, or multi-select. The Rails app maps them into indexed fields `cmf1` through `cmf50`.',
      '- Composable AI (CAI) is represented as CMFs with AI enabled. Running AI against a field is a bulk operation when applied to many assets.',
      '',
      '## Recipe: Add Or Replace Tags',
      '',
      '```bash',
      'mediagraph add_tags_to_asset --id 123 --tags "spring,campaign,approved"',
      'mediagraph create_bulk_job --asset_ids 123,456 --tag_names "spring,campaign" --tag_mode add --wait',
      'mediagraph create_bulk_job --asset_ids 123,456 --tag_names "final" --tag_mode replace --wait',
      '```',
      '',
      '## Recipe: Manage Tag Vocabulary',
      '',
      '```bash',
      'mediagraph search-tools "taxonomy tag"',
      'mediagraph list_tags --q "person name" --per_page 20',
      'mediagraph check_tag_name --name "Spring Campaign"',
      'mediagraph create_tag --name "Spring Campaign"',
      'mediagraph merge_tags --source_id 10 --target_id 20',
      '```',
      '',
      '## Recipe: Write Custom Metadata',
      '',
      '```bash',
      'mediagraph list_custom_meta_fields --per_page 100',
      'mediagraph set_asset_custom_meta --id 123 --custom_meta_field_id 5 --value "Licensed for web"',
      'mediagraph set_asset_custom_meta --id 123 --custom_meta_field_id 6 --custom_meta_value_id 44',
      'mediagraph set_asset_custom_meta --id 123 --custom_meta_field_id 7 --custom_meta_value_ids 44,45',
      '```',
      '',
      '## Recipe: AI Metadata',
      '',
      '```bash',
      'mediagraph generate_asset_alt_text --id 123',
      'mediagraph run_asset_ai --id 123 --custom_meta_field_id 5',
      'mediagraph create_bulk_job --asset_ids 123,456 --run_custom_meta_field_ids 5,6 --cmf_overwrite_mode skip --wait',
      '```',
      '',
      '## Recipe: Faces And People',
      '',
      '```bash',
      'mediagraph get_asset_face_taggings --id 123',
      'mediagraph tag_asset_face --id 123 --face_id FACE_ID --name "Ada Lovelace"',
      'mediagraph search_asset_faces --id 456',
      'mediagraph block_asset_face --id 456 --face_id FACE_ID',
      '```',
      '',
      '## Safety Notes',
      '',
      '- For select and multi-select CMFs, inspect field definitions before writing IDs.',
      '- Use `cmf_overwrite_mode skip` unless the user explicitly wants to replace existing values.',
      '- Bulk tag replacement is destructive to the affected tag set. Confirm the working asset IDs first.',
    ].join('\n'),
  },
  {
    name: 'ingest',
    title: 'Upload, Process, And Sync Files',
    description: 'Upload local files, batch sessions, contribution uploads, processing watches, and folder sync.',
    markdown: [
      '# Mediagraph Skill: Upload, Process, And Sync Files',
      '',
      'Use this when the user wants to add files to Mediagraph, resume a batch, watch processing, or mirror a storage folder locally.',
      '',
      '## Mental Model',
      '',
      '- `Upload` is a session. It groups assets and is finalized with `set_upload_done`.',
      '- `AssetDataVersion` holds processing state and data-version details. After upload, watch the asset until it reaches `processed` or `processing_error`.',
      '- Files larger than 16 MiB automatically use direct-to-S3 multipart upload. Local `file_path` uploads stream from disk.',
      '- Contributions/upload links route uploads into configured destinations such as storage folders or lightboxes.',
      '',
      '## Recipe: One File',
      '',
      '```bash',
      'id=$(mediagraph upload_file --file_path /absolute/path/photo.jpg | jq -r .asset.id)',
      'mediagraph watch asset "$id" --timeout 600',
      'mediagraph get_asset --id "$id" --include_renditions true',
      '```',
      '',
      '## Recipe: Resumable Batch Session',
      '',
      '```bash',
      'session=$(mediagraph create_upload_session --name "Spring delivery")',
      'guid=$(printf "%s" "$session" | jq -r .guid)',
      'id=$(printf "%s" "$session" | jq -r .id)',
      'mediagraph upload_files --upload_guid "$guid" --file_paths /absolute/path/a.jpg,/absolute/path/b.mov',
      'mediagraph set_upload_done --id "$id"',
      'mediagraph watch upload "$id" --timeout 900',
      '```',
      '',
      '## Recipe: Upload Through A Contribution',
      '',
      '```bash',
      'mediagraph upload_file --contribution_id 55 --file_path /absolute/path/submission.pdf',
      'mediagraph list_uploads --per_page 10',
      '```',
      '',
      '## Recipe: Continuous Folder Sync',
      '',
      '```bash',
      'mediagraph sync init my-pull --mode download --storage-folder-id 42 --local-path /absolute/path/library --frequency hourly',
      'mediagraph sync run my-pull',
      'mediagraph sync status my-pull',
      'mediagraph sync install my-pull',
      '```',
      '',
      'Modes: `download` pulls remote file data versions, `upload` pushes new local files, and `two-way` writes conflict files next to local edits.',
      '',
      '## Safety Notes',
      '',
      '- Use absolute file paths. The CLI process cannot upload a path it cannot read.',
      '- Capture both upload `id` and `guid`: upload tools append by `guid`; finalization uses numeric `id`.',
      '- Metadata-only changes do not force sync re-downloads; file changes are tracked by data-version changes.',
    ].join('\n'),
  },
  {
    name: 'bulk',
    title: 'Bulk Jobs, Imports, Renames, And Exports',
    description: 'Run large asset operations, metadata/tag imports, rename previews, and CSV exports.',
    markdown: [
      '# Mediagraph Skill: Bulk Jobs, Imports, Renames, And Exports',
      '',
      'Use this when the user wants to update many assets, rename files, import spreadsheet metadata, export metadata, or monitor background work.',
      '',
      '## Mental Model',
      '',
      '- `BulkJob` is the server-side batch engine for tag changes, metadata edits, group adds/removes, rights assignment, delete/restore, rename, and AI runs.',
      '- The Rails app splits large bulk jobs into batches and broadcasts progress. Prefer `watch` for interactive progress and `--wait` when only the final result matters.',
      '- Meta imports and tag imports are separate job families with analyze -> map -> process flows.',
      '- Meta downloads are background CSV exports; they return a GUID and can email a link.',
      '',
      '## Recipe: Bulk Tag Or Rights Update',
      '',
      '```bash',
      'guid=$(mediagraph create_bulk_job --asset_ids 123,456 --tag_names "approved,web" --tag_mode add | jq -r .guid)',
      'mediagraph watch bulk_job "$guid"',
      'mediagraph create_bulk_job --asset_ids 123,456 --rights_package_id 9 --wait',
      '```',
      '',
      '## Recipe: Rename Safely',
      '',
      '```bash',
      'mediagraph list_rename_presets --per_page 50',
      'mediagraph preview_rename_bulk_job --rename_preset_id 4 --asset_ids 123,456 --custom_text "spring"',
      'mediagraph create_bulk_job --asset_ids 123,456 --rename_preset_id 4 --rename_custom_text "spring" --wait',
      '```',
      '',
      '## Recipe: Inspect Metadata Imports',
      '',
      '```bash',
      'mediagraph list_meta_imports --q "spring" --per_page 20',
      'mediagraph get_meta_import --id 77',
      '```',
      '',
      'The Rails app has a full metadata-import lifecycle. The current CLI tool surface exposes metadata-import inspection plus background metadata export. Use `mediagraph search-tools "meta import"` before assuming a create/update command is available in your installed version.',
      '',
      '## Recipe: Tag Import',
      '',
      '```bash',
      'mediagraph create_tag_import --file "s3-or-upload-reference.csv" --name_column "Name"',
      'mediagraph update_tag_import_mapping --id 88 --column \'{"name":"Parent","mapping":"parent"}\'',
      'mediagraph start_tag_import --id 88',
      'mediagraph watch tag_import 88',
      'mediagraph get_tag_import_tags --id 88 --per_page 100',
      '```',
      '',
      '## Recipe: Metadata Export',
      '',
      '```bash',
      'mediagraph get_meta_download_columns',
      'mediagraph create_meta_download --asset_ids "123,456,789" --column_preset basic --send_email true --wait',
      'mediagraph list_meta_downloads --per_page 10',
      '```',
      '',
      '## Safety Notes',
      '',
      '- Always establish the working asset ID set before creating a destructive bulk job.',
      '- Preview renames before applying them.',
      '- `--wait` returns final state only; `watch` streams progress events and is better for long jobs.',
    ].join('\n'),
  },
  {
    name: 'sharing',
    title: 'Rights, Share Links, Shares, And Access Grants',
    description: 'Publish or grant access while respecting rights packages, permissions, watermarks, and expiration.',
    markdown: [
      '# Mediagraph Skill: Rights And Sharing',
      '',
      'Use this when the user wants a public link, an internal share, an access request/grant, a rights package assignment, or a download permission audit.',
      '',
      '## Mental Model',
      '',
      '- `RightsPackage` controls rights and expiry behavior on assets.',
      '- `ShareLink` belongs to an asset group and is link-style external access with download/view permissions, watermarks, notes, and expiration.',
      '- `Share` is a one-off transfer of assets or a group to a user, distinct from public share links.',
      '- `AccessRequest` can become an access grant. Grants can require terms agreement before access.',
      '',
      '## Recipe: Assign Rights',
      '',
      '```bash',
      'mediagraph list_rights_packages --per_page 100',
      'mediagraph update_asset --id 123 --copyright "Example Studio"',
      'mediagraph create_bulk_job --asset_ids 123,456 --rights_package_id 9 --wait',
      '```',
      '',
      '## Recipe: Create A Share Link',
      '',
      '```bash',
      'mediagraph create_share_link --asset_group_id 42 --image_and_video_permission download_large --other_permission download --watermark_all true --expires_at 2026-12-31T23:59:59Z',
      'mediagraph list_share_links --q "Spring campaign" --per_page 10',
      'mediagraph get_share_status --id 99',
      '```',
      '',
      '## Recipe: Internal Share',
      '',
      '```bash',
      'mediagraph create_share --asset_ids 123,456 --email user@example.com --message "For review"',
      'mediagraph get_share --id 55',
      'mediagraph get_share_assets --id 55 --per_page 100',
      'mediagraph get_share_html --id 55',
      '```',
      '',
      '## Recipe: Access Request Or Grant',
      '',
      '```bash',
      'mediagraph list_access_requests --type request --aasm_state submitted',
      'mediagraph get_access_request --id 77',
      'mediagraph finalize_access_request --id 77',
      'mediagraph list_access_grants --per_page 50',
      '```',
      '',
      '## Safety Notes',
      '',
      '- Use the least permissive download level that satisfies the request.',
      '- Prefer expiring links for external review.',
      '- Watermark public links when rights status is uncertain.',
      '- Rights assignments and grants can be permission-sensitive; inspect structured `INSUFFICIENT_SCOPE` errors instead of retrying.',
    ].join('\n'),
  },
  {
    name: 'workflows',
    title: 'Approval Workflows, Comments, And Notifications',
    description: 'Inspect approval queues, approve selected assets, and collaborate through comments/notifications.',
    markdown: [
      '# Mediagraph Skill: Workflows, Comments, And Notifications',
      '',
      'Use this when the user asks about approval queues, review stages, picks, comments, or user-facing notifications.',
      '',
      '## Mental Model',
      '',
      '- `Workflow` defines a multi-step approval pipeline.',
      '- `WorkflowStep` attaches workflow logic to asset groups and records selected, picked, approved, and rejected assets.',
      '- Approval data is indexed onto assets through fields like `picked_workflow_step_ids`, `approved_workflow_step_ids`, and `rejected_workflow_step_ids`.',
      '- Comments are linked to assets or commentable groups and are useful for leaving audit/context during review.',
      '',
      '## Recipe: Inspect A Review Queue',
      '',
      '```bash',
      'mediagraph list_workflows --per_page 50',
      'mediagraph list_workflow_steps --per_page 50',
      'mediagraph get_workflow_step --id 12',
      'mediagraph search_assets --q "approved_workflow_step_ids:12 OR picked_workflow_step_ids:12" --per_page 100',
      '```',
      '',
      '## Recipe: Approve Selected Assets',
      '',
      '```bash',
      'mediagraph approve_workflow_step --id 12 --asset_ids 123,456',
      'mediagraph approve_workflow_step_picks --id 12 --asset_ids 123,456',
      'mediagraph get_workflow_step --id 12',
      '```',
      '',
      '## Recipe: Comment And Notify',
      '',
      '```bash',
      'mediagraph search-tools "comment"',
      'mediagraph create_comment --type Lightbox --id 77 --text "Approved for the landing page."',
      'mediagraph list_notifications --per_page 20',
      'mediagraph get_notification_count',
      '```',
      '',
      '## Safety Notes',
      '',
      '- Confirm the workflow step and asset IDs before approving. Approval operations move work forward.',
      '- If a workflow view looks stale, re-check asset search fields and the group that owns the step.',
      '- Comments are collaborative artifacts; keep them factual and user-facing.',
    ].join('\n'),
  },
  {
    name: 'admin',
    title: 'Admin, Memberships, Webhooks, And Integrations',
    description: 'Manage users, invites, PATs, webhooks, organization settings, URLs, and integration-oriented checks.',
    markdown: [
      '# Mediagraph Skill: Admin And Integrations',
      '',
      'Use this when the user asks to manage memberships, invites, user groups, PATs, webhooks, organization state, or integration links.',
      '',
      '## Mental Model',
      '',
      '- The API uses the `OrganizationId` header; auth status should show the active organization before admin changes.',
      '- Membership roles are organization-level. Group permissions and asset-group invites are separate from membership roles.',
      '- PATs are useful for headless agents but their scopes are not introspectable from the CLI. Inspect server errors and list PAT records when permitted.',
      '- Webhooks have request logs; test a webhook before relying on it in an automation.',
      '',
      '## Recipe: Orient Auth And Org',
      '',
      '```bash',
      'mediagraph auth status',
      'mediagraph whoami',
      'mediagraph list_my_organizations',
      'mediagraph generate_url --type explore',
      '```',
      '',
      '## Recipe: Memberships And Invites',
      '',
      '```bash',
      'mediagraph search_memberships --q user@example.com',
      'mediagraph list_user_groups --per_page 100',
      'mediagraph create_invite --email user@example.com --role_level general --note "Added by automation"',
      'mediagraph list_invites --per_page 50',
      '```',
      '',
      '## Recipe: PATs For Agents',
      '',
      '```bash',
      'mediagraph list_personal_access_tokens --per_page 50',
      'mediagraph create_personal_access_token --name "agent-readonly" --scopes "asset:read,tag:read"',
      'mediagraph disable_personal_access_token --id 123',
      '```',
      '',
      'Set both `MEDIAGRAPH_PAT` and `MEDIAGRAPH_ORGANIZATION_ID` for headless use.',
      '',
      '## Recipe: Webhooks',
      '',
      '```bash',
      'mediagraph list_webhooks --per_page 50',
      'mediagraph create_webhook --name "Asset updates" --url https://example.com/hooks/mediagraph --events "asset.created,asset.updated"',
      'mediagraph get_webhook --id 12',
      'mediagraph get_webhook_logs --id 12 --per_page 20',
      '```',
      '',
      '## Safety Notes',
      '',
      '- Admin operations are scope and role sensitive. Treat `INSUFFICIENT_SCOPE` as permanent for the current token.',
      '- Do not print PAT values into logs or chat once created.',
      '- For destructive admin changes, use `--dry-run` where the command supports it and confirm the org from `auth status` first.',
    ].join('\n'),
  },
];

export function runSkillCli(args: string[] = []): void {
  if (args.length > 0) {
    runSkillsCli(args);
    return;
  }
  process.stdout.write(`${loadRootSkillDoc()}\n`);
}

export function runSkillsCli(args: string[] = []): void {
  const command = args[0];

  if (!command) {
    process.stdout.write(`${loadSkillsIndexDoc()}\n`);
    return;
  }

  if (command === '--help' || command === '-h' || command === 'help') {
    process.stdout.write(`${skillsHelp()}\n`);
    return;
  }

  if (command === 'list' || command === '--list') {
    process.stdout.write(`${loadSkillListDoc()}\n`);
    return;
  }

  if (command === 'all' || command === '--all') {
    process.stdout.write(`${loadAllSkillDocs()}\n`);
    return;
  }

  const doc = findSkillDoc(command);
  if (!doc) {
    throw new CliError(
      'BAD_ARGS',
      `Unknown skill: ${command}`,
      `Run \`mediagraph skills list\` to see available skill names.`,
    );
  }

  process.stdout.write(`${doc.markdown}\n`);
}

export function loadRootSkillDoc(): string {
  for (const path of candidateRootSkillPaths()) {
    if (existsSync(path)) {
      try {
        return readFileSync(path, 'utf-8');
      } catch {
        // fall through to next candidate
      }
    }
  }
  return ROOT_FALLBACK;
}

export function listSkillDocs(): SkillDoc[] {
  return SKILL_DOCS.map(doc => ({ ...doc }));
}

export function findSkillDoc(name: string): SkillDoc | undefined {
  return SKILL_DOCS.find(doc => doc.name === normalizeSkillName(name));
}

export function loadSkillsIndexDoc(): string {
  return [
    '# Mediagraph Skills',
    '',
    'Focused Markdown guides for agents using the `mediagraph` CLI or MCP server. These are bundled and offline; they teach the app model, what is possible, and common workflows before you spend context on schemas or API calls.',
    '',
    'The guides are grounded in the Mediagraph Rails app primitives: `Asset`, `AssetDataVersion`, `AssetGroup` (`StorageFolder`, `Collection`, `Lightbox`), `AssetIndex`, `BulkJob`, `Upload`, `ShareLink`, `AccessRequest`, `Workflow`, tags, taxonomies, custom meta fields, memberships, and webhooks.',
    '',
    '## Start Here',
    '',
    '```bash',
    'mediagraph skills list             # compact list of focused guides',
    'mediagraph skills search           # asset search, inspection, URLs, downloads',
    'mediagraph skills organize         # folders, collections, lightboxes',
    'mediagraph skills bulk             # batch edits, imports, exports, rename',
    'mediagraph skills all              # print every focused guide',
    'mediagraph skill                   # legacy full onboarding guide',
    'mediagraph search-tools "rename"   # discover exact tool schemas',
    '```',
    '',
    '## Available Guides',
    '',
    ...SKILL_DOCS.map(doc => `- \`${doc.name}\` - ${doc.description}`),
    '',
    '## Agent Operating Pattern',
    '',
    '1. Run `mediagraph auth status` when live data or mutations are needed.',
    '2. Use `mediagraph skills <name>` to pick the workflow family.',
    '3. Use `mediagraph search-tools "<intent>"` to find exact tools.',
    '4. Use `<tool_name> --help` for the JSON-schema-derived flags.',
    '5. For writes, first identify the exact asset/group/user IDs, then use `--dry-run` where available.',
    '6. For async work, use `mediagraph watch <type> <id>` when progress matters or `--wait` when only final state matters.',
  ].join('\n');
}

export function loadSkillListDoc(): string {
  return [
    '# Mediagraph Skill List',
    '',
    ...SKILL_DOCS.map(doc => `- \`${doc.name}\`: ${doc.title} - ${doc.description}`),
  ].join('\n');
}

export function loadAllSkillDocs(): string {
  return [
    loadSkillsIndexDoc(),
    ...SKILL_DOCS.map(doc => doc.markdown),
  ].join('\n\n---\n\n');
}

function skillsHelp(): string {
  return [
    'Usage:',
    '  mediagraph skills                 Print the focused skill index',
    '  mediagraph skills list            List available focused guides',
    '  mediagraph skills all             Print every focused guide',
    '  mediagraph skills <name>          Print one focused Markdown guide',
    '  mediagraph skill [name]           Legacy full guide, or alias for a named focused guide',
    '',
    'Available names:',
    `  ${SKILL_DOCS.map(doc => doc.name).join(', ')}`,
  ].join('\n');
}

function normalizeSkillName(name: string): string {
  return name.trim().toLowerCase();
}

function candidateRootSkillPaths(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    // Production npm install: dist/index.js -> ../SKILL.md
    join(here, '..', 'SKILL.md'),
    // tsup-style build with chunked output: dist/chunk-*.js -> ../SKILL.md
    join(here, '..', '..', 'SKILL.md'),
    // Repo dev: src/cli/skill.ts -> ../../SKILL.md
    join(here, '..', '..', 'SKILL.md'),
  ];
}
