/**
 * Tag Import tools — CSV/XLS-based tag bulk imports.
 *
 * Workflow: create → (optional) update mapping → start_process → poll list_tags
 * filtered by tag_import_id.
 */

import { idParam, paginationParams, successResult, type ToolModule } from './shared.js';

export const tagImportTools: ToolModule = {
  definitions: [
    {
      name: 'list_tag_imports',
      description: 'List tag-import jobs',
      inputSchema: { type: 'object', properties: { ...paginationParams }, required: [] },
    },
    {
      name: 'get_tag_import',
      description: 'Get a tag-import job',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'create_tag_import',
      description: 'Create a tag-import job. `file` is the uploaded CSV/XLS file reference (S3 key or upload id).',
      inputSchema: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Uploaded file reference' },
          note: { type: 'string' },
          name_column: { type: 'string', description: 'Column to use as the tag name' },
          columns: { type: 'object', description: 'Optional column mapping object' },
        },
        required: ['file'],
      },
    },
    {
      name: 'update_tag_import',
      description: 'Update a tag-import job',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          note: { type: 'string' },
          name_column: { type: 'string' },
          columns: { type: 'object' },
        },
        required: ['id'],
      },
    },
    {
      name: 'delete_tag_import',
      description: 'Delete a tag-import job',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'update_tag_import_mapping',
      description: 'Set the column mapping for a tag-import job',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          column: {
            type: 'object',
            description: 'Mapping object: { name, mapping }',
            properties: { name: { type: 'string' }, mapping: { type: 'string' } },
          },
        },
        required: ['id', 'column'],
      },
    },
    {
      name: 'start_tag_import',
      description: 'Start processing a tag-import job once it is in the `analyzed` state',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'get_tag_import_tags',
      description: 'List tags created/updated by a tag-import job',
      inputSchema: { type: 'object', properties: { id: idParam, ...paginationParams }, required: ['id'] },
    },
  ],

  handlers: {
    async list_tag_imports(args, { client }) {
      return successResult(await client.listTagImports(args));
    },
    async get_tag_import(args, { client }) {
      return successResult(await client.getTagImport(args.id as number | string));
    },
    async create_tag_import(args, { client }) {
      return successResult(await client.createTagImport(args as { file: string; note?: string; name_column?: string; columns?: unknown }));
    },
    async update_tag_import(args, { client }) {
      const { id, ...data } = args;
      return successResult(await client.updateTagImport(id as number | string, data));
    },
    async delete_tag_import(args, { client }) {
      await client.deleteTagImport(args.id as number | string);
      return successResult({ success: true });
    },
    async update_tag_import_mapping(args, { client }) {
      return successResult(await client.updateTagImportMapping(
        args.id as number | string,
        args.column as { name: string; mapping: string },
      ));
    },
    async start_tag_import(args, { client }) {
      return successResult(await client.startTagImportProcess(args.id as number | string));
    },
    async get_tag_import_tags(args, { client }) {
      const { id, ...rest } = args;
      return successResult(await client.getTagImportTags(id as number | string, rest));
    },
  },
};
