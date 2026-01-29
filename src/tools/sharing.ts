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
      inputSchema: { type: 'object', properties: { ...paginationParams }, required: [] },
    },
    {
      name: 'get_share_link',
      description: 'Get share link details',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'create_share_link',
      description: 'Create a share link for assets, collection, or lightbox',
      inputSchema: {
        type: 'object',
        properties: {
          asset_ids: { type: 'array', items: { type: 'number' } },
          collection_id: { type: 'number' },
          lightbox_id: { type: 'number' },
          name: { type: 'string' },
          password: { type: 'string' },
          expires_at: { type: 'string' },
        },
        required: [],
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
      return successResult(await client.createShareLink(args as {
        asset_ids?: number[];
        collection_id?: number;
        lightbox_id?: number;
        name?: string;
        password?: string;
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
