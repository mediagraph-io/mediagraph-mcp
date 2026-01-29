/**
 * Social interaction tools (comments, notifications)
 */

import { idParam, paginationParams, successResult, type ToolModule } from './shared.js';

export const socialTools: ToolModule = {
  definitions: [
    // Comments
    {
      name: 'list_comments',
      description: 'List comments on a Lightbox or Collection',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['Lightbox', 'Collection'], description: 'Type of commentable object' },
          id: { type: 'number', description: 'ID of the commentable object' },
          ...paginationParams,
        },
        required: ['type', 'id'],
      },
    },
    {
      name: 'create_comment',
      description: 'Create a new comment on a Lightbox or Collection. Supports markdown and @mentions.',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['Lightbox', 'Collection'], description: 'Type of commentable object' },
          id: { type: 'number', description: 'ID of the commentable object' },
          text: { type: 'string', description: 'Comment text (supports markdown and @mentions)' },
        },
        required: ['type', 'id', 'text'],
      },
    },
    {
      name: 'update_comment',
      description: 'Update a comment. Only the comment author can update their own comments.',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          text: { type: 'string', description: 'Updated comment text' },
        },
        required: ['id', 'text'],
      },
    },
    {
      name: 'delete_comment',
      description: 'Delete a comment. Only the comment author can delete their own comments.',
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
      return successResult(await client.listComments(args as { type: string; id: number }));
    },
    async create_comment(args, { client }) {
      return successResult(await client.createComment(
        args.type as string,
        args.id as number,
        { text: args.text as string },
      ));
    },
    async update_comment(args, { client }) {
      return successResult(await client.updateComment(
        args.id as number | string,
        { text: args.text as string },
      ));
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
