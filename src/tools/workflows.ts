/**
 * Workflow tools
 */

import { idParam, paginationParams, successResult, type ToolModule } from './shared.js';

export const workflowTools: ToolModule = {
  definitions: [
    // Workflows (multi-step approval pipelines)
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
      name: 'create_workflow',
      description: 'Create a new workflow.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          enabled: { type: 'boolean' },
        },
        required: ['name'],
      },
    },
    {
      name: 'update_workflow',
      description: 'Update a workflow.',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          name: { type: 'string' },
          description: { type: 'string' },
          enabled: { type: 'boolean' },
        },
        required: ['id'],
      },
    },
    {
      name: 'delete_workflow',
      description: 'Delete a workflow. In-flight workflow_steps may need to be cancelled separately.',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },

    // Workflow Steps
    {
      name: 'list_workflow_steps',
      description: 'List workflow steps (the user-facing approval queue).',
      inputSchema: { type: 'object', properties: { ...paginationParams }, required: [] },
    },
    {
      name: 'get_workflow_step',
      description: 'Get a workflow step by id.',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'create_workflow_step',
      description: 'Create a workflow step (typically attached to a workflow + asset_group).',
      inputSchema: {
        type: 'object',
        properties: {
          workflow_id: { type: 'number' },
          asset_group_id: { type: 'number' },
          name: { type: 'string' },
          position: { type: 'number' },
          preserve_subfolders: { type: 'boolean' },
        },
        required: ['workflow_id'],
      },
    },
    {
      name: 'update_workflow_step',
      description: 'Update a workflow step.',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          name: { type: 'string' },
          position: { type: 'number' },
          preserve_subfolders: { type: 'boolean' },
        },
        required: ['id'],
      },
    },
    {
      name: 'delete_workflow_step',
      description: 'Delete a workflow step.',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'approve_workflow_step',
      description: 'Approve all selected assets in a workflow step, moving them to the next step.',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          asset_ids: { type: 'array', items: { type: 'number' }, description: 'Array of asset IDs to approve' },
        },
        required: ['id', 'asset_ids'],
      },
    },
    {
      name: 'approve_workflow_step_picks',
      description: 'Approve a curated subset (picks) within a workflow step. Same shape as approve_workflow_step but only the chosen assets advance.',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          asset_ids: { type: 'array', items: { type: 'number' } },
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
    async create_workflow(args, { client }) {
      return successResult(await client.createWorkflow(args));
    },
    async update_workflow(args, { client }) {
      const { id, ...data } = args;
      return successResult(await client.updateWorkflow(id as number | string, data));
    },
    async delete_workflow(args, { client }) {
      await client.deleteWorkflow(args.id as number | string);
      return successResult({ success: true });
    },
    async list_workflow_steps(args, { client }) {
      return successResult(await client.listWorkflowSteps(args));
    },
    async get_workflow_step(args, { client }) {
      return successResult(await client.getWorkflowStep(args.id as number | string));
    },
    async create_workflow_step(args, { client }) {
      return successResult(await client.createWorkflowStep(args));
    },
    async update_workflow_step(args, { client }) {
      const { id, ...data } = args;
      return successResult(await client.updateWorkflowStep(id as number | string, data));
    },
    async delete_workflow_step(args, { client }) {
      await client.deleteWorkflowStep(args.id as number | string);
      return successResult({ success: true });
    },
    async approve_workflow_step(args, { client }) {
      return successResult(await client.approveWorkflowStep(args.id as number | string, args.asset_ids as number[]));
    },
    async approve_workflow_step_picks(args, { client }) {
      return successResult(await client.approveWorkflowStepPicks(args.id as number | string, args.asset_ids as number[]));
    },
  },
};
