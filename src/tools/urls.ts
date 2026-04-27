/**
 * `generate_url` tool — produce deep-link URLs for Mediagraph entities.
 *
 * The pure URL-building logic lives in `src/api/urls.ts`. This wrapper:
 *   - resolves the host (custom domain via whoami, fallback mediagraph.io/{slug})
 *   - optionally fetches the entity to get a slug/composite param
 *   - returns `{ url, host, path, type, identifier }`
 *
 * One tool covers every linkable entity to keep the surface flat — agents
 * just pick a `type` rather than memorizing per-entity tools.
 */

import { successResult, errorResult, type ToolModule } from './shared.js';
import {
  pathFor,
  buildHost,
  urlFor,
  UrlBuildError,
  type EntityIdentifier,
  type EntityType,
  type UrlContext,
} from '../api/urls.js';
import type { MediagraphClient } from '../api/client.js';

const SUPPORTED_TYPES: EntityType[] = [
  'asset', 'collection', 'lightbox', 'storage_folder', 'tag', 'creator_tag', 'share_link', 'explore',
];

export const urlTools: ToolModule = {
  definitions: [
    {
      name: 'generate_url',
      description: `Generate a direct deep-link URL to a Mediagraph entity (asset, collection, lightbox, storage folder, tag, creator tag, share link, or the explore root).

Two host modes:
- Custom domain: when the org has one set (e.g. "dam.mer.fm"), URLs use https://{domain}/explore/...
- Default: https://mediagraph.io/{org-slug}/explore/...

Path patterns:
  asset            → /explore#/assets/{guid}        (hash route)
  collection       → /explore/collections/{slug}
  lightbox         → /explore/projects/{id}-{slug}
  storage_folder   → /explore/folders/{slug}
  tag, creator_tag → /explore/tags/{id}-{name}
  share_link       → /share-links/{share_code}

Identifier rules:
- Pass whichever identifier you already have (guid, slug, id+name, etc.); the tool fetches the entity if needed to derive the rest.
- For assets, only guid is needed.
- For collections / storage folders, slug works directly.
- For lightboxes, the API returns a composite "slug" of the form "{id}-{name}" — pass it as slug.
- For tags, pass id (and optionally name for a prettier URL).

Override host with --host (e.g., point at staging) or --base_host (just the fallback).`,
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: SUPPORTED_TYPES, description: 'Entity type' },
          id: { type: ['number', 'string'], description: 'Numeric id (for lightbox + tag composite URLs, or to auto-fetch)' },
          guid: { type: 'string', description: 'Asset guid' },
          slug: { type: 'string', description: 'Pre-computed slug (collection / storage_folder / lightbox composite)' },
          name: { type: 'string', description: 'Tag/lightbox name (used to build the {id}-{name} composite if slug missing)' },
          share_code: { type: 'string', description: 'Share code for share_link URLs' },
          host: { type: 'string', description: 'Override the full host (e.g. "dam.mer.fm" or "https://staging.example.com")' },
          base_host: { type: 'string', description: 'Override only the no-custom-domain fallback host. Default https://mediagraph.io' },
          autofetch: { type: 'boolean', description: 'When true (default) and a required identifier is missing, fetch the entity to derive it.' },
        },
        required: ['type'],
      },
    },
  ],

  handlers: {
    async generate_url(args, { client }) {
      const type = args.type as EntityType;
      const ident: EntityIdentifier = {
        id: args.id as number | string | undefined,
        guid: args.guid as string | undefined,
        slug: args.slug as string | undefined,
        name: args.name as string | undefined,
        share_code: args.share_code as string | undefined,
      };
      const autofetch = args.autofetch === undefined ? true : !!args.autofetch;

      try {
        // 1. Resolve host: explicit override → org's custom domain → default+slug
        const ctx = await resolveContext(client, args.host as string | undefined, args.base_host as string | undefined);

        // 2. If we don't have what the path-builder needs, fetch the entity (when allowed).
        if (autofetch) {
          await maybeAutofetch(type, ident, client);
        }

        // 3. Build.
        const path = pathFor(type, ident);
        const host = buildHost(ctx);
        const url = `${host}${path}`;

        return successResult({
          url,
          host,
          path,
          type,
          identifier: stripUndefined(ident as unknown as Record<string, unknown>),
        });
      } catch (e) {
        if (e instanceof UrlBuildError) return errorResult(e.message);
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    },
  },
};

async function resolveContext(client: MediagraphClient, hostOverride: string | undefined, baseHost: string | undefined): Promise<UrlContext> {
  if (hostOverride) {
    // If user passes a full URL, treat it as the custom domain. Strip protocol.
    return { customDomain: hostOverride.replace(/^https?:\/\//, '').replace(/\/.*$/, '') };
  }
  // whoami carries org slug + custom domain (Organization JSON exposes :domain)
  const me = await client.whoami();
  const org = (me as { organization?: { slug?: string; domain?: string } }).organization;
  return {
    customDomain: org?.domain || undefined,
    orgSlug: org?.slug,
    baseHost,
  };
}

async function maybeAutofetch(type: EntityType, ident: EntityIdentifier, client: MediagraphClient): Promise<void> {
  if (type === 'explore') return;
  if (type === 'share_link') return; // share_code is the only acceptable identifier; no auto-fetch.

  // Asset: needs guid. If only id is given, fetch.
  if (type === 'asset' && !ident.guid && ident.id !== undefined) {
    const a = await client.getAsset(ident.id);
    ident.guid = (a as { guid?: string }).guid;
    return;
  }

  // Collection / storage_folder: need slug. If only id is given, fetch.
  if (type === 'collection' && !ident.slug && ident.id !== undefined) {
    const c = await client.getCollection(ident.id);
    ident.slug = (c as { slug?: string }).slug;
    return;
  }
  if (type === 'storage_folder' && !ident.slug && ident.id !== undefined) {
    const sf = await client.getStorageFolder(ident.id);
    ident.slug = (sf as { slug?: string }).slug;
    return;
  }

  // Lightbox: API returns the composite as `slug`. Fetch if id given but slug missing.
  if (type === 'lightbox' && !ident.slug && ident.id !== undefined) {
    const lb = await client.getLightbox(ident.id);
    const fetched = lb as { slug?: string; name?: string };
    ident.slug = fetched.slug;
    if (!ident.name) ident.name = fetched.name;
    return;
  }

  // Tag: id is sufficient on its own (the URL just needs a numeric prefix).
  // If we have id + nothing, fetch to get a prettier name. If we already
  // have name, don't bother.
  if ((type === 'tag' || type === 'creator_tag') && ident.id !== undefined && !ident.name) {
    try {
      const t = await client.getTag(ident.id);
      ident.name = (t as { name?: string }).name;
    } catch {
      // optional enrichment; keep going with id-only URL.
    }
  }
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

void urlFor;
