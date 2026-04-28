/**
 * Scope vocabulary and pre-flight helpers — mirrors the server's scope check.
 *
 * Scopes are `<key>:<level>` where level ∈ {read, write} and `write` implies
 * `read` for the same key. Keys are entity (singular, e.g. `asset:write`)
 * or group (plural, e.g. `assets:write`, which covers every entity in that
 * group). Sibling entities are independent unless bridged via the group form.
 * Empty `scope_list` and legacy bare `read`/`write`/`public` are full-access.
 */

export type ScopeLevel = 'read' | 'write';
export type ScopeTier = 'basic' | 'advanced';

/**
 * Group → entities membership. Mirror of the server's table; kept in sync
 * by hand. The order doesn't matter; the reverse lookup
 * (`ENTITY_TO_GROUP`) is built from this.
 */
export const ENTITIES_BY_GROUP = {
  // ── basic ───────────────────────────────────────────────────────────────
  assets: ['asset', 'asset_data_version', 'download', 'meta_download', 'meta_struct', 'comment', 'published_asset'],
  tags: ['tag', 'tagging', 'taxonomy', 'taxonomy_tag', 'creator_tag', 'auto_tag'],
  collections: ['collection', 'project', 'collection_share'],
  lightboxes: ['lightbox', 'asset_group_invite', 'asset_group_membership', 'asset_group_lightroom_connection'],
  storage_folders: ['storage_folder'],
  uploads: ['upload', 'bulk_upload', 'ingestion', 'contribution'],
  bulk_jobs: ['bulk_job'],

  // ── advanced ────────────────────────────────────────────────────────────
  users: ['membership', 'membership_request', 'invite', 'profile'],
  user_groups: ['user_group'],
  permissions: ['permission'],
  webhooks: ['webhook'],
  workflows: ['workflow', 'workflow_step'],
  custom_meta_fields: ['custom_meta_field', 'meta_import'],
  share_links: ['share_link', 'share'],
  access_requests: ['access_request', 'access_grant'],
  rights_packages: ['rights_package'],
  reports: ['tag_import', 'taxonomy_import', 'notification'],
  organization_settings: [
    'organization', 'crop_preset', 'rename_preset', 'filter_group',
    'link', 'sitewide_announcement', 'tag_suggester', 'invoice',
  ],
} as const;

export const BASIC_SCOPE_GROUPS = [
  'assets', 'tags', 'collections', 'lightboxes', 'storage_folders', 'uploads', 'bulk_jobs',
] as const;

export const ADVANCED_SCOPE_GROUPS = [
  'users', 'user_groups', 'permissions', 'webhooks', 'workflows',
  'custom_meta_fields', 'share_links', 'access_requests', 'rights_packages',
  'reports', 'organization_settings',
] as const;

export type ScopeGroup = (typeof BASIC_SCOPE_GROUPS)[number] | (typeof ADVANCED_SCOPE_GROUPS)[number];

/** Reverse lookup: entity → its group. Built once at module load. */
const ENTITY_TO_GROUP: Record<string, ScopeGroup> = (() => {
  const out: Record<string, ScopeGroup> = {};
  for (const [group, entities] of Object.entries(ENTITIES_BY_GROUP)) {
    for (const e of entities) out[e] = group as ScopeGroup;
  }
  return out;
})();

const BASIC_GROUP_SET: ReadonlySet<string> = new Set(BASIC_SCOPE_GROUPS);
const ADVANCED_GROUP_SET: ReadonlySet<string> = new Set(ADVANCED_SCOPE_GROUPS);

/** Group lookup for an entity (singular) key. Returns null if unknown. */
export function groupForEntity(entity: string): ScopeGroup | null {
  return ENTITY_TO_GROUP[entity] ?? null;
}

/**
 * Tier of a scope key. Accepts either an entity (singular) or a group
 * (plural); for entities we resolve to the owning group first. Throws on
 * unknown keys so callers don't silently classify as basic.
 */
export function scopeTier(groupOrEntity: string): ScopeTier {
  if (BASIC_GROUP_SET.has(groupOrEntity)) return 'basic';
  if (ADVANCED_GROUP_SET.has(groupOrEntity)) return 'advanced';
  const group = ENTITY_TO_GROUP[groupOrEntity];
  if (group) return BASIC_GROUP_SET.has(group) ? 'basic' : 'advanced';
  throw new Error(`Unknown scope key: ${groupOrEntity}`);
}

/**
 * Controller (path segment after `/api/`) → entity key. Mirror of the
 * server's table. Controllers not listed here are unenforced
 * (e.g. /api/whoami, /api/integrations/*, /api/personal_access_tokens) —
 * pre-flight should skip them rather than guess.
 */
const CONTROLLER_TO_ENTITY: Record<string, string> = {
  // assets group
  assets: 'asset',
  asset_data_versions: 'asset_data_version',
  downloads: 'download',
  meta_downloads: 'meta_download',
  meta_structs: 'meta_struct',
  comments: 'comment',
  published_assets: 'published_asset',

  // tags group
  tags: 'tag',
  taggings: 'tagging',
  taxonomies: 'taxonomy',
  taxonomy_tags: 'taxonomy_tag',
  creator_tags: 'creator_tag',
  auto_tags: 'auto_tag',

  // collections group
  collections: 'collection',
  projects: 'project',
  collection_shares: 'collection_share',

  // lightboxes group
  lightboxes: 'lightbox',
  asset_group_invites: 'asset_group_invite',
  asset_group_memberships: 'asset_group_membership',
  asset_group_lightroom_connections: 'asset_group_lightroom_connection',

  // storage_folders group
  storage_folders: 'storage_folder',

  // uploads group
  uploads: 'upload',
  bulk_uploads: 'bulk_upload',
  ingestions: 'ingestion',
  contributions: 'contribution',

  // bulk_jobs group (its own group now — was previously under reports)
  bulk_jobs: 'bulk_job',

  // users group
  memberships: 'membership',
  membership_requests: 'membership_request',
  invites: 'invite',
  profile: 'profile',

  // single-entity advanced groups
  user_groups: 'user_group',
  permissions: 'permission',
  webhooks: 'webhook',

  // workflows group
  workflows: 'workflow',
  workflow_steps: 'workflow_step',

  // custom_meta_fields group
  custom_meta_fields: 'custom_meta_field',
  meta_imports: 'meta_import',

  // share_links group
  share_links: 'share_link',
  shares: 'share',

  // access_requests group
  access_requests: 'access_request',
  access_grants: 'access_grant',

  // rights_packages group
  rights_packages: 'rights_package',

  // reports group
  tag_imports: 'tag_import',
  taxonomy_imports: 'taxonomy_import',
  notifications: 'notification',

  // organization_settings group
  organizations: 'organization',
  crop_presets: 'crop_preset',
  rename_presets: 'rename_preset',
  filter_groups: 'filter_group',
  links: 'link',
  sitewide_announcements: 'sitewide_announcement',
  tag_suggesters: 'tag_suggester',
  invoices: 'invoice',
};

/** First path segment after `/api/`. Returns null if the path isn't `/api/...`. */
export function controllerForPath(path: string): string | null {
  const cleaned = path.split('?')[0].split('#')[0].replace(/^\/+/, '');
  if (!cleaned.startsWith('api/')) return null;
  const after = cleaned.slice('api/'.length);
  if (!after) return null;
  const segment = after.split('/')[0];
  return segment || null;
}

/** Entity key for a request path, or null if the endpoint isn't scope-enforced. */
export function entityForPath(path: string): string | null {
  const ctrl = controllerForPath(path);
  if (!ctrl) return null;
  return CONTROLLER_TO_ENTITY[ctrl] ?? null;
}

/** Group for a request path, or null if unmapped. Convenience for error messaging. */
export function groupForPath(path: string): ScopeGroup | null {
  const entity = entityForPath(path);
  return entity ? groupForEntity(entity) : null;
}

export function levelForMethod(method: string): ScopeLevel {
  return method === 'GET' || method === 'HEAD' ? 'read' : 'write';
}

/**
 * Compute the entity-level scope a given request would need, or null if
 * the endpoint isn't scope-enforced (skip pre-flight in that case).
 */
export function requiredScopeFor(method: string, path: string): string | null {
  const entity = entityForPath(path);
  if (!entity) return null;
  return `${entity}:${levelForMethod(method)}`;
}

/**
 * Treat a token as full-access if its scope list is empty/missing or matches
 * the legacy bare strings (`read`, `write`, `public`). The server keeps
 * these tokens working without scope checks — pre-flight mirrors that.
 */
export function isFullAccessScopeList(scopes: readonly string[] | null | undefined): boolean {
  if (!scopes || scopes.length === 0) return true;
  const legacy = new Set(['read', 'write', 'public']);
  return scopes.every((s) => legacy.has(s));
}

/** Every known entity-level scope at the given level. */
export function allEntityScopes(level: ScopeLevel): string[] {
  const out: string[] = [];
  for (const entities of Object.values(ENTITIES_BY_GROUP)) {
    for (const e of entities) out.push(`${e}:${level}`);
  }
  return out;
}

const ENTITY_SET: ReadonlySet<string> = new Set(Object.keys(ENTITY_TO_GROUP));
const GROUP_SET: ReadonlySet<string> = new Set([...BASIC_SCOPE_GROUPS, ...ADVANCED_SCOPE_GROUPS]);

/**
 * Parse a user-provided scope spec — CSV or whitespace-separated. Each token
 * is one of: an entity (`asset`), a group (`assets`), or an explicit
 * `<key>:<level>`. Bare keys default to `:write`. Unknown keys throw so
 * typos surface before the OAuth round-trip.
 */
export function parseScopeArg(input: string): string[] {
  const tokens = input.split(/[\s,]+/).map(t => t.trim()).filter(Boolean);
  const out: string[] = [];
  for (const tok of tokens) {
    const colon = tok.indexOf(':');
    const [key, lvl] = colon === -1 ? [tok, 'write'] : [tok.slice(0, colon), tok.slice(colon + 1)];
    if (lvl !== 'read' && lvl !== 'write') {
      throw new Error(`Invalid scope level in \`${tok}\` (expected :read or :write).`);
    }
    if (!ENTITY_SET.has(key) && !GROUP_SET.has(key)) {
      throw new Error(`Unknown scope key \`${key}\` in \`${tok}\`.`);
    }
    out.push(`${key}:${lvl}`);
  }
  return out;
}

function levelCovers(have: string, need: string): boolean {
  if (have === need) return true;
  return have === 'write' && need === 'read';
}

/**
 * True if `scopes` covers `required` (entity-level `entity:level`).
 * Sibling entities are independent — only the owning group bridges them.
 */
export function scopesCover(scopes: readonly string[] | null | undefined, required: string): boolean {
  if (isFullAccessScopeList(scopes)) return true;
  if (!scopes) return false;
  const [needKey, needLevel] = required.split(':');
  if (!needKey || !needLevel) return false;
  const owningGroup = ENTITY_TO_GROUP[needKey] ?? null;

  for (const s of scopes) {
    const [haveKey, haveLevel] = s.split(':');
    if (!haveKey || !haveLevel) continue;
    if (haveKey === needKey && levelCovers(haveLevel, needLevel)) return true;
    if (owningGroup && haveKey === owningGroup && levelCovers(haveLevel, needLevel)) return true;
  }
  return false;
}
