/**
 * Tag and taxonomy tools
 */

import { idParam, paginationParams, successResult, type ToolModule } from './shared.js';

export const tagTools: ToolModule = {
  definitions: [
    // Tags
    {
      name: 'list_tags',
      description: 'List tags in the organization',
      inputSchema: {
        type: 'object',
        properties: { ...paginationParams, q: { type: 'string', description: 'Search query' } },
        required: [],
      },
    },
    {
      name: 'get_tag',
      description: 'Get tag details',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'create_tag',
      description: 'Create a new tag',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string' }, parent_id: { type: 'number' } },
        required: ['name'],
      },
    },
    {
      name: 'update_tag',
      description: 'Update a tag',
      inputSchema: {
        type: 'object',
        properties: { id: idParam, name: { type: 'string' } },
        required: ['id'],
      },
    },
    {
      name: 'delete_tag',
      description: 'Delete a tag',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'merge_tags',
      description: 'Merge one tag into another',
      inputSchema: {
        type: 'object',
        properties: { id: idParam, target_tag_id: { type: 'number' } },
        required: ['id', 'target_tag_id'],
      },
    },

    // Taggings
    {
      name: 'get_tagging',
      description: 'Get details of a specific tagging (tag-to-asset relationship)',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'delete_tagging',
      description: 'Remove a tagging (untag an asset)',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },

    // Auto Tags
    {
      name: 'list_auto_tags',
      description: 'List AI-generated auto tags',
      inputSchema: {
        type: 'object',
        properties: { ...paginationParams, q: { type: 'string' } },
        required: [],
      },
    },
    {
      name: 'get_auto_tag',
      description: 'Get auto tag details',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'bulk_find_auto_tags',
      description: 'Find multiple auto tags by their names at once',
      inputSchema: {
        type: 'object',
        properties: { tag_names: { type: 'array', items: { type: 'string' }, description: 'Array of auto tag names to find' } },
        required: ['tag_names'],
      },
    },
    {
      name: 'delete_auto_tag',
      description: 'Delete/dismiss an auto tag',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },

    // Taxonomies
    {
      name: 'list_taxonomies',
      description: 'List taxonomies (controlled vocabularies)',
      inputSchema: { type: 'object', properties: { ...paginationParams }, required: [] },
    },
    {
      name: 'get_taxonomy',
      description: 'Get taxonomy details',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'create_taxonomy',
      description: 'Create a new taxonomy',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string' }, description: { type: 'string' } },
        required: ['name'],
      },
    },
    {
      name: 'list_taxonomy_tags',
      description: 'List tags within a taxonomy',
      inputSchema: {
        type: 'object',
        properties: { taxonomy_id: idParam, ...paginationParams, parent_id: { type: 'number' } },
        required: ['taxonomy_id'],
      },
    },
    {
      name: 'create_taxonomy_tag',
      description: 'Create a tag within a taxonomy',
      inputSchema: {
        type: 'object',
        properties: { taxonomy_id: idParam, name: { type: 'string' }, parent_id: { type: 'number' } },
        required: ['taxonomy_id', 'name'],
      },
    },

    // Creator Tags
    {
      name: 'list_creator_tags',
      description: 'List creator/photographer tags',
      inputSchema: {
        type: 'object',
        properties: { ...paginationParams, q: { type: 'string' } },
        required: [],
      },
    },
    {
      name: 'create_creator_tag',
      description: 'Create a new creator tag',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
    },
  ],

  handlers: {
    // Tags
    async list_tags(args, { client }) {
      return successResult(await client.listTags(args));
    },
    async get_tag(args, { client }) {
      return successResult(await client.getTag(args.id as number | string));
    },
    async create_tag(args, { client }) {
      return successResult(await client.createTag(args as { name: string; parent_id?: number }));
    },
    async update_tag(args, { client }) {
      const { id, ...data } = args;
      return successResult(await client.updateTag(id as number | string, data));
    },
    async delete_tag(args, { client }) {
      await client.deleteTag(args.id as number | string);
      return successResult({ success: true });
    },
    async merge_tags(args, { client }) {
      await client.mergeTagInto(args.id as number | string, args.target_tag_id as number);
      return successResult({ success: true });
    },

    // Taggings
    async get_tagging(args, { client }) {
      return successResult(await client.getTagging(args.id as number | string));
    },
    async delete_tagging(args, { client }) {
      await client.deleteTagging(args.id as number | string);
      return successResult({ success: true });
    },

    // Auto Tags
    async list_auto_tags(args, { client }) {
      return successResult(await client.listAutoTags(args));
    },
    async get_auto_tag(args, { client }) {
      return successResult(await client.getAutoTag(args.id as number | string));
    },
    async bulk_find_auto_tags(args, { client }) {
      return successResult(await client.bulkFindAutoTags(args.tag_names as string[]));
    },
    async delete_auto_tag(args, { client }) {
      await client.deleteAutoTag(args.id as number | string);
      return successResult({ success: true });
    },

    // Taxonomies
    async list_taxonomies(args, { client }) {
      return successResult(await client.listTaxonomies(args));
    },
    async get_taxonomy(args, { client }) {
      return successResult(await client.getTaxonomy(args.id as number | string));
    },
    async create_taxonomy(args, { client }) {
      return successResult(await client.createTaxonomy(args as { name: string; description?: string }));
    },
    async list_taxonomy_tags(args, { client }) {
      return successResult(await client.listTaxonomyTags(args.taxonomy_id as number | string, args));
    },
    async create_taxonomy_tag(args, { client }) {
      return successResult(await client.createTaxonomyTag(args.taxonomy_id as number | string, args as { name: string; parent_id?: number }));
    },

    // Creator Tags
    async list_creator_tags(args, { client }) {
      return successResult(await client.listCreatorTags(args));
    },
    async create_creator_tag(args, { client }) {
      return successResult(await client.createCreatorTag(args as { name: string }));
    },
  },
};
