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
  },
};
