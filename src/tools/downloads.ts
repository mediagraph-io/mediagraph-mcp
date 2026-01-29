/**
 * Download tools
 */

import { paginationParams, successResult, type ToolModule } from './shared.js';

export const downloadTools: ToolModule = {
  definitions: [
    {
      name: 'create_download',
      description: 'Create a batch download for multiple assets',
      inputSchema: {
        type: 'object',
        properties: {
          asset_ids: { type: 'array', items: { type: 'number' } },
          size: {
            type: 'string',
            enum: ['small', 'small-watermark', 'permalink', 'permalink-watermark', 'full', 'full-watermark', 'original'],
            description: 'Maximum size requested for assets in the download',
          },
        },
        required: ['asset_ids'],
      },
    },
    {
      name: 'get_download',
      description: 'Get download status and URL',
      inputSchema: { type: 'object', properties: { token: { type: 'string' } }, required: ['token'] },
    },
  ],

  handlers: {
    async create_download(args, { client }) {
      return successResult(await client.createDownload(args as { asset_ids: number[]; size?: string }));
    },
    async get_download(args, { client }) {
      return successResult(await client.getDownload(args.token as string));
    },
  },
};
