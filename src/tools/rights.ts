/**
 * Rights package tools
 */

import { idParam, paginationParams, successResult, type ToolModule } from './shared.js';

export const rightsTools: ToolModule = {
  definitions: [
    {
      name: 'list_rights_packages',
      description: 'List rights packages for managing asset usage rights',
      inputSchema: { type: 'object', properties: { ...paginationParams }, required: [] },
    },
    {
      name: 'get_rights_package',
      description: 'Get rights package details',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'create_rights_package',
      description: 'Create a new rights package',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          rights_class: { type: 'string', enum: ['owned', 'unlimited', 'some', 'library', 'none'] },
          description: { type: 'string' },
          expires: { type: 'boolean' },
          expires_at: { type: 'string' },
        },
        required: ['name', 'rights_class'],
      },
    },
  ],

  handlers: {
    async list_rights_packages(args, { client }) {
      return successResult(await client.listRightsPackages(args));
    },
    async get_rights_package(args, { client }) {
      return successResult(await client.getRightsPackage(args.id as number | string));
    },
    async create_rights_package(args, { client }) {
      return successResult(await client.createRightsPackage(args));
    },
  },
};
