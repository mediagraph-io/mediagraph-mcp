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

    // ── Tag → taxonomy graph ────────────────────────────────────────────
    {
      name: 'add_tag_to_taxonomy',
      description: 'Add an existing tag to a taxonomy as a taxonomy_tag.',
      inputSchema: {
        type: 'object',
        properties: { id: idParam, taxonomy_id: { type: 'number' } },
        required: ['id', 'taxonomy_id'],
      },
    },
    {
      name: 'remove_tag_taxonomies',
      description: 'Detach a tag from all taxonomies it belongs to.',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'bulk_find_tags',
      description: 'Find or stub many tags by name in a single call. Returns existing tags where matched, otherwise unsaved Tag-shaped records the agent can persist.',
      inputSchema: {
        type: 'object',
        properties: { names: { type: 'array', items: { type: 'string' } } },
        required: ['names'],
      },
    },
    {
      name: 'bulk_update_tags',
      description: 'Apply a single change to many tags (set list, attach/detach taxonomy).',
      inputSchema: {
        type: 'object',
        properties: {
          tag_ids: { type: 'array', items: { type: 'number' } },
          list: { type: 'string', enum: ['searchable', 'visible', 'blocked'] },
          add_taxonomy: { type: 'boolean' },
          remove_taxonomy: { type: 'boolean' },
        },
        required: ['tag_ids'],
      },
    },
    {
      name: 'bulk_delete_tags',
      description: 'Delete many tags by id in a single call.',
      inputSchema: {
        type: 'object',
        properties: { ids: { type: 'array', items: { type: 'number' } } },
        required: ['ids'],
      },
    },
    {
      name: 'get_tag_events',
      description: 'List recent tag activity events for the org. Optionally filter by year/month.',
      inputSchema: {
        type: 'object',
        properties: { ...paginationParams, year: { type: 'number' }, month: { type: 'number' } },
        required: [],
      },
    },
    {
      name: 'get_recent_tag_events',
      description: 'Top 10 most recent tag activity events (no pagination).',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },

    // ── Tag → face linkage ──────────────────────────────────────────────
    {
      name: 'get_tag_associated_faces',
      description: 'List the face crops currently associated with a person tag (across the org).',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'set_tag_face_membership',
      description: 'Associate a person tag with a user (by email). The user becomes the canonical "face" for the tag — useful for faceless tags that need to point to a real person.',
      inputSchema: {
        type: 'object',
        properties: { id: idParam, email: { type: 'string' } },
        required: ['id', 'email'],
      },
    },
    {
      name: 'remove_tag_face_membership',
      description: 'Remove the user-membership association from a person tag.',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'set_tag_face_creator_tag',
      description: 'Link a person tag to a creator tag by name. Photos created by that creator gain the linked person tag automatically.',
      inputSchema: {
        type: 'object',
        properties: { id: idParam, name: { type: 'string', description: 'Creator tag name' } },
        required: ['id', 'name'],
      },
    },
    {
      name: 'remove_tag_face_creator_tag',
      description: 'Unlink the creator-tag association from a person tag.',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },

    // ── Tagging-level face actions ─────────────────────────────────────
    {
      name: 'set_main_face_for_tagging',
      description: 'Promote a tagging to the canonical face for its tag. Used after tag_asset_face to pick which crop represents the person.',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'associate_tagging_with_face',
      description: 'Associate an existing tagging with a Rekognition face id (link tagging → detected face crop).',
      inputSchema: {
        type: 'object',
        properties: { id: idParam, face_id: { type: 'string' } },
        required: ['id', 'face_id'],
      },
    },
    {
      name: 'disassociate_tagging_with_face',
      description: 'Remove the face-crop association from a tagging.',
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
      name: 'update_taxonomy',
      description: 'Update a taxonomy (name, description, etc.).',
      inputSchema: {
        type: 'object',
        properties: { id: idParam, name: { type: 'string' }, description: { type: 'string' } },
        required: ['id'],
      },
    },
    {
      name: 'delete_taxonomy',
      description: 'Delete a taxonomy. Tags inside it are detached, not deleted.',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
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
      name: 'get_taxonomy_tags_tree',
      description: 'Hierarchical tree view of all taxonomy_tags within a taxonomy (parent → children).',
      inputSchema: { type: 'object', properties: { taxonomy_id: idParam }, required: ['taxonomy_id'] },
    },
    {
      name: 'get_taxonomy_tags_visible_asset_counts',
      description: 'Count assets visible-to-current-user under each taxonomy_tag id (for displaying counts in a tree view).',
      inputSchema: {
        type: 'object',
        properties: {
          taxonomy_id: idParam,
          taxonomy_tag_ids: { type: 'array', items: { type: 'number' } },
        },
        required: ['taxonomy_id', 'taxonomy_tag_ids'],
      },
    },
    {
      name: 'bulk_find_taxonomy_tags',
      description: 'Find or stub many taxonomy_tags by name in a single call (top-level — searches across taxonomies).',
      inputSchema: {
        type: 'object',
        properties: { names: { type: 'array', items: { type: 'string' } } },
        required: ['names'],
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
    {
      name: 'update_taxonomy_tag',
      description: 'Update a tag inside a taxonomy.',
      inputSchema: {
        type: 'object',
        properties: { taxonomy_id: idParam, id: idParam, name: { type: 'string' }, parent_id: { type: 'number' } },
        required: ['taxonomy_id', 'id'],
      },
    },
    {
      name: 'delete_taxonomy_tag',
      description: 'Delete a tag from a taxonomy.',
      inputSchema: {
        type: 'object',
        properties: { taxonomy_id: idParam, id: idParam },
        required: ['taxonomy_id', 'id'],
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

    // ── Tag → taxonomy graph ─────────────────────────────────────────────
    async add_tag_to_taxonomy(args, { client }) {
      return successResult(await client.addTagToTaxonomy(args.id as number | string, args.taxonomy_id as number));
    },
    async remove_tag_taxonomies(args, { client }) {
      return successResult(await client.removeTagTaxonomies(args.id as number | string));
    },
    async bulk_find_tags(args, { client }) {
      return successResult(await client.bulkFindTags(args.names as string[]));
    },
    async bulk_update_tags(args, { client }) {
      return successResult(await client.bulkUpdateTags(args as Parameters<typeof client.bulkUpdateTags>[0]));
    },
    async bulk_delete_tags(args, { client }) {
      return successResult(await client.bulkDestroyTags(args.ids as number[]));
    },
    async get_tag_events(args, { client }) {
      return successResult(await client.getTagEvents(args));
    },
    async get_recent_tag_events(_args, { client }) {
      return successResult(await client.getRecentTagEvents());
    },

    // ── Tag → face linkage ──────────────────────────────────────────────
    async get_tag_associated_faces(args, { client }) {
      return successResult(await client.getTagAssociatedFaces(args.id as number | string));
    },
    async set_tag_face_membership(args, { client }) {
      return successResult(await client.setTagFaceMembership(args.id as number | string, args.email as string));
    },
    async remove_tag_face_membership(args, { client }) {
      return successResult(await client.removeTagFaceMembership(args.id as number | string));
    },
    async set_tag_face_creator_tag(args, { client }) {
      return successResult(await client.setTagFaceCreatorTag(args.id as number | string, args.name as string));
    },
    async remove_tag_face_creator_tag(args, { client }) {
      return successResult(await client.removeTagFaceCreatorTag(args.id as number | string));
    },

    // ── Tagging-level face actions ──────────────────────────────────────
    async set_main_face_for_tagging(args, { client }) {
      return successResult(await client.setMainFaceForTagging(args.id as number | string));
    },
    async associate_tagging_with_face(args, { client }) {
      return successResult(await client.associateTaggingWithFace(args.id as number | string, args.face_id as string));
    },
    async disassociate_tagging_with_face(args, { client }) {
      return successResult(await client.disassociateTaggingWithFace(args.id as number | string));
    },

    // ── Taxonomy gaps ───────────────────────────────────────────────────
    async update_taxonomy(args, { client }) {
      const { id, ...data } = args;
      return successResult(await client.updateTaxonomy(id as number | string, data));
    },
    async delete_taxonomy(args, { client }) {
      await client.deleteTaxonomy(args.id as number | string);
      return successResult({ success: true });
    },
    async get_taxonomy_tags_tree(args, { client }) {
      return successResult(await client.getTaxonomyTagsTree(args.taxonomy_id as number | string));
    },
    async get_taxonomy_tags_visible_asset_counts(args, { client }) {
      return successResult(await client.getTaxonomyTagsVisibleAssetCounts(
        args.taxonomy_id as number | string,
        args.taxonomy_tag_ids as number[],
      ));
    },
    async bulk_find_taxonomy_tags(args, { client }) {
      return successResult(await client.bulkFindTaxonomyTags(args.names as string[]));
    },
    async update_taxonomy_tag(args, { client }) {
      const { taxonomy_id, id, ...data } = args;
      return successResult(await client.updateTaxonomyTag(taxonomy_id as number | string, id as number | string, data));
    },
    async delete_taxonomy_tag(args, { client }) {
      await client.deleteTaxonomyTag(args.taxonomy_id as number | string, args.id as number | string);
      return successResult({ success: true });
    },
  },
};
