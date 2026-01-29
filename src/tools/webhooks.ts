/**
 * Webhook tools
 */

import { idParam, paginationParams, successResult, type ToolModule } from './shared.js';

export const webhookTools: ToolModule = {
  definitions: [
    {
      name: 'list_webhooks',
      description: 'List webhooks',
      inputSchema: { type: 'object', properties: { ...paginationParams }, required: [] },
    },
    {
      name: 'get_webhook',
      description: 'Get webhook details',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'create_webhook',
      description: 'Create a webhook to receive event notifications',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Webhook name' },
          url: { type: 'string', description: 'Destination URL to POST events to' },
          events: {
            type: 'string',
            description: 'Comma-separated list of events: asset.created, asset.updated, asset.deleted, asset.restored, collection.updated',
          },
          enabled: { type: 'boolean', description: 'Enable the webhook (default: true)' },
          asset_group_id: { type: 'number', description: 'Scope to specific Collection or StorageFolder' },
          include_download_url: { type: 'boolean', description: 'Include asset download URL in payload' },
          group_assets: { type: 'boolean', description: 'Group multiple asset events into single request' },
          trash: { type: 'boolean', description: 'Include trash events' },
          note: { type: 'string', description: 'Internal notes' },
        },
        required: ['name', 'url'],
      },
    },
    {
      name: 'delete_webhook',
      description: 'Delete a webhook',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'get_webhook_logs',
      description: 'Get webhook delivery logs',
      inputSchema: { type: 'object', properties: { id: idParam, ...paginationParams }, required: ['id'] },
    },
  ],

  handlers: {
    async list_webhooks(args, { client }) {
      return successResult(await client.listWebhooks(args));
    },
    async get_webhook(args, { client }) {
      return successResult(await client.getWebhook(args.id as number | string));
    },
    async create_webhook(args, { client }) {
      return successResult(await client.createWebhook(args as {
        name: string;
        url: string;
        events?: string;
        enabled?: boolean;
        asset_group_id?: number;
        include_download_url?: boolean;
        group_assets?: boolean;
        trash?: boolean;
        note?: string;
      }));
    },
    async delete_webhook(args, { client }) {
      await client.deleteWebhook(args.id as number | string);
      return successResult({ success: true });
    },
    async get_webhook_logs(args, { client }) {
      return successResult(await client.getWebhookLogs(args.id as number | string, args));
    },
  },
};
