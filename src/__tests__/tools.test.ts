/**
 * Tests for MCP Tools
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toolDefinitions, handleTool, successResult, errorResult } from '../tools/index.js';
import type { MediagraphClient } from '../api/client.js';

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from('fake image data')),
  stat: vi.fn().mockResolvedValue({
    isFile: () => true,
    size: 1000,
  }),
}));

// Mock client factory
function createMockClient(overrides: Partial<MediagraphClient> = {}): MediagraphClient {
  return {
    whoami: vi.fn().mockResolvedValue({
      user: { id: 1, email: 'test@example.com', first_name: 'Test', last_name: 'User' },
      organization: { id: 1, name: 'Test Org', slug: 'test-org' },
      membership: { id: 1, user_id: 1, organization_id: 1, role: 'admin' },
    }),
    getOrganization: vi.fn().mockResolvedValue({ id: 1, name: 'Test Org', slug: 'test-org' }),
    listMemberships: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 25 }),
    getMembership: vi.fn().mockResolvedValue({ id: 1, user_id: 1, organization_id: 1, role: 'admin' }),
    updateMembership: vi.fn().mockResolvedValue({ id: 1, user_id: 1, organization_id: 1, role: 'general' }),
    searchAssets: vi.fn().mockResolvedValue({ assets: [], total: 0, page: 1, per_page: 25, total_pages: 0 }),
    getAsset: vi.fn().mockResolvedValue({ id: 1, guid: 'abc123', filename: 'test.jpg', created_at: '2024-01-01' }),
    updateAsset: vi.fn().mockResolvedValue({ id: 1, guid: 'abc123', filename: 'test.jpg', created_at: '2024-01-01' }),
    deleteAsset: vi.fn().mockResolvedValue(undefined),
    addTagsToAsset: vi.fn().mockResolvedValue({ success: true }),
    getAssetDownload: vi.fn().mockResolvedValue({ url: 'https://example.com/download', filename: 'test.jpg' }),
    getAssetAutoTags: vi.fn().mockResolvedValue([]),
    getAssetFaceTaggings: vi.fn().mockResolvedValue([]),
    getAssetDataVersions: vi.fn().mockResolvedValue([]),
    revertAsset: vi.fn().mockResolvedValue({ id: 1, guid: 'abc123', filename: 'test.jpg', created_at: '2024-01-01' }),
    getAssetCounts: vi.fn().mockResolvedValue({ total: 100 }),
    getTrashedAssets: vi.fn().mockResolvedValue({ assets: [], total: 0, page: 1, per_page: 25, total_pages: 0 }),
    getPopularAssets: vi.fn().mockResolvedValue({ assets: [], total: 0, page: 1, per_page: 25, total_pages: 0 }),
    listCollections: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 25 }),
    getCollection: vi.fn().mockResolvedValue({ id: 1, name: 'Test Collection', type: 'Collection', path_names: [], path_slugs: [], has_children: false, ancestor_ids: [], created_at: '2024-01-01' }),
    createCollection: vi.fn().mockResolvedValue({ id: 1, name: 'New Collection', type: 'Collection', path_names: [], path_slugs: [], has_children: false, ancestor_ids: [], created_at: '2024-01-01' }),
    updateCollection: vi.fn().mockResolvedValue({ id: 1, name: 'Updated Collection', type: 'Collection', path_names: [], path_slugs: [], has_children: false, ancestor_ids: [], created_at: '2024-01-01' }),
    deleteCollection: vi.fn().mockResolvedValue(undefined),
    addAssetToCollection: vi.fn().mockResolvedValue(undefined),
    getCollectionsTree: vi.fn().mockResolvedValue([]),
    listLightboxes: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 25 }),
    getLightbox: vi.fn().mockResolvedValue({ id: 1, name: 'Test Lightbox', type: 'Lightbox', path_names: [], path_slugs: [], has_children: false, ancestor_ids: [], created_at: '2024-01-01' }),
    createLightbox: vi.fn().mockResolvedValue({ id: 1, name: 'New Lightbox', type: 'Lightbox', path_names: [], path_slugs: [], has_children: false, ancestor_ids: [], created_at: '2024-01-01' }),
    updateLightbox: vi.fn().mockResolvedValue({ id: 1, name: 'Updated Lightbox', type: 'Lightbox', path_names: [], path_slugs: [], has_children: false, ancestor_ids: [], created_at: '2024-01-01' }),
    deleteLightbox: vi.fn().mockResolvedValue(undefined),
    addAssetToLightbox: vi.fn().mockResolvedValue(undefined),
    getLightboxesTree: vi.fn().mockResolvedValue([]),
    listStorageFolders: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 25 }),
    getStorageFolder: vi.fn().mockResolvedValue({ id: 1, name: 'Test Folder', type: 'StorageFolder', path_names: [], path_slugs: [], has_children: false, ancestor_ids: [], created_at: '2024-01-01' }),
    createStorageFolder: vi.fn().mockResolvedValue({ id: 1, name: 'New Folder', type: 'StorageFolder', path_names: [], path_slugs: [], has_children: false, ancestor_ids: [], created_at: '2024-01-01' }),
    getStorageFoldersTree: vi.fn().mockResolvedValue([]),
    listTags: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 25 }),
    getTag: vi.fn().mockResolvedValue({ id: 1, name: 'Test Tag', slug: 'test-tag' }),
    createTag: vi.fn().mockResolvedValue({ id: 1, name: 'New Tag', slug: 'new-tag' }),
    updateTag: vi.fn().mockResolvedValue({ id: 1, name: 'Updated Tag', slug: 'updated-tag' }),
    deleteTag: vi.fn().mockResolvedValue(undefined),
    mergeTagInto: vi.fn().mockResolvedValue(undefined),
    listAutoTags: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 25 }),
    listTaxonomies: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 25 }),
    getTaxonomy: vi.fn().mockResolvedValue({ id: 1, name: 'Test Taxonomy' }),
    createTaxonomy: vi.fn().mockResolvedValue({ id: 1, name: 'New Taxonomy' }),
    listTaxonomyTags: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 25 }),
    createTaxonomyTag: vi.fn().mockResolvedValue({ id: 1, name: 'New Taxonomy Tag', taxonomy_id: 1 }),
    listCreatorTags: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 25 }),
    createCreatorTag: vi.fn().mockResolvedValue({ id: 1, name: 'New Creator' }),
    listRightsPackages: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 25 }),
    getRightsPackage: vi.fn().mockResolvedValue({ id: 1, name: 'Test Rights', rights_class: 'owned' }),
    createRightsPackage: vi.fn().mockResolvedValue({ id: 1, name: 'New Rights', rights_class: 'owned' }),
    listShareLinks: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 25 }),
    getShareLink: vi.fn().mockResolvedValue({ id: 1, guid: 'share123', created_at: '2024-01-01' }),
    createShareLink: vi.fn().mockResolvedValue({ id: 1, guid: 'newshare123', created_at: '2024-01-01' }),
    deleteShareLink: vi.fn().mockResolvedValue(undefined),
    listAccessRequests: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 25 }),
    getAccessRequest: vi.fn().mockResolvedValue({ id: 1, name: 'Test Request', aasm_state: 'pending', created_at: '2024-01-01' }),
    submitAccessRequest: vi.fn().mockResolvedValue({ id: 1, name: 'Test Request', aasm_state: 'submitted', created_at: '2024-01-01' }),
    listBulkJobs: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 25 }),
    getBulkJob: vi.fn().mockResolvedValue({ id: 1, guid: 'bulk123', job_type: 'add_tags', status: 'completed', total_count: 10, processed_count: 10, success_count: 10, error_count: 0, created_at: '2024-01-01' }),
    createBulkJob: vi.fn().mockResolvedValue({ id: 1, guid: 'bulk123', job_type: 'add_tags', status: 'pending', total_count: 10, processed_count: 0, success_count: 0, error_count: 0, created_at: '2024-01-01' }),
    cancelBulkJob: vi.fn().mockResolvedValue({ id: 1, guid: 'bulk123', job_type: 'add_tags', status: 'cancelled', total_count: 10, processed_count: 5, success_count: 5, error_count: 0, created_at: '2024-01-01' }),
    getBulkJobQueuePosition: vi.fn().mockResolvedValue({ position: 1 }),
    listCustomMetaFields: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 25 }),
    getCustomMetaField: vi.fn().mockResolvedValue({ id: 1, name: 'Test Field', field_type: 'text' }),
    createCustomMetaField: vi.fn().mockResolvedValue({ id: 1, name: 'New Field', field_type: 'text' }),
    listWorkflows: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 25 }),
    getWorkflow: vi.fn().mockResolvedValue({ id: 1, name: 'Test Workflow' }),
    approveWorkflowStep: vi.fn().mockResolvedValue({ id: 1, name: 'Step 1', approved: true }),
    listComments: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 25 }),
    createComment: vi.fn().mockResolvedValue({ id: 1, body: 'Test comment', commentable_type: 'Asset', commentable_id: 1, user_id: 1, created_at: '2024-01-01' }),
    deleteComment: vi.fn().mockResolvedValue(undefined),
    listNotifications: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 25 }),
    getNotificationCount: vi.fn().mockResolvedValue({ unread: 5, total: 10 }),
    createDownload: vi.fn().mockResolvedValue({ id: 1, token: 'dl123', created_at: '2024-01-01' }),
    getDownload: vi.fn().mockResolvedValue({ id: 1, token: 'dl123', url: 'https://example.com/download.zip', created_at: '2024-01-01' }),
    listWebhooks: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 25 }),
    getWebhook: vi.fn().mockResolvedValue({ id: 1, name: 'Test Webhook', url: 'https://example.com/hook', events: ['asset.created'] }),
    createWebhook: vi.fn().mockResolvedValue({ id: 1, name: 'New Webhook', url: 'https://example.com/hook', events: ['asset.created'] }),
    deleteWebhook: vi.fn().mockResolvedValue(undefined),
    getWebhookLogs: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 25 }),
    listUserGroups: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 25 }),
    createUserGroup: vi.fn().mockResolvedValue({ id: 1, name: 'New Group' }),
    listInvites: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 25 }),
    createInvite: vi.fn().mockResolvedValue({ id: 1, email: 'invite@example.com', role: 'general', created_at: '2024-01-01' }),
    resendInvite: vi.fn().mockResolvedValue({ id: 1, email: 'invite@example.com', role: 'general', created_at: '2024-01-01' }),
    listFilterGroups: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 25 }),
    createFilterGroup: vi.fn().mockResolvedValue({ id: 1, name: 'New Filter Group', filters: {} }),
    listSearchQueries: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 25 }),
    createSearchQuery: vi.fn().mockResolvedValue({ id: 1, name: 'New Query', query: 'test' }),
    listCropPresets: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 25 }),
    createCropPreset: vi.fn().mockResolvedValue({ id: 1, name: 'New Preset', width: 1920, height: 1080 }),
    canUpload: vi.fn().mockResolvedValue({ can_upload: true }),
    listUploads: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 25 }),
    createUpload: vi.fn().mockResolvedValue({ id: 1, guid: 'upload123', created_at: '2024-01-01' }),
    prepareAssetUpload: vi.fn().mockResolvedValue({ id: 1, guid: 'asset123', filename: 'test.jpg', signed_upload_url: 'https://s3.example.com/presigned' }),
    uploadToSignedUrl: vi.fn().mockResolvedValue(undefined),
    setAssetUploaded: vi.fn().mockResolvedValue({ id: 1, guid: 'asset123', filename: 'test.jpg', file_size: 1000, content_type: 'image/jpeg' }),
    setUploadDone: vi.fn().mockResolvedValue({ id: 1, guid: 'upload123', done_at: '2024-01-01' }),
    listContributions: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 25 }),
    getContribution: vi.fn().mockResolvedValue({ id: 1, created_at: '2024-01-01' }),
    listMetaImports: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 25 }),
    getMetaImport: vi.fn().mockResolvedValue({ id: 1, status: 'completed', created_at: '2024-01-01' }),
    listIngestions: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 25 }),
    listPersonalAccessTokens: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 25 }),
    createPersonalAccessToken: vi.fn().mockResolvedValue({ id: 1, name: 'New Token', token: 'pat_abc123', created_at: '2024-01-01' }),
    deletePersonalAccessToken: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as MediagraphClient;
}

describe('Tool Definitions', () => {
  it('should have valid tool definitions', () => {
    expect(toolDefinitions).toBeDefined();
    expect(Array.isArray(toolDefinitions)).toBe(true);
    expect(toolDefinitions.length).toBeGreaterThan(0);
  });

  it('should have unique tool names', () => {
    const names = toolDefinitions.map(t => t.name);
    const uniqueNames = new Set(names);
    expect(names.length).toBe(uniqueNames.size);
  });

  it('each tool should have required fields', () => {
    for (const tool of toolDefinitions) {
      expect(tool.name).toBeDefined();
      expect(typeof tool.name).toBe('string');
      expect(tool.description).toBeDefined();
      expect(typeof tool.description).toBe('string');
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toBeDefined();
      expect(Array.isArray(tool.inputSchema.required)).toBe(true);
    }
  });

  it('should include key tools', () => {
    const toolNames = toolDefinitions.map(t => t.name);

    // User tools
    expect(toolNames).toContain('whoami');
    expect(toolNames).toContain('get_organization');

    // Asset tools
    expect(toolNames).toContain('search_assets');
    expect(toolNames).toContain('get_asset');
    expect(toolNames).toContain('update_asset');
    expect(toolNames).toContain('add_tags_to_asset');

    // Collection tools
    expect(toolNames).toContain('list_collections');
    expect(toolNames).toContain('create_collection');

    // Tag tools
    expect(toolNames).toContain('list_tags');
    expect(toolNames).toContain('create_tag');

    // Upload tools
    expect(toolNames).toContain('upload_file');
    expect(toolNames).toContain('upload_files');
  });
});

describe('Tool Handlers', () => {
  let mockClient: MediagraphClient;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  describe('whoami', () => {
    it('should return user information', async () => {
      const result = await handleTool('whoami', {}, { client: mockClient });

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const data = JSON.parse(result.content[0].text);
      expect(data.user).toBeDefined();
      expect(data.organization).toBeDefined();
      expect(data.membership).toBeDefined();
    });
  });

  describe('search_assets', () => {
    it('should search assets', async () => {
      const result = await handleTool('search_assets', { q: 'test' }, { client: mockClient });

      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.assets).toBeDefined();
      expect(data.total).toBeDefined();
    });

    it('should pass search parameters', async () => {
      await handleTool('search_assets', {
        q: 'nature',
        tags: ['landscape'],
        rating: [4, 5],
        page: 2,
        per_page: 50,
      }, { client: mockClient });

      expect(mockClient.searchAssets).toHaveBeenCalledWith({
        q: 'nature',
        tags: ['landscape'],
        rating: [4, 5],
        page: 2,
        per_page: 50,
      });
    });
  });

  describe('get_asset', () => {
    it('should get asset by id', async () => {
      const result = await handleTool('get_asset', { id: 123 }, { client: mockClient });

      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.id).toBe(1);
      expect(data.guid).toBe('abc123');
    });
  });

  describe('update_asset', () => {
    it('should update asset metadata', async () => {
      const result = await handleTool('update_asset', {
        id: 123,
        title: 'Updated Title',
        alt_text: 'New alt text',
      }, { client: mockClient });

      expect(result.isError).toBeFalsy();
      expect(mockClient.updateAsset).toHaveBeenCalledWith(123, {
        title: 'Updated Title',
        alt_text: 'New alt text',
      });
    });
  });

  describe('add_tags_to_asset', () => {
    it('should add tags to asset', async () => {
      const result = await handleTool('add_tags_to_asset', {
        id: 123,
        tags: ['nature', 'landscape'],
      }, { client: mockClient });

      expect(result.isError).toBeFalsy();
      expect(mockClient.addTagsToAsset).toHaveBeenCalledWith(123, ['nature', 'landscape']);
    });
  });

  describe('create_collection', () => {
    it('should create a collection', async () => {
      const result = await handleTool('create_collection', {
        name: 'New Collection',
        description: 'A test collection',
      }, { client: mockClient });

      expect(result.isError).toBeFalsy();
      expect(mockClient.createCollection).toHaveBeenCalledWith({
        name: 'New Collection',
        description: 'A test collection',
      });
    });
  });

  describe('upload_file', () => {
    it('should upload a file', async () => {
      const result = await handleTool('upload_file', {
        file_path: '/path/to/test.jpg',
      }, { client: mockClient });

      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.message).toContain('Successfully uploaded');
      expect(data.asset).toBeDefined();
      expect(data.upload_guid).toBe('upload123');

      // Verify the upload flow was called correctly
      expect(mockClient.createUpload).toHaveBeenCalled();
      expect(mockClient.prepareAssetUpload).toHaveBeenCalledWith('upload123', {
        filename: 'test.jpg',
        file_size: 1000,
        created_via: 'mcp',
      });
      expect(mockClient.uploadToSignedUrl).toHaveBeenCalled();
      expect(mockClient.setAssetUploaded).toHaveBeenCalledWith('asset123');
      expect(mockClient.setUploadDone).toHaveBeenCalledWith(1);
    });
  });

  describe('upload_files', () => {
    it('should upload multiple files', async () => {
      const result = await handleTool('upload_files', {
        file_paths: ['/path/to/test1.jpg', '/path/to/test2.png'],
      }, { client: mockClient });

      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.message).toContain('Uploaded 2 of 2 files');
      expect(data.results).toHaveLength(2);
      expect(data.results[0].success).toBe(true);
      expect(data.results[1].success).toBe(true);
    });

    it('should return error when no files provided', async () => {
      const result = await handleTool('upload_files', {
        file_paths: [],
      }, { client: mockClient });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No files provided');
    });
  });

  describe('error handling', () => {
    it('should return error for unknown tool', async () => {
      const result = await handleTool('unknown_tool', {}, { client: mockClient });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown tool');
    });

    it('should handle client errors gracefully', async () => {
      const errorClient = createMockClient({
        whoami: vi.fn().mockRejectedValue(new Error('Authentication failed')),
      });

      const result = await handleTool('whoami', {}, { client: errorClient });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Authentication failed');
    });
  });
});

describe('Result Helpers', () => {
  it('successResult should format string data', () => {
    const result = successResult('test message');
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toBe('test message');
  });

  it('successResult should stringify object data', () => {
    const result = successResult({ key: 'value' });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content[0].text)).toEqual({ key: 'value' });
  });

  it('errorResult should set isError flag', () => {
    const result = errorResult('Something went wrong');
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Something went wrong');
  });
});
