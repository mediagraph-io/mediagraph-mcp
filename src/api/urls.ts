/**
 * Deep-link URL generation for Mediagraph entities.
 *
 * Two host modes:
 *   - **Custom domain**: `https://{domain}/explore/...` — no org-slug prefix.
 *     The org's `domain` field is set in Mediagraph admin (e.g. `dam.mer.fm`).
 *   - **No custom domain (default)**: `https://mediagraph.io/{org_slug}/explore/...`
 *     Mirrors `AssetGroup#url` in the Rails app.
 *
 * Path patterns (mirroring frontend routes):
 *   asset           → /explore#/assets/{guid}                   (hash route)
 *   collection      → /explore/collections/{slug}
 *   lightbox        → /explore/projects/{id}-{slug}             (composite, from Lightbox#to_param)
 *   storage_folder  → /explore/folders/{slug}
 *   tag, creator_tag → /explore/tags/{id}-{normalize(name)}      (mirrors frontend TaxonomyTree.jsx)
 *   share_link      → /share-links/{share_code}
 *   explore         → /explore                                   (org root)
 *
 * This module is pure — no HTTP. Callers fetch entity data first and pass
 * the slug/guid/name they already have. The `generate_url` tool wraps this
 * with optional auto-fetch.
 */

export interface UrlContext {
  /** Custom domain (no protocol), e.g. "dam.mer.fm". When set, paths skip the org-slug prefix. */
  customDomain?: string;
  /** Org slug for the fallback path. Required when customDomain is unset. */
  orgSlug?: string;
  /** Default fallback host (e.g. "https://mediagraph.io"). */
  baseHost?: string;
}

export type EntityType =
  | 'asset'
  | 'collection'
  | 'lightbox'
  | 'storage_folder'
  | 'tag'
  | 'creator_tag'
  | 'share_link'
  | 'explore';

export interface EntityIdentifier {
  /** Numeric id. Required for lightbox + tag (composite) URLs. */
  id?: number | string;
  /** Asset guid (used by asset URLs only). */
  guid?: string;
  /** Slug for collections, storage folders, lightboxes (lightbox slug, not id). */
  slug?: string;
  /** Tag name; used to build the {id}-{name} composite. */
  name?: string;
  /** Share code for share_link. */
  share_code?: string;
}

export class UrlBuildError extends Error {}

const DEFAULT_BASE_HOST = 'https://mediagraph.io';

export function buildHost(ctx: UrlContext): string {
  if (ctx.customDomain) {
    const d = ctx.customDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    return `https://${d}`;
  }
  if (!ctx.orgSlug) {
    throw new UrlBuildError(
      'Cannot build URL: organization has no custom domain and no orgSlug was provided. ' +
      'Pass --host or call whoami first.',
    );
  }
  const base = (ctx.baseHost || DEFAULT_BASE_HOST).replace(/\/+$/, '');
  return `${base}/${encodeURIComponent(ctx.orgSlug)}`;
}

export function urlFor(type: EntityType, ident: EntityIdentifier, ctx: UrlContext): string {
  const host = buildHost(ctx);
  const path = pathFor(type, ident);
  return `${host}${path}`;
}

export function pathFor(type: EntityType, ident: EntityIdentifier): string {
  switch (type) {
    case 'explore':
      return '/explore';

    case 'asset': {
      if (!ident.guid) {
        throw new UrlBuildError('asset URLs require a guid (32-char UUID).');
      }
      return `/explore#/assets/${encodeURIComponent(ident.guid)}`;
    }

    case 'collection': {
      if (!ident.slug) {
        throw new UrlBuildError('collection URLs require a slug. Fetch the collection first to get its slug.');
      }
      return `/explore/collections/${encodeURIComponent(ident.slug)}`;
    }

    case 'storage_folder': {
      if (!ident.slug) {
        throw new UrlBuildError('storage_folder URLs require a slug.');
      }
      return `/explore/folders/${encodeURIComponent(ident.slug)}`;
    }

    case 'lightbox': {
      // Lightbox#to_param is `{id}-{slug}` for non-folder lightboxes.
      // The API returns this composite as `slug` in the lightbox JSON
      // (json.slug lightbox.to_param), so passing `slug` alone works.
      if (ident.slug) return `/explore/projects/${encodeURIComponent(ident.slug)}`;
      if (ident.id !== undefined && ident.name) {
        return `/explore/projects/${encodeURIComponent(`${ident.id}-${normalizeName(ident.name)}`)}`;
      }
      throw new UrlBuildError(
        'lightbox URLs need either `slug` (which is the {id}-{name} composite from the API) or both `id` and `name`.',
      );
    }

    case 'tag':
    case 'creator_tag': {
      // Mirrors frontend `tags/${id}-${name.replace(/\s+/g,'-')}`.
      if (ident.id === undefined) {
        throw new UrlBuildError('tag URLs require id (and optionally name).');
      }
      const seg = ident.name
        ? `${ident.id}-${normalizeName(ident.name)}`
        : String(ident.id);
      return `/explore/tags/${encodeURIComponent(seg)}`;
    }

    case 'share_link': {
      if (!ident.share_code) {
        throw new UrlBuildError('share_link URLs require share_code.');
      }
      return `/share-links/${encodeURIComponent(ident.share_code)}`;
    }
  }
}

/**
 * Normalize a name into a URL slug fragment.
 *
 * The frontend (TaxonomyTree.jsx) does a minimal `name.replace(' ', '-')` and
 * preserves case; the user's example URL is `tags/609-Grandparent` with the
 * capital G intact. We follow the same convention: replace whitespace runs
 * with hyphens, leave case alone, leave other punctuation alone.
 *
 * The Rails router parses `:tagId` permissively (it splits on the first
 * hyphen and uses the numeric prefix), so exact slug fidelity is not
 * required — the link resolves either way.
 */
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, '-');
}
