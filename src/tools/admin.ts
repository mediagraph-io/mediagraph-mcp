/**
 * Admin tools (user groups, invites, settings)
 */

import { idParam, paginationParams, successResult, type ToolModule } from './shared.js';

export const adminTools: ToolModule = {
  definitions: [
    // User Groups
    {
      name: 'list_user_groups',
      description: 'List user groups',
      inputSchema: { type: 'object', properties: { ...paginationParams }, required: [] },
    },
    {
      name: 'create_user_group',
      description: 'Create a user group',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string' }, description: { type: 'string' } },
        required: ['name'],
      },
    },

    // Invites
    {
      name: 'list_invites',
      description: 'List pending invites',
      inputSchema: { type: 'object', properties: { ...paginationParams }, required: [] },
    },
    {
      name: 'create_invite',
      description: 'Invite a user to the organization',
      inputSchema: {
        type: 'object',
        properties: {
          email: { type: 'string', description: 'Email address(es) to invite (comma/semicolon separated for multiple)' },
          role_level: { type: 'string', enum: ['admin', 'global_content', 'global_library', 'global_tagger', 'general', 'restricted'] },
          note: { type: 'string', description: 'Note to include in invite email' },
        },
        required: ['email', 'role_level'],
      },
    },
    {
      name: 'update_invite',
      description: 'Update an invite (change role or note)',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          role_level: { type: 'string', enum: ['admin', 'global_content', 'global_library', 'global_tagger', 'general', 'restricted'] },
          note: { type: 'string' },
        },
        required: ['id'],
      },
    },
    {
      name: 'resend_invite',
      description: 'Resend an invite email',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },

    // Filter Groups
    {
      name: 'list_filter_groups',
      description: 'List saved filter groups',
      inputSchema: { type: 'object', properties: { ...paginationParams }, required: [] },
    },
    {
      name: 'get_filter_group',
      description: 'Get filter group details',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'create_filter_group',
      description: 'Create a new filter group with saved filter configurations',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          filter_order: { type: 'array', items: { type: 'string' }, description: 'Array of filter names in display order' },
        },
        required: ['name'],
      },
    },
    {
      name: 'update_filter_group',
      description: 'Update a filter group',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          name: { type: 'string' },
          filter_order: { type: 'array', items: { type: 'string' }, description: 'Array of filter names in display order' },
        },
        required: ['id'],
      },
    },
    {
      name: 'update_filter_group_visibility',
      description: 'Update the visibility of a specific filter within a filter group',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          name: { type: 'string', description: 'Filter name' },
          type: { type: 'string', enum: ['explore', 'manage'], description: 'Visibility type' },
          visible: { type: 'boolean', description: 'Visibility status' },
        },
        required: ['id', 'name', 'type', 'visible'],
      },
    },
    {
      name: 'delete_filter_group',
      description: 'Delete a filter group',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },

    // Search Queries
    {
      name: 'list_search_queries',
      description: 'List saved search queries',
      inputSchema: { type: 'object', properties: { ...paginationParams }, required: [] },
    },
    {
      name: 'get_search_query',
      description: 'Get search query details',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'create_search_query',
      description: 'Save a new search query. The sql field should contain an Elasticsearch SQL WHERE clause.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Search name' },
          description: { type: 'string', description: 'Search description' },
          sql: { type: 'string', description: 'SQL WHERE clause (Elasticsearch SQL syntax)' },
        },
        required: ['name', 'sql'],
      },
    },
    {
      name: 'update_search_query',
      description: 'Update a saved search query name or description. Note: The SQL query cannot be changed after creation.',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          name: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['id'],
      },
    },
    {
      name: 'delete_search_query',
      description: 'Delete a saved search query',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },

    // Crop Presets
    {
      name: 'list_crop_presets',
      description: 'List crop presets',
      inputSchema: { type: 'object', properties: { ...paginationParams }, required: [] },
    },
    {
      name: 'create_crop_preset',
      description: 'Create a crop preset',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          width: { type: 'number' },
          height: { type: 'number' },
        },
        required: ['name', 'width', 'height'],
      },
    },

    // Uploads
    {
      name: 'can_upload',
      description: 'Check if uploads are allowed (storage quota)',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'list_uploads',
      description: 'List upload sessions',
      inputSchema: { type: 'object', properties: { ...paginationParams }, required: [] },
    },
    {
      name: 'add_assets_to_upload',
      description: 'Add assets to an upload session',
      inputSchema: {
        type: 'object',
        properties: {
          guid: { type: 'string', description: 'Upload session GUID' },
          asset_ids: { type: 'array', items: { type: 'number' }, description: 'Asset IDs to add' },
        },
        required: ['guid', 'asset_ids'],
      },
    },

    // Contributions
    {
      name: 'list_contributions',
      description: 'List contribution portals (upload links). Use contribution_id with upload_file/upload_files to upload to a specific storage folder or lightbox.',
      inputSchema: { type: 'object', properties: { ...paginationParams }, required: [] },
    },
    {
      name: 'get_contribution',
      description: 'Get contribution details',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },

    // Personal Access Tokens
    {
      name: 'list_personal_access_tokens',
      description: 'List personal access tokens',
      inputSchema: { type: 'object', properties: { ...paginationParams }, required: [] },
    },
    {
      name: 'create_personal_access_token',
      description: 'Create a personal access token',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          scopes: { type: 'array', items: { type: 'string' } },
        },
        required: ['name'],
      },
    },
    {
      name: 'delete_personal_access_token',
      description: 'Delete a personal access token',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
  ],

  handlers: {
    // User Groups
    async list_user_groups(args, { client }) {
      return successResult(await client.listUserGroups(args));
    },
    async create_user_group(args, { client }) {
      return successResult(await client.createUserGroup(args as { name: string; description?: string }));
    },

    // Invites
    async list_invites(args, { client }) {
      return successResult(await client.listInvites(args));
    },
    async create_invite(args, { client }) {
      return successResult(await client.createInvite(args as { email: string; role_level: string; note?: string }));
    },
    async update_invite(args, { client }) {
      const { id, ...data } = args;
      return successResult(await client.updateInvite(id as number | string, data));
    },
    async resend_invite(args, { client }) {
      return successResult(await client.resendInvite(args.id as number | string));
    },

    // Filter Groups
    async list_filter_groups(args, { client }) {
      return successResult(await client.listFilterGroups(args));
    },
    async get_filter_group(args, { client }) {
      return successResult(await client.getFilterGroup(args.id as number | string));
    },
    async create_filter_group(args, { client }) {
      return successResult(await client.createFilterGroup(args as { name: string; filter_order?: string[] }));
    },
    async update_filter_group(args, { client }) {
      const { id, ...data } = args;
      return successResult(await client.updateFilterGroup(id as number | string, data));
    },
    async update_filter_group_visibility(args, { client }) {
      return successResult(await client.updateFilterGroupVisibility(
        args.id as number | string,
        { name: args.name as string, type: args.type as 'explore' | 'manage', visible: args.visible as boolean },
      ));
    },
    async delete_filter_group(args, { client }) {
      await client.deleteFilterGroup(args.id as number | string);
      return successResult({ success: true });
    },

    // Search Queries
    async list_search_queries(args, { client }) {
      return successResult(await client.listSearchQueries(args));
    },
    async get_search_query(args, { client }) {
      return successResult(await client.getSearchQuery(args.id as number | string));
    },
    async create_search_query(args, { client }) {
      return successResult(await client.createSearchQuery(args as { name: string; description?: string; sql: string }));
    },
    async update_search_query(args, { client }) {
      const { id, ...data } = args;
      return successResult(await client.updateSearchQuery(id as number | string, data));
    },
    async delete_search_query(args, { client }) {
      await client.deleteSearchQuery(args.id as number | string);
      return successResult({ success: true });
    },

    // Crop Presets
    async list_crop_presets(args, { client }) {
      return successResult(await client.listCropPresets(args));
    },
    async create_crop_preset(args, { client }) {
      return successResult(await client.createCropPreset(args as { name: string; width: number; height: number }));
    },

    // Uploads
    async can_upload(_args, { client }) {
      return successResult(await client.canUpload());
    },
    async list_uploads(args, { client }) {
      return successResult(await client.listUploads(args));
    },
    async add_assets_to_upload(args, { client }) {
      await client.addAssetsToUpload(args.guid as string, args.asset_ids as number[]);
      return successResult({ success: true });
    },

    // Contributions
    async list_contributions(args, { client }) {
      return successResult(await client.listContributions(args));
    },
    async get_contribution(args, { client }) {
      return successResult(await client.getContribution(args.id as number | string));
    },

    // Personal Access Tokens
    async list_personal_access_tokens(args, { client }) {
      return successResult(await client.listPersonalAccessTokens(args));
    },
    async create_personal_access_token(args, { client }) {
      return successResult(await client.createPersonalAccessToken(args as { name: string; scopes?: string[] }));
    },
    async delete_personal_access_token(args, { client }) {
      await client.deletePersonalAccessToken(args.id as number | string);
      return successResult({ success: true });
    },
  },
};
