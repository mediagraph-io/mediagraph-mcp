/**
 * Meta Download tools — background CSV export of asset metadata.
 *
 * Replaces the old synchronous `download_meta` flow. Workflow:
 *   1. (optional) get_meta_download_columns — discover available columns
 *   2. create_meta_download with asset_ids + column_preset/columns
 *   3. poll list_meta_downloads, or wait for the email
 */

import { paginationParams, successResult, type ToolModule } from './shared.js';

export const metaDownloadTools: ToolModule = {
  definitions: [
    {
      name: 'list_meta_downloads',
      description: 'List background metadata-export jobs',
      inputSchema: {
        type: 'object',
        properties: {
          ...paginationParams,
          dates: { type: 'array', items: { type: 'string' }, description: 'Date range filter [start, end]' },
          user_id: { type: 'number' },
        },
        required: [],
      },
    },
    {
      name: 'get_meta_download_columns',
      description: 'Get the column catalog for metadata exports (grouped + IPTC + custom meta fields), plus the default `basic` set',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'create_meta_download',
      description: 'Kick off a background metadata CSV export. Returns { guid } to poll status.',
      inputSchema: {
        type: 'object',
        properties: {
          asset_ids: { type: 'string', description: 'Comma-separated asset IDs' },
          column_preset: { type: 'string', enum: ['basic', 'custom'], description: 'Omit to export all columns' },
          columns: { type: 'array', items: { type: 'string' }, description: 'Column names (when column_preset=custom)' },
          send_email: { type: 'boolean', description: 'Email a download link when ready' },
        },
        required: ['asset_ids'],
      },
      _meta: {
        wait: {
          pollTool: 'list_meta_downloads',
          idField: 'guid',
          statusField: 'aasm_state',
          terminal: ['ready', 'failed', 'errored'],
        },
      },
    },
    {
      name: 'update_meta_download',
      description: 'Toggle the `send_email` flag on an in-progress metadata export',
      inputSchema: {
        type: 'object',
        properties: {
          guid: { type: 'string', description: 'The export guid returned by create_meta_download' },
          send_email: { type: 'boolean' },
        },
        required: ['guid', 'send_email'],
      },
    },
  ],

  handlers: {
    async list_meta_downloads(args, { client }) {
      return successResult(await client.listMetaDownloads(args));
    },
    async get_meta_download_columns(_args, { client }) {
      return successResult(await client.getMetaDownloadColumns());
    },
    async create_meta_download(args, { client }) {
      return successResult(await client.createMetaDownload(args as {
        asset_ids: string;
        column_preset?: 'basic' | 'custom';
        columns?: string[];
        send_email?: boolean;
      }));
    },
    async update_meta_download(args, { client }) {
      return successResult(await client.updateMetaDownload(args.guid as string, args.send_email as boolean));
    },
  },
};
