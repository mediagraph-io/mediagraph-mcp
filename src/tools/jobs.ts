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
      description: 'Create a bulk job for batch operations on assets',
      inputSchema: {
        type: 'object',
        properties: {
          asset_ids: { type: 'array', items: { type: 'number' }, description: 'Asset IDs to process' },
          action: { type: 'string', description: 'Bulk action (add_tags, remove_tags, add_to_collection, etc.)' },
          params: { type: 'object', description: 'Action parameters' },
        },
        required: ['asset_ids', 'action'],
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
      inputSchema: { type: 'object', properties: { ...paginationParams }, required: [] },
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
      return successResult(await client.createBulkJob(args as { asset_ids: number[]; action: string; params?: Record<string, unknown> }));
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
