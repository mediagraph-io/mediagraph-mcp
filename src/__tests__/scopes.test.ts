/**
 * Tests for entity-level scope vocabulary, pre-flight helpers, and the
 * client's insufficient_scope envelope parsing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  allEntityScopes,
  controllerForPath,
  entityForPath,
  groupForEntity,
  groupForPath,
  isFullAccessScopeList,
  levelForMethod,
  parseScopeArg,
  requiredScopeFor,
  scopeTier,
  scopesCover,
} from '../api/scopes.js';
import { MediagraphApiError, MediagraphClient } from '../api/client.js';

describe('api/scopes — pre-flight helpers (entity-level)', () => {
  describe('controllerForPath', () => {
    it('extracts the first /api/<segment> as controller', () => {
      expect(controllerForPath('/api/assets/123')).toBe('assets');
      expect(controllerForPath('/api/lightboxes/9/items')).toBe('lightboxes');
    });
    it('returns null for non-/api paths', () => {
      expect(controllerForPath('/explore/assets/abc')).toBeNull();
      expect(controllerForPath('/')).toBeNull();
    });
    it('strips query and hash before parsing', () => {
      expect(controllerForPath('/api/assets/search?q=cats#frag')).toBe('assets');
    });
  });

  describe('entityForPath / groupForPath', () => {
    it('maps controllers to their entity (singular)', () => {
      expect(entityForPath('/api/assets/123')).toBe('asset');
      expect(entityForPath('/api/comments')).toBe('comment');
      expect(entityForPath('/api/projects/9')).toBe('project');
      expect(entityForPath('/api/auto_tags/1')).toBe('auto_tag');
      expect(entityForPath('/api/memberships/4')).toBe('membership');
      expect(entityForPath('/api/bulk_jobs')).toBe('bulk_job');
      expect(entityForPath('/api/crop_presets')).toBe('crop_preset');
      expect(entityForPath('/api/asset_group_memberships')).toBe('asset_group_membership');
    });
    it('groupForPath resolves controller → entity → group', () => {
      expect(groupForPath('/api/comments')).toBe('assets');
      expect(groupForPath('/api/auto_tags/1')).toBe('tags');
      expect(groupForPath('/api/projects/9')).toBe('collections');
      expect(groupForPath('/api/memberships/4')).toBe('users');
      expect(groupForPath('/api/crop_presets')).toBe('organization_settings');
    });
    it('bulk_jobs is now its own basic group, not under reports', () => {
      expect(groupForPath('/api/bulk_jobs')).toBe('bulk_jobs');
      expect(scopeTier('bulk_jobs')).toBe('basic');
    });
    it('returns null for endpoints the server does not scope-enforce', () => {
      // /api/whoami, /api/integrations/*, /api/personal_access_tokens are unenforced.
      expect(entityForPath('/api/whoami')).toBeNull();
      expect(entityForPath('/api/integrations/lightroom/ping')).toBeNull();
      expect(entityForPath('/api/personal_access_tokens')).toBeNull();
      expect(groupForPath('/api/whoami')).toBeNull();
    });
  });

  describe('groupForEntity', () => {
    it('looks up the owning group for an entity', () => {
      expect(groupForEntity('asset')).toBe('assets');
      expect(groupForEntity('comment')).toBe('assets');
      expect(groupForEntity('webhook')).toBe('webhooks');
      expect(groupForEntity('membership')).toBe('users');
      expect(groupForEntity('rights_package')).toBe('rights_packages');
      expect(groupForEntity('something_unknown')).toBeNull();
    });
  });

  describe('levelForMethod', () => {
    it('GET/HEAD → read; everything else → write', () => {
      expect(levelForMethod('GET')).toBe('read');
      expect(levelForMethod('HEAD')).toBe('read');
      expect(levelForMethod('POST')).toBe('write');
      expect(levelForMethod('PUT')).toBe('write');
      expect(levelForMethod('PATCH')).toBe('write');
      expect(levelForMethod('DELETE')).toBe('write');
    });
  });

  describe('requiredScopeFor — returns entity-level', () => {
    it('combines entity + level (singular)', () => {
      expect(requiredScopeFor('GET', '/api/assets/123')).toBe('asset:read');
      expect(requiredScopeFor('POST', '/api/assets')).toBe('asset:write');
      expect(requiredScopeFor('GET', '/api/comments')).toBe('comment:read');
      expect(requiredScopeFor('DELETE', '/api/webhooks/4')).toBe('webhook:write');
      expect(requiredScopeFor('POST', '/api/bulk_jobs')).toBe('bulk_job:write');
    });
    it('returns null for non-enforced endpoints', () => {
      expect(requiredScopeFor('GET', '/api/whoami')).toBeNull();
      expect(requiredScopeFor('GET', '/api/personal_access_tokens')).toBeNull();
    });
  });

  describe('scopeTier — accepts entity OR group', () => {
    it('classifies entities by their group tier', () => {
      expect(scopeTier('asset')).toBe('basic');
      expect(scopeTier('comment')).toBe('basic');
      expect(scopeTier('upload')).toBe('basic');
      expect(scopeTier('bulk_job')).toBe('basic');
      expect(scopeTier('webhook')).toBe('advanced');
      expect(scopeTier('membership')).toBe('advanced');
      expect(scopeTier('crop_preset')).toBe('advanced');
    });
    it('also accepts group keys directly', () => {
      expect(scopeTier('assets')).toBe('basic');
      expect(scopeTier('webhooks')).toBe('advanced');
      expect(scopeTier('organization_settings')).toBe('advanced');
    });
    it('throws on unknown keys (no silent classification)', () => {
      expect(() => scopeTier('not_a_thing')).toThrow();
    });
  });

  describe('isFullAccessScopeList — legacy compatibility', () => {
    it('treats empty / undefined / null scope lists as full access', () => {
      expect(isFullAccessScopeList(null)).toBe(true);
      expect(isFullAccessScopeList(undefined)).toBe(true);
      expect(isFullAccessScopeList([])).toBe(true);
    });
    it('treats legacy bare strings (read/write/public) as full access', () => {
      expect(isFullAccessScopeList(['read'])).toBe(true);
      expect(isFullAccessScopeList(['read', 'write'])).toBe(true);
      expect(isFullAccessScopeList(['public'])).toBe(true);
    });
    it('treats granular scope lists as NOT full-access', () => {
      expect(isFullAccessScopeList(['asset:read'])).toBe(false);
      expect(isFullAccessScopeList(['read', 'asset:write'])).toBe(false);
    });
  });

  describe('allEntityScopes', () => {
    it('emits every known entity at the given level', () => {
      const reads = allEntityScopes('read');
      expect(reads).toContain('asset:read');
      expect(reads).toContain('comment:read');
      expect(reads).toContain('webhook:read');
      expect(reads).toContain('bulk_job:read');
      expect(reads).toContain('crop_preset:read');
      // No group keys leak through.
      expect(reads).not.toContain('assets:read');
      expect(reads).not.toContain('reports:read');
      // Levels are correct.
      expect(reads.every(s => s.endsWith(':read'))).toBe(true);
    });
    it('write level produces analogous list', () => {
      const writes = allEntityScopes('write');
      expect(writes).toContain('asset:write');
      expect(writes.every(s => s.endsWith(':write'))).toBe(true);
      expect(writes.length).toBe(allEntityScopes('read').length);
    });
  });

  describe('parseScopeArg — user-facing scope spec', () => {
    it('CSV input, bare keys default to :write', () => {
      expect(parseScopeArg('asset,tag,collections')).toEqual(['asset:write', 'tag:write', 'collections:write']);
    });
    it('whitespace-separated input', () => {
      expect(parseScopeArg('asset:read tag:read')).toEqual(['asset:read', 'tag:read']);
    });
    it('mixes entity and group keys, preserves explicit levels', () => {
      expect(parseScopeArg('asset:read, assets:write, webhook')).toEqual([
        'asset:read', 'assets:write', 'webhook:write',
      ]);
    });
    it('rejects unknown keys', () => {
      expect(() => parseScopeArg('not_a_thing')).toThrow(/Unknown scope key/);
    });
    it('rejects invalid level', () => {
      expect(() => parseScopeArg('asset:admin')).toThrow(/Invalid scope level/);
    });
    it('ignores empty tokens / extra commas', () => {
      expect(parseScopeArg(' asset:read,, ,tag:read ')).toEqual(['asset:read', 'tag:read']);
    });
  });

  describe('scopesCover — entity + group back-compat semantics', () => {
    it('full-access lists cover everything (acceptance: empty list)', () => {
      expect(scopesCover([], 'webhook:write')).toBe(true);
      expect(scopesCover(null, 'asset:read')).toBe(true);
    });
    it('legacy bare read/write covers any endpoint at the matching level (acceptance)', () => {
      expect(scopesCover(['read', 'write'], 'comment:write')).toBe(true);
      expect(scopesCover(['read'], 'webhook:read')).toBe(true);
    });
    it('exact entity scope covers that entity', () => {
      expect(scopesCover(['asset:read'], 'asset:read')).toBe(true);
      expect(scopesCover(['asset:write'], 'asset:write')).toBe(true);
    });
    it('write implies read for the SAME entity', () => {
      expect(scopesCover(['asset:write'], 'asset:read')).toBe(true);
    });
    it('sibling entities are independent (acceptance: asset:write does NOT cover comment:read)', () => {
      // Both belong to the `assets` group, but only the group form bridges siblings.
      expect(scopesCover(['asset:write'], 'comment:read')).toBe(false);
      expect(scopesCover(['comment:write'], 'asset:read')).toBe(false);
    });
    it('group scope covers every entity in that group (acceptance: assets:write covers comment:read)', () => {
      expect(scopesCover(['assets:write'], 'comment:read')).toBe(true);
      expect(scopesCover(['assets:write'], 'asset:read')).toBe(true);
      expect(scopesCover(['assets:read'], 'comment:read')).toBe(true);
      expect(scopesCover(['tags:write'], 'auto_tag:read')).toBe(true);
    });
    it('group at read does NOT promote to write', () => {
      expect(scopesCover(['assets:read'], 'comment:write')).toBe(false);
    });
    it('does not cross groups via entity scopes', () => {
      expect(scopesCover(['asset:write'], 'tag:read')).toBe(false);
    });
    it('does not cross groups via group scopes', () => {
      expect(scopesCover(['assets:write'], 'tag:read')).toBe(false);
    });
  });
});

describe('client 403 body parsing — entity-level required', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function jsonResponse(status: number, body: unknown) {
    return {
      ok: status < 400,
      status,
      statusText: status === 403 ? 'Forbidden' : 'OK',
      headers: { get: (n: string) => (/^content-type$/i.test(n) ? 'application/json' : null) },
      json: () => Promise.resolve(body),
    };
  }

  async function expectRejection(fn: () => Promise<unknown>): Promise<MediagraphApiError> {
    try {
      await fn();
    } catch (e) {
      expect(e).toBeInstanceOf(MediagraphApiError);
      return e as MediagraphApiError;
    }
    throw new Error('expected promise to reject');
  }

  it('parses entity-level required onto MediagraphApiError (acceptance)', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(403, {
      error: 'insufficient_scope',
      reason: 'scope',
      required: 'membership:read',
    }));
    const client = new MediagraphClient({ getAccessToken: async () => 'tok' });

    const err = await expectRejection(() => client.listMemberships());
    expect(err.statusCode).toBe(403);
    expect(err.insufficientScope).toBe(true);
    expect(err.requiredScope).toBe('membership:read');
    expect(err.scopeReason).toBe('scope');
    expect(err.method).toBe('GET');
    expect(err.path).toBe('/api/memberships');
  });

  it('parses admin_required reason distinctly from scope reason', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(403, {
      error: 'insufficient_scope',
      reason: 'admin_required',
      required: 'webhook:write',
    }));
    const client = new MediagraphClient({ getAccessToken: async () => 'tok' });

    const err = await expectRejection(() => client.listMemberships());
    expect(err.scopeReason).toBe('admin_required');
    expect(err.requiredScope).toBe('webhook:write');
  });

  it('does NOT flag generic 403 (CanCan denial) as insufficient_scope', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(403, {
      error: 'forbidden',
      message: 'Access denied: cannot read Asset',
    }));
    const client = new MediagraphClient({ getAccessToken: async () => 'tok' });

    const err = await expectRejection(() => client.listMemberships());
    expect(err.statusCode).toBe(403);
    expect(err.insufficientScope).toBe(false);
    expect(err.requiredScope).toBeUndefined();
    expect(err.errorBody.error).toBe('forbidden');
  });
});
