/**
 * Tests for API Types
 */

import { describe, it, expect } from 'vitest';
import type {
  User,
  Organization,
  Membership,
  WhoamiResponse,
  Asset,
  SearchParams,
  SearchResponse,
  Collection,
  Lightbox,
  StorageFolder,
  Tag,
  RightsPackage,
  ShareLink,
  BulkJob,
  CustomMetaField,
  Webhook,
} from '../api/types/index.js';

describe('API Types', () => {
  describe('User types', () => {
    it('should define User interface', () => {
      const user: User = {
        id: 1,
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
      };

      expect(user.id).toBe(1);
      expect(user.email).toBe('test@example.com');
    });

    it('should define Organization interface', () => {
      const org: Organization = {
        id: 1,
        name: 'Test Org',
        slug: 'test-org',
      };

      expect(org.id).toBe(1);
      expect(org.name).toBe('Test Org');
    });

    it('should define WhoamiResponse interface', () => {
      const response: WhoamiResponse = {
        user: { id: 1, email: 'test@example.com', first_name: 'Test', last_name: 'User' },
        organization: { id: 1, name: 'Test Org', slug: 'test-org' },
        membership: { id: 1, user_id: 1, organization_id: 1, role: 'admin' },
      };

      expect(response.user).toBeDefined();
      expect(response.organization).toBeDefined();
      expect(response.membership).toBeDefined();
    });
  });

  describe('Asset types', () => {
    it('should define Asset interface with required fields', () => {
      const asset: Asset = {
        id: 1,
        guid: 'abc123',
        filename: 'test.jpg',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      expect(asset.id).toBe(1);
      expect(asset.guid).toBe('abc123');
      expect(asset.filename).toBe('test.jpg');
    });

    it('should allow optional metadata fields', () => {
      const asset: Asset = {
        id: 1,
        guid: 'abc123',
        filename: 'test.jpg',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        title: 'Test Image',
        description: 'A test image',
        alt_text: 'Alt text for the image',
        rating: 5,
        tags: ['nature', 'landscape'],
      };

      expect(asset.title).toBe('Test Image');
      expect(asset.tags).toContain('nature');
    });

    it('should define SearchParams interface', () => {
      const params: SearchParams = {
        q: 'test',
        page: 1,
        per_page: 25,
        tags: ['nature'],
        collection_id: 1,
        rating: [4, 5],
      };

      expect(params.q).toBe('test');
      expect(params.tags).toContain('nature');
    });

    it('should define SearchResponse interface', () => {
      const response: SearchResponse = {
        assets: [],
        total: 0,
        page: 1,
        per_page: 25,
        total_pages: 0,
      };

      expect(response.assets).toEqual([]);
      expect(response.total).toBe(0);
    });
  });

  describe('Asset group types', () => {
    it('should define Collection interface', () => {
      const collection: Collection = {
        id: 1,
        name: 'Test Collection',
        type: 'Collection',
        path_names: [],
        path_slugs: [],
        has_children: false,
        ancestor_ids: [],
        created_at: '2024-01-01T00:00:00Z',
      };

      expect(collection.type).toBe('Collection');
    });

    it('should define Lightbox interface', () => {
      const lightbox: Lightbox = {
        id: 1,
        name: 'Test Lightbox',
        type: 'Lightbox',
        path_names: [],
        path_slugs: [],
        has_children: false,
        ancestor_ids: [],
        created_at: '2024-01-01T00:00:00Z',
      };

      expect(lightbox.type).toBe('Lightbox');
    });

    it('should define StorageFolder interface', () => {
      const folder: StorageFolder = {
        id: 1,
        name: 'Test Folder',
        type: 'StorageFolder',
        path_names: [],
        path_slugs: [],
        has_children: false,
        ancestor_ids: [],
        created_at: '2024-01-01T00:00:00Z',
      };

      expect(folder.type).toBe('StorageFolder');
    });
  });

  describe('Tag types', () => {
    it('should define Tag interface', () => {
      const tag: Tag = {
        id: 1,
        name: 'Nature',
        slug: 'nature',
      };

      expect(tag.name).toBe('Nature');
      expect(tag.slug).toBe('nature');
    });
  });

  describe('Rights types', () => {
    it('should define RightsPackage interface', () => {
      const rights: RightsPackage = {
        id: 1,
        name: 'Full Rights',
        rights_class: 'owned',
      };

      expect(rights.rights_class).toBe('owned');
    });

    it('should allow valid rights_class values', () => {
      const classes: RightsPackage['rights_class'][] = ['owned', 'unlimited', 'some', 'library', 'none'];

      classes.forEach((cls) => {
        const rights: RightsPackage = { id: 1, name: 'Test', rights_class: cls };
        expect(rights.rights_class).toBe(cls);
      });
    });
  });

  describe('Sharing types', () => {
    it('should define ShareLink interface', () => {
      const shareLink: ShareLink = {
        id: 1,
        guid: 'share123',
        created_at: '2024-01-01T00:00:00Z',
      };

      expect(shareLink.guid).toBe('share123');
    });
  });

  describe('Job types', () => {
    it('should define BulkJob interface', () => {
      const job: BulkJob = {
        id: 1,
        guid: 'job123',
        job_type: 'add_tags',
        status: 'completed',
        total_count: 100,
        processed_count: 100,
        success_count: 98,
        error_count: 2,
        created_at: '2024-01-01T00:00:00Z',
      };

      expect(job.status).toBe('completed');
      expect(job.success_count).toBe(98);
    });

    it('should allow valid status values', () => {
      const statuses: BulkJob['status'][] = ['pending', 'processing', 'completed', 'failed', 'cancelled'];

      statuses.forEach((status) => {
        const job: BulkJob = {
          id: 1,
          guid: 'test',
          job_type: 'test',
          status,
          total_count: 0,
          processed_count: 0,
          success_count: 0,
          error_count: 0,
          created_at: '2024-01-01',
        };
        expect(job.status).toBe(status);
      });
    });
  });

  describe('Custom meta field types', () => {
    it('should define CustomMetaField interface', () => {
      const field: CustomMetaField = {
        id: 1,
        name: 'Project Code',
        field_type: 'text',
      };

      expect(field.name).toBe('Project Code');
      expect(field.field_type).toBe('text');
    });

    it('should allow AI-enabled fields', () => {
      const field: CustomMetaField = {
        id: 1,
        name: 'Auto Description',
        field_type: 'textarea',
        enable_ai: true,
        ai_prompt: 'Describe this image in detail',
      };

      expect(field.enable_ai).toBe(true);
      expect(field.ai_prompt).toBeDefined();
    });
  });

  describe('Webhook types', () => {
    it('should define Webhook interface', () => {
      const webhook: Webhook = {
        id: 1,
        name: 'Asset Created Hook',
        url: 'https://example.com/webhook',
        events: ['asset.created', 'asset.updated'],
      };

      expect(webhook.events).toContain('asset.created');
    });
  });
});
