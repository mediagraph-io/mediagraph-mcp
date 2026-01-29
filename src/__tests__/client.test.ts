/**
 * Tests for MediagraphClient
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MediagraphClient, MediagraphClientConfig } from '../api/client.js';

// Helper to create mock Response
function createMockResponse(data: unknown, options: { status?: number; ok?: boolean } = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: options.status === 401 ? 'Unauthorized' : 'OK',
    headers: {
      get: (name: string) => {
        if (name === 'Content-Type' || name === 'content-type') {
          return 'application/json';
        }
        return null;
      },
    },
    json: () => Promise.resolve(data),
  };
}

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('MediagraphClient', () => {
  let client: MediagraphClient;
  const mockGetAccessToken = vi.fn().mockResolvedValue('test-token');

  beforeEach(() => {
    mockFetch.mockReset();
    mockGetAccessToken.mockReset();
    mockGetAccessToken.mockResolvedValue('test-token');
    client = new MediagraphClient({
      getAccessToken: mockGetAccessToken,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create client with default API URL', () => {
      const defaultClient = new MediagraphClient({
        getAccessToken: mockGetAccessToken,
      });
      expect(defaultClient).toBeDefined();
    });

    it('should create client with custom API URL', () => {
      const customClient = new MediagraphClient({
        getAccessToken: mockGetAccessToken,
        apiUrl: 'https://custom.api.example.com',
      });
      expect(customClient).toBeDefined();
    });
  });

  describe('API requests', () => {
    it('should include authorization header', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        user: { id: 1, email: 'test@example.com', first_name: 'Test', last_name: 'User' },
        organization: { id: 1, name: 'Test Org', slug: 'test-org' },
        membership: { id: 1, user_id: 1, organization_id: 1, role: 'admin' },
      }));

      await client.whoami();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
          }),
        }),
      );
    });

    it('should call getAccessToken for each request', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        user: { id: 1, email: 'test@example.com', first_name: 'Test', last_name: 'User' },
        organization: { id: 1, name: 'Test Org', slug: 'test-org' },
        membership: { id: 1, user_id: 1, organization_id: 1, role: 'admin' },
      }));

      await client.whoami();

      expect(mockGetAccessToken).toHaveBeenCalled();
    });

    it('should include content type for JSON requests', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ id: 1, name: 'New Collection', type: 'Collection', path_names: [], path_slugs: [], has_children: false, ancestor_ids: [], created_at: '2024-01-01' }));

      await client.createCollection({ name: 'Test' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
    });
  });

  describe('error handling', () => {
    it('should throw when not authenticated', async () => {
      mockGetAccessToken.mockResolvedValueOnce(null);

      await expect(client.whoami()).rejects.toThrow('Not authenticated');
    });

    it('should throw on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ error: 'Invalid token' }, { status: 401, ok: false }));

      await expect(client.whoami()).rejects.toThrow();
    });

    it('should throw on network error after retries', async () => {
      // Client has retry logic, so we need to mock all retries
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(client.whoami()).rejects.toThrow('Network error');
    });
  });

  describe('whoami', () => {
    it('should call correct endpoint', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        user: { id: 1, email: 'test@example.com', first_name: 'Test', last_name: 'User' },
        organization: { id: 1, name: 'Test Org', slug: 'test-org' },
        membership: { id: 1, user_id: 1, organization_id: 1, role: 'admin' },
      }));

      await client.whoami();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/whoami'),
        expect.any(Object),
      );
    });
  });

  describe('searchAssets', () => {
    it('should include search parameters', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ assets: [], total: 0, page: 1, per_page: 25, total_pages: 0 }));

      await client.searchAssets({ q: 'test', tags: ['nature'] });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/assets\/search\?.*q=test/),
        expect.any(Object),
      );
    });
  });

  describe('getAsset', () => {
    it('should call correct endpoint with ID', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ id: 123, guid: 'abc123', filename: 'test.jpg', created_at: '2024-01-01', updated_at: '2024-01-01' }));

      await client.getAsset(123);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/assets/123'),
        expect.any(Object),
      );
    });

    it('should call correct endpoint with GUID', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ id: 123, guid: 'abc123', filename: 'test.jpg', created_at: '2024-01-01', updated_at: '2024-01-01' }));

      await client.getAsset('abc123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/assets/abc123'),
        expect.any(Object),
      );
    });
  });

  describe('updateAsset', () => {
    it('should send PUT request with data', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ id: 123, guid: 'abc123', filename: 'test.jpg', title: 'Updated', created_at: '2024-01-01', updated_at: '2024-01-01' }));

      await client.updateAsset(123, { title: 'Updated', alt_text: 'New alt text' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/assets/123'),
        expect.objectContaining({
          method: 'PUT',
          body: expect.any(String),
        }),
      );
    });
  });

  describe('collections', () => {
    it('should list collections', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ items: [], total: 0, page: 1, per_page: 25 }));

      await client.listCollections();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/collections'),
        expect.any(Object),
      );
    });

    it('should create collection', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ id: 1, name: 'New Collection', type: 'Collection', path_names: [], path_slugs: [], has_children: false, ancestor_ids: [], created_at: '2024-01-01' }));

      await client.createCollection({ name: 'New Collection' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/collections'),
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });
  });
});
