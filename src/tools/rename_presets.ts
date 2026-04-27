/**
 * Rename Preset tools — Lightroom-style filename rename templates.
 *
 * `template` is an array of token objects, e.g.
 *   [{ type: 'text', value: 'IMG_' }, { type: 'sequence', padding: 4 }]
 */

import { idParam, paginationParams, successResult, type ToolModule } from './shared.js';

export const renamePresetTools: ToolModule = {
  definitions: [
    {
      name: 'list_rename_presets',
      description: 'List rename presets',
      inputSchema: {
        type: 'object',
        properties: { ...paginationParams, enabled: { type: 'boolean', description: 'Filter to enabled presets only' } },
        required: [],
      },
    },
    {
      name: 'get_rename_preset',
      description: 'Get a rename preset',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'create_rename_preset',
      description: 'Create a rename preset',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          enabled: { type: 'boolean' },
          position: { type: 'number' },
          template: {
            type: 'array',
            description: 'Array of token objects: { type, token, value, padding, custom_meta_field_name }',
            items: { type: 'object' },
          },
        },
        required: ['name'],
      },
    },
    {
      name: 'update_rename_preset',
      description: 'Update a rename preset',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          name: { type: 'string' },
          enabled: { type: 'boolean' },
          position: { type: 'number' },
          template: { type: 'array', items: { type: 'object' } },
        },
        required: ['id'],
      },
    },
    {
      name: 'delete_rename_preset',
      description: 'Delete a rename preset',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'reorder_rename_presets',
      description: 'Reorder rename presets by moving one from oldIndex to newIndex',
      inputSchema: {
        type: 'object',
        properties: { oldIndex: { type: 'number' }, newIndex: { type: 'number' } },
        required: ['oldIndex', 'newIndex'],
      },
    },
  ],

  handlers: {
    async list_rename_presets(args, { client }) {
      return successResult(await client.listRenamePresets(args));
    },
    async get_rename_preset(args, { client }) {
      return successResult(await client.getRenamePreset(args.id as number | string));
    },
    async create_rename_preset(args, { client }) {
      return successResult(await client.createRenamePreset(args as {
        name: string;
        enabled?: boolean;
        position?: number;
        template?: Array<Record<string, unknown>>;
      }));
    },
    async update_rename_preset(args, { client }) {
      const { id, ...data } = args;
      return successResult(await client.updateRenamePreset(id as number | string, data));
    },
    async delete_rename_preset(args, { client }) {
      await client.deleteRenamePreset(args.id as number | string);
      return successResult({ success: true });
    },
    async reorder_rename_presets(args, { client }) {
      return successResult(await client.updateRenamePresetPosition(args.oldIndex as number, args.newIndex as number));
    },
  },
};
