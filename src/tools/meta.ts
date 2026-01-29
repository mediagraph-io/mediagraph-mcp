/**
 * Custom metadata field tools
 */

import { idParam, paginationParams, successResult, type ToolModule } from './shared.js';

export const metaTools: ToolModule = {
  definitions: [
    {
      name: 'list_custom_meta_fields',
      description: 'List custom metadata fields',
      inputSchema: { type: 'object', properties: { ...paginationParams }, required: [] },
    },
    {
      name: 'get_custom_meta_field',
      description: 'Get custom meta field details',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'create_custom_meta_field',
      description: 'Create a custom metadata field',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          field_type: { type: 'string', enum: ['text', 'textarea', 'select', 'multiselect', 'date', 'number', 'boolean'] },
          description: { type: 'string' },
          required: { type: 'boolean' },
          searchable: { type: 'boolean' },
          filterable: { type: 'boolean' },
          options: { type: 'array', items: { type: 'string' } },
          enable_ai: { type: 'boolean' },
          ai_prompt: { type: 'string' },
        },
        required: ['name', 'field_type'],
      },
    },
  ],

  handlers: {
    async list_custom_meta_fields(args, { client }) {
      return successResult(await client.listCustomMetaFields(args));
    },
    async get_custom_meta_field(args, { client }) {
      return successResult(await client.getCustomMetaField(args.id as number | string));
    },
    async create_custom_meta_field(args, { client }) {
      return successResult(await client.createCustomMetaField(args));
    },
  },
};
