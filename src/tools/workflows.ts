/**
 * Workflow tools
 */

import { idParam, paginationParams, successResult, type ToolModule } from './shared.js';

export const workflowTools: ToolModule = {
  definitions: [
    {
      name: 'list_workflows',
      description: 'List workflows',
      inputSchema: { type: 'object', properties: { ...paginationParams }, required: [] },
    },
    {
      name: 'get_workflow',
      description: 'Get workflow details',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'approve_workflow_step',
      description: 'Approve selected assets in a workflow step, moving them to the next step',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          asset_ids: { type: 'array', items: { type: 'number' }, description: 'Array of asset IDs to approve' },
        },
        required: ['id', 'asset_ids'],
      },
    },
  ],

  handlers: {
    async list_workflows(args, { client }) {
      return successResult(await client.listWorkflows(args));
    },
    async get_workflow(args, { client }) {
      return successResult(await client.getWorkflow(args.id as number | string));
    },
    async approve_workflow_step(args, { client }) {
      return successResult(await client.approveWorkflowStep(args.id as number | string, args.asset_ids as number[]));
    },
  },
};
