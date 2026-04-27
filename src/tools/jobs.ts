/**
 * Bulk job and background task tools
 */

import { idParam, paginationParams, successResult, type ToolModule } from './shared.js';

export const jobTools: ToolModule = {
  definitions: [
    // Bulk Jobs
    {
      name: 'list_bulk_jobs',
      description: 'List bulk jobs',
      inputSchema: { type: 'object', properties: { ...paginationParams }, required: [] },
    },
    {
      name: 'get_bulk_job',
      description: 'Get bulk job details and status',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'create_bulk_job',
      description: `Create a bulk job for batch operations on assets. Supports multiple operation types:
- Tag management: use tag_names + tag_mode (add/remove/replace)
- Metadata updates: use description + description_mode (set/append/prepend), rating, rights_package_id
- Organization: use add_asset_group_id + add_asset_group_type (Collection/Lightbox/StorageFolder)
- AI processing: use run_custom_meta_field_ids + cmf_overwrite_mode (skip/overwrite)
- Bulk actions: use destroy_all, restore_all, or generate_alt_text`,
      inputSchema: {
        type: 'object',
        properties: {
          asset_ids: { type: 'array', items: { type: 'number' }, description: 'Asset IDs to process' },
          // Tag operations
          tag_names: { type: 'array', items: { type: 'string' }, description: 'Tag names to add/remove/replace' },
          tag_mode: { type: 'string', enum: ['add', 'remove', 'replace'], description: 'Tag operation mode' },
          // Metadata operations
          description: { type: 'string', description: 'Description text to set/append/prepend' },
          description_mode: { type: 'string', enum: ['set', 'append', 'prepend'], description: 'Description operation mode' },
          rights_package_id: { type: 'number', description: 'Rights Package ID to assign' },
          rights_status: { type: 'string', description: 'Rights status code' },
          rating: { type: 'number', minimum: 0, maximum: 5, description: 'Rating value (0-5)' },
          // Organization operations
          add_asset_group_id: { type: 'number', description: 'ID of Collection/Lightbox/StorageFolder to add assets to' },
          add_asset_group_type: { type: 'string', enum: ['Collection', 'Lightbox', 'StorageFolder'], description: 'Type of asset group' },
          remove_asset_group_id: { type: 'number', description: 'ID of Collection/Lightbox to remove assets from' },
          remove_asset_group_type: { type: 'string', description: 'Type of asset group to remove from' },
          // Custom meta operations
          custom_meta: { type: 'object', description: 'Custom meta field values to set (keyed by field name)' },
          run_custom_meta_field_ids: { type: 'array', items: { type: 'number' }, description: 'Custom Meta Field IDs to run AI on' },
          cmf_overwrite_mode: { type: 'string', enum: ['skip', 'overwrite'], description: 'Whether to overwrite existing values when running AI' },
          // Bulk actions
          destroy_all: { type: 'boolean', description: 'Delete all specified assets' },
          restore_all: { type: 'boolean', description: 'Restore all specified assets from trash' },
          generate_alt_text: { type: 'boolean', description: 'Generate alt text using AI' },
          alt_text_generation_prompt: { type: 'string', description: 'Custom prompt for alt text generation' },
          // Rename operations
          rename_preset_id: { type: 'number', description: 'Rename Preset ID to apply' },
          rename_custom_text: { type: 'string', description: 'Custom text token value for rename' },
          rename_custom_text_2: { type: 'string', description: 'Second custom text token value for rename' },
          rename_start_number: { type: 'number', description: 'Per-asset starting number for sequence tokens' },
          rename_global_start: { type: 'number', description: 'Global starting number across the batch' },
          rename_duplicate_resolution: { type: 'string', enum: ['skip', 'append'], description: 'How to resolve duplicate filenames' },
          // Super-admin only
          rerun_auto_tag: { type: 'boolean', description: 'Re-run auto-tagging (super-admin only)' },
        },
        required: ['asset_ids'],
      },
      _meta: {
        wait: {
          pollTool: 'get_bulk_job',
          idField: 'id',
          statusField: 'aasm_state',
          terminal: ['done', 'completed', 'failed', 'cancelled', 'errored'],
        },
      },
    },
    {
      name: 'preview_rename_bulk_job',
      description: 'Preview the filenames a rename bulk job will produce, before submitting it.',
      inputSchema: {
        type: 'object',
        properties: {
          rename_preset_id: { type: 'number' },
          asset_ids: { type: 'array', items: { type: 'number' } },
          custom_text: { type: 'string' },
          custom_text_2: { type: 'string' },
          start_number: { type: 'number' },
          global_start: { type: 'number' },
        },
        required: ['rename_preset_id', 'asset_ids'],
      },
    },
    {
      name: 'cancel_bulk_job',
      description: 'Cancel a running bulk job',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'get_bulk_job_queue_position',
      description: 'Get queue position for a bulk job',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },

    // Meta Imports
    {
      name: 'list_meta_imports',
      description: 'List metadata import jobs',
      inputSchema: { type: 'object', properties: { ...paginationParams, q: { type: 'string', description: 'Search by note or filename' } }, required: [] },
    },
    {
      name: 'get_meta_import',
      description: 'Get metadata import job details',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },

    // Ingestions
    {
      name: 'list_ingestions',
      description: 'List ingestion jobs',
      inputSchema: { type: 'object', properties: { ...paginationParams }, required: [] },
    },
  ],

  handlers: {
    // Bulk Jobs
    async list_bulk_jobs(args, { client }) {
      return successResult(await client.listBulkJobs(args));
    },
    async get_bulk_job(args, { client }) {
      return successResult(await client.getBulkJob(args.id as number | string));
    },
    async create_bulk_job(args, { client }) {
      return successResult(await client.createBulkJob(args as {
        asset_ids: number[];
        tag_names?: string[];
        tag_mode?: string;
        description?: string;
        description_mode?: string;
        rights_package_id?: number;
        rights_status?: string;
        rating?: number;
        add_asset_group_id?: number;
        add_asset_group_type?: string;
        remove_asset_group_id?: number;
        remove_asset_group_type?: string;
        custom_meta?: Record<string, unknown>;
        run_custom_meta_field_ids?: number[];
        cmf_overwrite_mode?: string;
        destroy_all?: boolean;
        restore_all?: boolean;
        generate_alt_text?: boolean;
        alt_text_generation_prompt?: string;
        rename_preset_id?: number;
        rename_custom_text?: string;
        rename_custom_text_2?: string;
        rename_start_number?: number;
        rename_global_start?: number;
        rename_duplicate_resolution?: string;
        rerun_auto_tag?: boolean;
      }));
    },
    async preview_rename_bulk_job(args, { client }) {
      return successResult(await client.previewRenameBulkJob(args as {
        rename_preset_id: number;
        asset_ids: number[];
        custom_text?: string;
        custom_text_2?: string;
        start_number?: number;
        global_start?: number;
      }));
    },
    async cancel_bulk_job(args, { client }) {
      return successResult(await client.cancelBulkJob(args.id as number | string));
    },
    async get_bulk_job_queue_position(args, { client }) {
      return successResult(await client.getBulkJobQueuePosition(args.id as number | string));
    },

    // Meta Imports
    async list_meta_imports(args, { client }) {
      return successResult(await client.listMetaImports(args));
    },
    async get_meta_import(args, { client }) {
      return successResult(await client.getMetaImport(args.id as number | string));
    },

    // Ingestions
    async list_ingestions(args, { client }) {
      return successResult(await client.listIngestions(args));
    },
  },
};
