/**
 * User and organization tools
 */

import { idParam, paginationParams, successResult, type ToolModule } from './shared.js';

export const userTools: ToolModule = {
  definitions: [
    {
      name: 'whoami',
      description: 'Get information about the currently authenticated user and organization',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'get_organization',
      description: 'Get details about an organization by ID',
      inputSchema: {
        type: 'object',
        properties: { id: idParam },
        required: ['id'],
      },
    },
    {
      name: 'list_memberships',
      description: 'List organization memberships',
      inputSchema: { type: 'object', properties: { ...paginationParams }, required: [] },
    },
    {
      name: 'get_membership',
      description: 'Get membership details by ID',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'update_membership',
      description: 'Update a membership',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          role: { type: 'string', enum: ['admin', 'global_content', 'global_library', 'global_tagger', 'general', 'restricted'] },
        },
        required: ['id'],
      },
    },
  ],

  handlers: {
    async whoami(args, { client }) {
      return successResult(await client.whoami());
    },
    async get_organization(args, { client }) {
      return successResult(await client.getOrganization(args.id as number | string));
    },
    async list_memberships(args, { client }) {
      return successResult(await client.listMemberships(args));
    },
    async get_membership(args, { client }) {
      return successResult(await client.getMembership(args.id as number | string));
    },
    async update_membership(args, { client }) {
      const { id, ...data } = args;
      return successResult(await client.updateMembership(id as number | string, data));
    },
  },
};
