/**
 * Social interaction tools (comments, notifications)
 */

import { idParam, paginationParams, successResult, type ToolModule } from './shared.js';

export const socialTools: ToolModule = {
  definitions: [
    // Comments
    {
      name: 'list_comments',
      description: 'List comments on a resource',
      inputSchema: {
        type: 'object',
        properties: {
          commentable_type: { type: 'string', enum: ['Asset', 'Collection', 'Lightbox'] },
          commentable_id: { type: 'number' },
          ...paginationParams,
        },
        required: ['commentable_type', 'commentable_id'],
      },
    },
    {
      name: 'create_comment',
      description: 'Create a comment',
      inputSchema: {
        type: 'object',
        properties: {
          body: { type: 'string' },
          commentable_type: { type: 'string', enum: ['Asset', 'Collection', 'Lightbox'] },
          commentable_id: { type: 'number' },
          parent_id: { type: 'number' },
        },
        required: ['body', 'commentable_type', 'commentable_id'],
      },
    },
    {
      name: 'delete_comment',
      description: 'Delete a comment',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },

    // Notifications
    {
      name: 'list_notifications',
      description: 'List notifications',
      inputSchema: { type: 'object', properties: { ...paginationParams }, required: [] },
    },
    {
      name: 'get_notification_count',
      description: 'Get unread notification count',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
  ],

  handlers: {
    // Comments
    async list_comments(args, { client }) {
      return successResult(await client.listComments(args));
    },
    async create_comment(args, { client }) {
      return successResult(await client.createComment(args as { body: string; commentable_type: string; commentable_id: number; parent_id?: number }));
    },
    async delete_comment(args, { client }) {
      await client.deleteComment(args.id as number | string);
      return successResult({ success: true });
    },

    // Notifications
    async list_notifications(args, { client }) {
      return successResult(await client.listNotifications(args));
    },
    async get_notification_count(_args, { client }) {
      return successResult(await client.getNotificationCount());
    },
  },
};
