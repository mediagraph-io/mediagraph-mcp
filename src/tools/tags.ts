/**
 * Tag and taxonomy tools
 */

import { idParam, paginationParams, successResult, type ToolModule } from './shared.js';

/**
 * Full enrichment surface accepted by both POST /api/tags and PUT /api/tags/:id.
 * Mirrors the controller's strong-params (TagsController#tag_params).
 */
const tagEnrichmentSchema = {
  name: { type: 'string' as const },
  description: { type: 'string' as const, description: 'Free-text description of the tag' },
  sub_type: {
    type: 'string' as const,
    enum: ['keyword', 'event', 'person'],
    description: 'Tag type. `event` unlocks date_start/end + location_*; `person` unlocks face-tagging.',
  },
  link: { type: 'string' as const, description: 'External URL to attach to the tag (Wikipedia, Wikidata, internal CMS, etc.)' },
  list: { type: 'string' as const, enum: ['searchable', 'visible', 'blocked'], description: 'Tag visibility list' },
  content: { type: 'string' as const, description: 'Long-form content / notes' },

  // Event sub_type
  date_start: { type: 'string' as const, description: 'Event start (ISO 8601). For sub_type=event.' },
  date_end: { type: 'string' as const, description: 'Event end (ISO 8601). For sub_type=event.' },
  location_country: { type: 'string' as const },
  location_country_code: { type: 'string' as const },
  location_state: { type: 'string' as const },
  location_city: { type: 'string' as const },
  location_name: { type: 'string' as const },
  featured_organization_name: { type: 'string' as const },

  // External-system identifiers (the "link to other data sources" surface)
  cms_id: { type: 'string' as const, description: 'External CMS / data-source identifier' },
  collection_management_system: { type: 'string' as const, description: 'Name of the source CMS (e.g. "TMS", "EmbARK")' },
  gtin: { type: 'string' as const, description: 'Global Trade Item Number' },
  sku: { type: 'string' as const, description: 'SKU' },

  // Artwork enrichment
  artwork_title: { type: 'string' as const },
  artwork_creator: { type: 'string' as const },
  artwork_creator_id: { type: 'number' as const },
  artwork_date_created: { type: 'string' as const },
  artwork_circa_date_created: { type: 'string' as const },
  artwork_medium: { type: 'string' as const },
  artwork_style_period: { type: 'string' as const },
  artwork_source: { type: 'string' as const },
  artwork_source_inventory_url: { type: 'string' as const, description: 'Link to the source inventory record' },
  artwork_inventory_number: { type: 'string' as const },
  artwork_copyright_notice: { type: 'string' as const },
  artwork_copyright_owner_id: { type: 'number' as const },
  artwork_licensor_id: { type: 'number' as const },
  artwork_licensor_name: { type: 'string' as const },
  artwork_physical_description: { type: 'string' as const },
  artwork_content_description: { type: 'string' as const },
  artwork_contribution_description: { type: 'string' as const },

  // Related tags + face poster
  related_tag_names: { type: 'array' as const, items: { type: 'string' as const }, description: 'Names of related tags (loose graph)' },
  poster_image_guid: { type: 'string' as const, description: 'Asset guid to use as the tag thumbnail' },
};

export const tagTools: ToolModule = {
  definitions: [
    // Tags
    {
      name: 'list_tags',
      description: 'List tags in the organization',
      inputSchema: {
        type: 'object',
        properties: {
          ...paginationParams,
          q: { type: 'string', description: 'Search query' },
          tag_import_id: { type: 'number', description: 'Filter to tags created by a given TagImport' },
        },
        required: [],
      },
    },
    {
      name: 'check_tag_name',
      description: 'Async uniqueness check for a tag name (e.g., for artwork inventory numbers). Returns { exists: boolean }.',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string', description: 'Tag name to check' } },
        required: ['name'],
      },
    },
    {
      name: 'get_tag',
      description: 'Get tag details',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'create_tag',
      description: 'Create a new tag. Supports the full enrichment surface (description, sub_type, link, event fields, artwork fields, external-system identifiers).',
      inputSchema: {
        type: 'object',
        properties: { ...tagEnrichmentSchema, parent_id: { type: 'number' } },
        required: ['name'],
      },
    },
    {
      name: 'update_tag',
      description: 'Update a tag — accepts every enrichment field (description, sub_type, link, event fields, artwork fields, external-system links, synonym graph).',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          ...tagEnrichmentSchema,
          // Synonym graph (server-side: requires admin to set lead_tag_*/new_synonym_names)
          lead_tag_id: { type: 'number', description: 'Make this tag a synonym of lead_tag_id (admin only)' },
          lead_tag_name: { type: 'string', description: 'Lead tag by name (admin only)' },
          new_synonym_names: { type: 'array', items: { type: 'string' }, description: 'Names of new tags to create as synonyms of this tag (admin only)' },
        },
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
      description: 'Merge one tag into another. With set_synonym=true, the source tag is preserved as a synonym of the target instead of being deleted.',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          target_tag_id: { type: 'number' },
          set_synonym: { type: 'boolean', description: 'Preserve source as a synonym of target rather than deleting it' },
        },
        required: ['id', 'target_tag_id'],
      },
    },
    {
      name: 'reset_tag_face',
      description: 'Clear face-tagging state on a person tag and re-enqueue Rekognition indexing.',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
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
    async check_tag_name(args, { client }) {
      return successResult(await client.checkTagName(args.name as string));
    },
    async get_tag(args, { client }) {
      return successResult(await client.getTag(args.id as number | string));
    },
    async create_tag(args, { client }) {
      return successResult(await client.createTag(args as Parameters<typeof client.createTag>[0]));
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
      await client.mergeTagInto(
        args.id as number | string,
        args.target_tag_id as number,
        args.set_synonym as boolean | undefined,
      );
      return successResult({ success: true });
    },
    async reset_tag_face(args, { client }) {
      await client.resetTagFace(args.id as number | string);
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
