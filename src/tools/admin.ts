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
      inputSchema: { type: 'object', properties: { ...paginationParams, q: { type: 'string', description: 'Search by name or invite domain' } }, required: [] },
    },
    {
      name: 'get_user_group',
      description: 'Get a user group by id (members + permissions).',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
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
    {
      name: 'update_user_group',
      description: 'Update a user group (name, description, etc.).',
      inputSchema: {
        type: 'object',
        properties: { id: idParam, name: { type: 'string' }, description: { type: 'string' } },
        required: ['id'],
      },
    },
    {
      name: 'delete_user_group',
      description: 'Delete a user group. Members are not deleted.',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },

    // Invites
    {
      name: 'list_invites',
      description: 'List pending invites',
      inputSchema: { type: 'object', properties: { ...paginationParams, q: { type: 'string', description: 'Search by email or role level' } }, required: [] },
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
    {
      name: 'find_invite',
      description: 'Look up an invite by token (for the public invite-acceptance flow).',
      inputSchema: {
        type: 'object',
        properties: { token: { type: 'string' } },
        required: ['token'],
      },
    },
    {
      name: 'check_invite_email',
      description: 'Check whether a given email is a valid recipient for a new invite (already has account, already in org, etc.).',
      inputSchema: {
        type: 'object',
        properties: { email: { type: 'string' } },
        required: ['email'],
      },
    },
    {
      name: 'get_available_invite_role_levels',
      description: 'Return the list of role_level values that the current user is allowed to grant in an invite. Helps prevent BAD_ARGS at create time.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'accept_invite',
      description: 'Accept an invite using its email-link token (public flow — distinct from `accept_my_invite` which uses the profile-scoped invite list for an authenticated user).',
      inputSchema: {
        type: 'object',
        properties: { token: { type: 'string' } },
        required: ['token'],
      },
    },

    // Memberships admin (find / search / status)
    {
      name: 'find_membership',
      description: 'Find a single membership in the current org by username OR user_id.',
      inputSchema: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          user_id: { type: ['number', 'string'] },
        },
        required: [],
      },
    },
    {
      name: 'search_memberships',
      description: 'Search memberships within a comment context (collection / lightbox) — used for assignee pickers and @-mention lookups in commenting flows.',
      inputSchema: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Prefix-match on name / username / email' },
          commentable_type: { type: 'string', enum: ['Collection', 'Lightbox'] },
          commentable_id: { type: ['number', 'string'] },
          ...paginationParams,
        },
        required: [],
      },
    },
    {
      name: 'update_membership_status',
      description: 'Update the AASM status of a membership (e.g. activate, suspend). Different from `update_membership` which patches role_level / preferences.',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          status: { type: 'string', description: 'Target AASM state' },
        },
        required: ['id', 'status'],
      },
    },

    // Membership Requests
    {
      name: 'list_membership_requests',
      description: 'List pending requests from users asking to join the current org.',
      inputSchema: { type: 'object', properties: { ...paginationParams }, required: [] },
    },
    {
      name: 'get_pending_membership_requests_count',
      description: 'Count of pending membership requests (for badging admin dashboards).',
      inputSchema: { type: 'object', properties: {}, required: [] },
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
      inputSchema: { type: 'object', properties: { ...paginationParams, q: { type: 'string', description: 'Search by contribution name' } }, required: [] },
    },
    {
      name: 'get_contribution',
      description: 'Get contribution details',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'create_contribution',
      description: 'Create a new contribution portal (named upload link tied to a collection / lightbox / folder).',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          asset_group_id: { type: 'number', description: 'Destination collection / lightbox / folder' },
          enabled: { type: 'boolean' },
          require_login: { type: 'boolean' },
          allow_anonymous: { type: 'boolean' },
          message: { type: 'string' },
        },
        required: ['name'],
      },
    },
    {
      name: 'update_contribution',
      description: 'Update a contribution portal.',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          name: { type: 'string' },
          enabled: { type: 'boolean' },
          require_login: { type: 'boolean' },
          allow_anonymous: { type: 'boolean' },
          message: { type: 'string' },
        },
        required: ['id'],
      },
    },
    {
      name: 'delete_contribution',
      description: 'Delete a contribution portal.',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'find_contribution',
      description: 'Find a contribution by slug.',
      inputSchema: {
        type: 'object',
        properties: { slug: { type: 'string' } },
        required: ['slug'],
      },
    },
    {
      name: 'list_featured_contributions',
      description: 'List featured contribution portals (those highlighted in the org UI).',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'list_group_contributions',
      description: 'List contributions tied to a collection / lightbox / folder.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'list_lightbox_contributions',
      description: 'List contributions tied to lightboxes.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'list_link_contributions',
      description: 'List standalone (link-only) contributions.',
      inputSchema: { type: 'object', properties: {}, required: [] },
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
    {
      name: 'disable_personal_access_token',
      description: 'Super-admin: disable a PAT (requests respond with X-PAT-Disabled header)',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'enable_personal_access_token',
      description: 'Super-admin: re-enable a previously disabled PAT',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },

    // Organization CAI budget / trials (super-admin)
    {
      name: 'add_organization_cai_budget',
      description: 'Super-admin: send a Stripe invoice for a CAI budget top-up',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          amount: { type: 'number', description: 'Top-up amount' },
          description: { type: 'string' },
        },
        required: ['id'],
      },
    },
    {
      name: 'grant_organization_cai_budget',
      description: 'Super-admin: grant free CAI budget to an organization',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          amount: { type: 'number' },
          description: { type: 'string' },
        },
        required: ['id'],
      },
    },
    {
      name: 'mark_organization_cai_invoice_paid',
      description: 'Super-admin: mark an open CAI invoice as paid out-of-band',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'extend_organization_trial',
      description: 'Admin: extend a trialing/past_due/canceled subscription',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          days: { type: 'number', description: 'Number of days to extend by' },
          until: { type: 'string', description: 'ISO 8601 datetime to extend until (alternative to days)' },
        },
        required: ['id'],
      },
    },
    {
      name: 'export_custom_meta_fields',
      description: 'Bulk export custom meta fields by ID',
      inputSchema: {
        type: 'object',
        properties: { ids: { type: 'array', items: { type: 'number' } } },
        required: ['ids'],
      },
    },
  ],

  handlers: {
    // User Groups
    async list_user_groups(args, { client }) {
      return successResult(await client.listUserGroups(args));
    },
    async get_user_group(args, { client }) {
      return successResult(await client.getUserGroup(args.id as number | string));
    },
    async create_user_group(args, { client }) {
      return successResult(await client.createUserGroup(args as { name: string; description?: string }));
    },
    async update_user_group(args, { client }) {
      const { id, ...data } = args;
      return successResult(await client.updateUserGroup(id as number | string, data));
    },
    async delete_user_group(args, { client }) {
      await client.deleteUserGroup(args.id as number | string);
      return successResult({ success: true });
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
    async find_invite(args, { client }) {
      return successResult(await client.findInvite({ token: args.token as string }));
    },
    async check_invite_email(args, { client }) {
      return successResult(await client.checkInviteEmail(args.email as string));
    },
    async get_available_invite_role_levels(_args, { client }) {
      return successResult(await client.getAvailableRoleLevels());
    },
    async accept_invite(args, { client }) {
      return successResult(await client.acceptInvite(args.token as string));
    },

    // Memberships admin
    async find_membership(args, { client }) {
      return successResult(await client.findMembership(args as { username?: string; user_id?: number | string }));
    },
    async search_memberships(args, { client }) {
      return successResult(await client.searchMemberships(args as Parameters<typeof client.searchMemberships>[0]));
    },
    async update_membership_status(args, { client }) {
      return successResult(await client.updateMembershipStatus(args.id as number | string, args.status as string));
    },

    // Membership Requests
    async list_membership_requests(args, { client }) {
      return successResult(await client.listMembershipRequests(args));
    },
    async get_pending_membership_requests_count(_args, { client }) {
      return successResult(await client.getMembershipRequestsPendingCount());
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
    async create_contribution(args, { client }) {
      return successResult(await client.createContribution(args as Parameters<typeof client.createContribution>[0]));
    },
    async update_contribution(args, { client }) {
      const { id, ...data } = args;
      return successResult(await client.updateContribution(id as number | string, data));
    },
    async delete_contribution(args, { client }) {
      await client.deleteContribution(args.id as number | string);
      return successResult({ success: true });
    },
    async find_contribution(args, { client }) {
      return successResult(await client.findContribution({ slug: args.slug as string }));
    },
    async list_featured_contributions(_args, { client }) {
      return successResult(await client.getFeaturedContributions());
    },
    async list_group_contributions(_args, { client }) {
      return successResult(await client.getContributionGroup());
    },
    async list_lightbox_contributions(_args, { client }) {
      return successResult(await client.getContributionLightbox());
    },
    async list_link_contributions(_args, { client }) {
      return successResult(await client.getContributionLink());
    },
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
    async disable_personal_access_token(args, { client }) {
      return successResult(await client.disablePersonalAccessToken(args.id as number | string));
    },
    async enable_personal_access_token(args, { client }) {
      return successResult(await client.enablePersonalAccessToken(args.id as number | string));
    },

    // Organization CAI budget / trials
    async add_organization_cai_budget(args, { client }) {
      const { id, ...rest } = args;
      return successResult(await client.addOrganizationCaiBudget(
        id as number | string,
        rest as { amount?: number; description?: string },
      ));
    },
    async grant_organization_cai_budget(args, { client }) {
      const { id, ...rest } = args;
      return successResult(await client.grantOrganizationCaiBudget(
        id as number | string,
        rest as { amount?: number; description?: string },
      ));
    },
    async mark_organization_cai_invoice_paid(args, { client }) {
      return successResult(await client.markOrganizationCaiInvoicePaid(args.id as number | string));
    },
    async extend_organization_trial(args, { client }) {
      const { id, ...rest } = args;
      return successResult(await client.extendOrganizationTrial(
        id as number | string,
        rest as { days?: number; until?: string },
      ));
    },
    async export_custom_meta_fields(args, { client }) {
      return successResult(await client.exportCustomMetaFields(args.ids as number[]));
    },
  },
};
