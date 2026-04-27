/**
 * Tests for URL generation: pure builder + the generate_url tool.
 *
 * The pure builder gets exhaustive case coverage; the tool gets one happy
 * path per identifier mode (slug-only, id+autofetch, host-override).
 */

import { describe, it, expect, vi } from 'vitest';

import { buildHost, pathFor, urlFor, UrlBuildError } from '../api/urls.js';
import { handleTool } from '../tools/index.js';

describe('api/urls — pure builder', () => {
  describe('buildHost', () => {
    it('uses custom domain without org slug prefix', () => {
      expect(buildHost({ customDomain: 'dam.mer.fm' })).toBe('https://dam.mer.fm');
    });
    it('strips an accidental protocol on the custom domain', () => {
      expect(buildHost({ customDomain: 'https://dam.mer.fm/' })).toBe('https://dam.mer.fm');
    });
    it('falls back to base host + org slug', () => {
      expect(buildHost({ orgSlug: 'mer' })).toBe('https://mediagraph.io/mer');
    });
    it('honors a baseHost override', () => {
      expect(buildHost({ orgSlug: 'mer', baseHost: 'https://staging.example.com' })).toBe('https://staging.example.com/mer');
    });
    it('throws when neither customDomain nor orgSlug is set', () => {
      expect(() => buildHost({})).toThrow(UrlBuildError);
    });
  });

  describe('pathFor — entity coverage', () => {
    it('asset → hash route by guid', () => {
      expect(pathFor('asset', { guid: 'de546c11-b693-49f8-9237-157b7a403a70' }))
        .toBe('/explore#/assets/de546c11-b693-49f8-9237-157b7a403a70');
    });
    it('asset rejects missing guid', () => {
      expect(() => pathFor('asset', {})).toThrow(/asset URLs require a guid/);
    });
    it('collection by slug', () => {
      expect(pathFor('collection', { slug: 'doggies' })).toBe('/explore/collections/doggies');
    });
    it('storage_folder by slug', () => {
      expect(pathFor('storage_folder', { slug: 'archive' })).toBe('/explore/folders/archive');
    });
    it('lightbox accepts pre-composed slug', () => {
      expect(pathFor('lightbox', { slug: '143340-lr-new-files' }))
        .toBe('/explore/projects/143340-lr-new-files');
    });
    it('lightbox composes id + name when slug is missing', () => {
      expect(pathFor('lightbox', { id: 143340, name: 'lr new files' }))
        .toBe('/explore/projects/143340-lr-new-files');
    });
    it('tag by id + name preserves case (matches frontend)', () => {
      expect(pathFor('tag', { id: 609, name: 'Grandparent' }))
        .toBe('/explore/tags/609-Grandparent');
    });
    it('tag by id alone is allowed (Rails route is permissive)', () => {
      expect(pathFor('tag', { id: 42 })).toBe('/explore/tags/42');
    });
    it('share_link by share_code', () => {
      expect(pathFor('share_link', { share_code: 'abc123' })).toBe('/share-links/abc123');
    });
    it('explore root', () => {
      expect(pathFor('explore', {})).toBe('/explore');
    });
  });

  it('urlFor combines host + path', () => {
    const url = urlFor('collection', { slug: 'doggies' }, { customDomain: 'dam.mer.fm' });
    expect(url).toBe('https://dam.mer.fm/explore/collections/doggies');
  });

  it('matches the user-provided examples exactly', () => {
    const ctx = { customDomain: 'dam.mer.fm' };
    expect(urlFor('asset', { guid: 'de546c11-b693-49f8-9237-157b7a403a70' }, ctx))
      .toBe('https://dam.mer.fm/explore#/assets/de546c11-b693-49f8-9237-157b7a403a70');
    expect(urlFor('collection', { slug: 'doggies' }, ctx))
      .toBe('https://dam.mer.fm/explore/collections/doggies');
    expect(urlFor('lightbox', { slug: '143340-lr-new-files' }, ctx))
      .toBe('https://dam.mer.fm/explore/projects/143340-lr-new-files');
    expect(urlFor('tag', { id: 609, name: 'Grandparent' }, ctx))
      .toBe('https://dam.mer.fm/explore/tags/609-Grandparent');
  });
});

describe('generate_url tool', () => {
  function clientWithWhoami(domain?: string, slug = 'mer') {
    return {
      whoami: vi.fn().mockResolvedValue({
        organization: { id: 1, slug, domain },
        user: { id: 1, email: 'x' },
      }),
      getAsset: vi.fn().mockResolvedValue({ id: 1, guid: 'fetched-guid', filename: 'x' }),
      getCollection: vi.fn().mockResolvedValue({ id: 1, slug: 'fetched-collection' }),
      getLightbox: vi.fn().mockResolvedValue({ id: 1, slug: '1-some-name', name: 'some name' }),
      getStorageFolder: vi.fn().mockResolvedValue({ id: 1, slug: 'fetched-folder' }),
      getTag: vi.fn().mockResolvedValue({ id: 609, name: 'Grandparent' }),
    };
  }

  it('uses custom domain from whoami when present', async () => {
    const result = await handleTool('generate_url', {
      type: 'asset', guid: 'de546c11-b693-49f8-9237-157b7a403a70',
    }, { client: clientWithWhoami('dam.mer.fm') as never });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.url).toBe('https://dam.mer.fm/explore#/assets/de546c11-b693-49f8-9237-157b7a403a70');
  });

  it('falls back to mediagraph.io/{slug} when org has no domain', async () => {
    const result = await handleTool('generate_url', {
      type: 'collection', slug: 'doggies',
    }, { client: clientWithWhoami(undefined, 'mer') as never });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.url).toBe('https://mediagraph.io/mer/explore/collections/doggies');
  });

  it('--host overrides everything (including avoiding the whoami call)', async () => {
    const client = clientWithWhoami('dam.mer.fm');
    const result = await handleTool('generate_url', {
      type: 'collection', slug: 'doggies', host: 'staging.example.com',
    }, { client: client as never });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.url).toBe('https://staging.example.com/explore/collections/doggies');
    expect(client.whoami).not.toHaveBeenCalled();
  });

  it('autofetches an asset by id to derive guid', async () => {
    const client = clientWithWhoami('dam.mer.fm');
    const result = await handleTool('generate_url', { type: 'asset', id: 42 }, { client: client as never });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(client.getAsset).toHaveBeenCalledWith(42);
    expect(data.url).toContain('#/assets/fetched-guid');
  });

  it('autofetches a collection by id to derive slug', async () => {
    const client = clientWithWhoami('dam.mer.fm');
    const result = await handleTool('generate_url', { type: 'collection', id: 7 }, { client: client as never });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(client.getCollection).toHaveBeenCalledWith(7);
    expect(data.url).toBe('https://dam.mer.fm/explore/collections/fetched-collection');
  });

  it('autofetches a lightbox by id to get composite slug', async () => {
    const client = clientWithWhoami('dam.mer.fm');
    const result = await handleTool('generate_url', { type: 'lightbox', id: 1 }, { client: client as never });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.url).toBe('https://dam.mer.fm/explore/projects/1-some-name');
  });

  it('skips autofetch when autofetch=false and surfaces the build error', async () => {
    const client = clientWithWhoami('dam.mer.fm');
    const result = await handleTool('generate_url', {
      type: 'collection', id: 7, autofetch: false,
    }, { client: client as never });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/collection URLs require a slug/);
    expect(client.getCollection).not.toHaveBeenCalled();
  });

  it('returns a structured error envelope for missing identifier', async () => {
    const result = await handleTool('generate_url', { type: 'asset' }, { client: clientWithWhoami('dam.mer.fm') as never });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/asset URLs require a guid/);
  });
});
