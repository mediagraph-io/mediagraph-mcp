/**
 * Sharing and access request tools
 */

import { idParam, paginationParams, successResult, type ToolModule } from './shared.js';

export const sharingTools: ToolModule = {
  definitions: [
    // Share Links
    {
      name: 'list_share_links',
      description: 'List share links',
      inputSchema: { type: 'object', properties: { ...paginationParams, q: { type: 'string', description: 'Search by asset group name or user email' } }, required: [] },
    },
    {
      name: 'get_share_link',
      description: 'Get share link details',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'create_share_link',
      description: 'Create a share link for a Collection, Lightbox, or Storage Folder',
      inputSchema: {
        type: 'object',
        properties: {
          asset_group_id: { ...idParam, description: 'ID of the Collection, Lightbox, or Storage Folder to share' },
          enabled: { type: 'boolean', description: 'Enable the share link (default: true)' },
          image_and_video_permission: {
            type: 'string',
            enum: ['view', 'download_small', 'download_large', 'download_original'],
            description: 'Permission level for images and videos',
          },
          other_permission: {
            type: 'string',
            enum: ['view', 'download'],
            description: 'Permission level for other file types',
          },
          watermark_all: { type: 'boolean', description: 'Apply watermark to all downloads' },
          note: { type: 'string', description: 'Internal note' },
          expires_at: { type: 'string', description: 'Expiration date/time in ISO 8601 format' },
        },
        required: ['asset_group_id'],
      },
    },
    {
      name: 'delete_share_link',
      description: 'Delete a share link',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },

    // Access Requests
    {
      name: 'list_access_requests',
      description: 'List access requests and grants',
      inputSchema: {
        type: 'object',
        properties: {
          ...paginationParams,
          q: { type: 'string', description: 'Search by name, email, or user' },
          type: { type: 'string', enum: ['grant', 'request'] },
          aasm_state: { type: 'string', enum: ['pending', 'submitted', 'finalized'] },
        },
        required: [],
      },
    },
    {
      name: 'get_access_request',
      description: 'Get access request details',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'submit_access_request',
      description: 'Submit an access request',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'get_share_status',
      description: 'Lightweight status poll for a share (aasm_state, progress, code, url, direct_link)',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },

    // ── Shares (org-internal share resource — distinct from share_links) ─
    {
      name: 'list_shares',
      description: 'List shares (one-off transfers of an asset/group to a user, distinct from public share_links).',
      inputSchema: { type: 'object', properties: { ...paginationParams }, required: [] },
    },
    {
      name: 'get_share',
      description: 'Get a share by id.',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'create_share',
      description: 'Create a share (transfer assets / a group to a user). See Mediagraph share docs for the body fields supported by your org.',
      inputSchema: {
        type: 'object',
        properties: {
          asset_ids: { type: 'array', items: { type: 'number' } },
          asset_group_id: { type: 'number' },
          email: { type: 'string' },
          message: { type: 'string' },
          expires_at: { type: 'string' },
        },
        required: [],
      },
    },
    {
      name: 'delete_share',
      description: 'Revoke / delete a share by id.',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'get_share_html',
      description: 'Render the HTML email body that would be sent for this share (preview).',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'get_share_assets',
      description: 'List the assets included in a share.',
      inputSchema: {
        type: 'object',
        properties: { id: idParam, ...paginationParams },
        required: ['id'],
      },
    },

    // ── Access requests / grants gaps ────────────────────────────────────
    {
      name: 'create_access_request',
      description: 'Create a draft access request (pre-submit). Use submit_access_request to send it.',
      inputSchema: {
        type: 'object',
        properties: {
          asset_group_id: { type: 'number' },
          asset_id: { type: 'number' },
          requester_email: { type: 'string' },
          purpose: { type: 'string' },
          custom_meta: { type: 'object' },
        },
        required: [],
      },
    },
    {
      name: 'update_access_request',
      description: 'Update an in-progress access request.',
      inputSchema: {
        type: 'object',
        properties: { id: idParam, purpose: { type: 'string' }, custom_meta: { type: 'object' } },
        required: ['id'],
      },
    },
    {
      name: 'delete_access_request',
      description: 'Delete an access request.',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'finalize_access_request',
      description: 'Admin: finalize a submitted access request — approves and grants access.',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'revoke_access_request',
      description: 'Admin: revoke a previously granted access request.',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'agree_to_access_request',
      description: 'Guest: record agreement to terms / NDA on an access request.',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'set_access_request_custom_meta',
      description: 'Set a custom meta field value on an access request (mirrors set_asset_custom_meta).',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          custom_meta_field_id: { type: ['number', 'string'] },
          value: { type: 'string' },
          text: { type: 'string' },
          custom_meta_value_id: { type: ['number', 'string'] },
          custom_meta_value_ids: { type: 'array', items: { type: ['number', 'string'] } },
        },
        required: ['id', 'custom_meta_field_id'],
      },
    },
    {
      name: 'find_access_request',
      description: 'Find an access request by guid (used in guest-link resolution).',
      inputSchema: {
        type: 'object',
        properties: { guid: { type: 'string' } },
        required: ['guid'],
      },
    },
    {
      name: 'get_access_requests_tree',
      description: 'Hierarchical tree view of access requests by asset group.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'list_access_grants',
      description: 'List access grants (the records produced when an access request is finalized).',
      inputSchema: { type: 'object', properties: { ...paginationParams }, required: [] },
    },
    {
      name: 'delete_access_grant',
      description: 'Delete (revoke) an access grant.',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
  ],

  handlers: {
    // Share Links
    async list_share_links(args, { client }) {
      return successResult(await client.listShareLinks(args));
    },
    async get_share_link(args, { client }) {
      return successResult(await client.getShareLink(args.id as number | string));
    },
    async create_share_link(args, { client }) {
      const { asset_group_id, ...data } = args;
      return successResult(await client.createShareLink(asset_group_id as number | string, data as {
        enabled?: boolean;
        image_and_video_permission?: string;
        other_permission?: string;
        watermark_all?: boolean;
        note?: string;
        expires_at?: string;
      }));
    },
    async delete_share_link(args, { client }) {
      await client.deleteShareLink(args.id as number | string);
      return successResult({ success: true });
    },

    // Access Requests
    async list_access_requests(args, { client }) {
      return successResult(await client.listAccessRequests(args));
    },
    async get_access_request(args, { client }) {
      return successResult(await client.getAccessRequest(args.id as number | string));
    },
    async submit_access_request(args, { client }) {
      return successResult(await client.submitAccessRequest(args.id as number | string));
    },
    async get_share_status(args, { client }) {
      return successResult(await client.getShareStatus(args.id as number | string));
    },

    // ── Shares ───────────────────────────────────────────────────────────
    async list_shares(args, { client }) {
      return successResult(await client.listShares(args));
    },
    async get_share(args, { client }) {
      return successResult(await client.getShare(args.id as number | string));
    },
    async create_share(args, { client }) {
      return successResult(await client.createShare(args as Parameters<typeof client.createShare>[0]));
    },
    async delete_share(args, { client }) {
      await client.deleteShare(args.id as number | string);
      return successResult({ success: true });
    },
    async get_share_html(args, { client }) {
      return successResult(await client.getShareHtml(args.id as number | string));
    },
    async get_share_assets(args, { client }) {
      const { id, ...rest } = args;
      return successResult(await client.getShareAssets(id as number | string, rest));
    },

    // ── Access requests / grants gaps ────────────────────────────────────
    async create_access_request(args, { client }) {
      return successResult(await client.createAccessRequest(args as Parameters<typeof client.createAccessRequest>[0]));
    },
    async update_access_request(args, { client }) {
      const { id, ...data } = args;
      return successResult(await client.updateAccessRequest(id as number | string, data));
    },
    async delete_access_request(args, { client }) {
      await client.deleteAccessRequest(args.id as number | string);
      return successResult({ success: true });
    },
    async finalize_access_request(args, { client }) {
      return successResult(await client.finalizeAccessRequest(args.id as number | string));
    },
    async revoke_access_request(args, { client }) {
      return successResult(await client.revokeAccessRequest(args.id as number | string));
    },
    async agree_to_access_request(args, { client }) {
      return successResult(await client.agreeToAccessRequest(args.id as number | string));
    },
    async set_access_request_custom_meta(args, { client }) {
      const { id, ...rest } = args;
      return successResult(await client.setAccessRequestCustomMeta(
        id as number | string,
        rest as Parameters<typeof client.setAccessRequestCustomMeta>[1],
      ));
    },
    async find_access_request(args, { client }) {
      return successResult(await client.findAccessRequest({ guid: args.guid as string }));
    },
    async get_access_requests_tree(_args, { client }) {
      return successResult(await client.getAccessRequestsTree());
    },
    async list_access_grants(args, { client }) {
      return successResult(await client.listAccessGrants(args));
    },
    async delete_access_grant(args, { client }) {
      await client.deleteAccessGrant(args.id as number | string);
      return successResult({ success: true });
    },
  },
};
