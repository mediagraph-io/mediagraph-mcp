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
      description: 'Create a webhook',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          url: { type: 'string' },
          events: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'url', 'events'],
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
      return successResult(await client.createWebhook(args as { name: string; url: string; events: string[] }));
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
