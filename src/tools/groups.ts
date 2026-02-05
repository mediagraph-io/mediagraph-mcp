/**
 * Asset group tools (Collections, Lightboxes, Storage Folders)
 */

import { idParam, paginationParams, successResult, type ToolModule } from './shared.js';

export const groupTools: ToolModule = {
  definitions: [
    // Collections
    {
      name: 'list_collections',
      description: 'List collections in the organization',
      inputSchema: {
        type: 'object',
        properties: { ...paginationParams, q: { type: 'string', description: 'Search by name' }, parent_id: { type: 'number' } },
        required: [],
      },
    },
    {
      name: 'get_collection',
      description: 'Get collection details',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'create_collection',
      description: 'Create a new collection',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          parent_id: { type: 'number' },
        },
        required: ['name'],
      },
    },
    {
      name: 'update_collection',
      description: 'Update a collection',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          name: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['id'],
      },
    },
    {
      name: 'delete_collection',
      description: 'Delete a collection',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'add_asset_to_collection',
      description: 'Add an asset to a collection',
      inputSchema: {
        type: 'object',
        properties: { collection_id: idParam, asset_id: idParam },
        required: ['collection_id', 'asset_id'],
      },
    },
    {
      name: 'get_collections_tree',
      description: 'Get collections hierarchy as a tree',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },

    // Multi-asset group operations
    {
      name: 'add_assets_to_group',
      description: 'Add multiple assets to a Collection or Lightbox at once',
      inputSchema: {
        type: 'object',
        properties: {
          ids: { type: 'array', items: { type: 'number' }, description: 'Array of asset IDs to add' },
          asset_group_id: { ...idParam, description: 'ID of Collection or Lightbox' },
        },
        required: ['ids', 'asset_group_id'],
      },
    },

    // Lightboxes
    {
      name: 'list_lightboxes',
      description: 'List lightboxes in the organization',
      inputSchema: {
        type: 'object',
        properties: { ...paginationParams, parent_id: { type: 'number' } },
        required: [],
      },
    },
    {
      name: 'get_lightbox',
      description: 'Get lightbox details',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'create_lightbox',
      description: 'Create a new lightbox',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          parent_id: { type: 'number' },
        },
        required: ['name'],
      },
    },
    {
      name: 'update_lightbox',
      description: 'Update a lightbox',
      inputSchema: {
        type: 'object',
        properties: { id: idParam, name: { type: 'string' }, description: { type: 'string' } },
        required: ['id'],
      },
    },
    {
      name: 'delete_lightbox',
      description: 'Delete a lightbox',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'add_asset_to_lightbox',
      description: 'Add an asset to a lightbox',
      inputSchema: {
        type: 'object',
        properties: { lightbox_id: idParam, asset_id: idParam },
        required: ['lightbox_id', 'asset_id'],
      },
    },
    {
      name: 'get_lightboxes_tree',
      description: 'Get lightboxes hierarchy as a tree',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },

    // Storage Folders
    {
      name: 'list_storage_folders',
      description: 'List storage folders',
      inputSchema: {
        type: 'object',
        properties: { ...paginationParams, parent_id: { type: 'number' } },
        required: [],
      },
    },
    {
      name: 'get_storage_folder',
      description: 'Get storage folder details',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'create_storage_folder',
      description: 'Create a new storage folder',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string' }, description: { type: 'string' }, parent_id: { type: 'number' } },
        required: ['name'],
      },
    },
    {
      name: 'get_storage_folders_tree',
      description: 'Get storage folders hierarchy as a tree',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
  ],

  handlers: {
    // Collections
    async list_collections(args, { client }) {
      return successResult(await client.listCollections(args));
    },
    async get_collection(args, { client }) {
      return successResult(await client.getCollection(args.id as number | string));
    },
    async create_collection(args, { client }) {
      return successResult(await client.createCollection(args as { name: string; description?: string; parent_id?: number }));
    },
    async update_collection(args, { client }) {
      const { id, ...data } = args;
      return successResult(await client.updateCollection(id as number | string, data));
    },
    async delete_collection(args, { client }) {
      await client.deleteCollection(args.id as number | string);
      return successResult({ success: true });
    },
    async add_asset_to_collection(args, { client }) {
      await client.addAssetToCollection(args.collection_id as number | string, args.asset_id as number | string);
      return successResult({ success: true });
    },
    async get_collections_tree(_args, { client }) {
      return successResult(await client.getCollectionsTree());
    },
    async add_assets_to_group(args, { client }) {
      await client.addAssetsToGroup(
        args.ids as number[],
        args.asset_group_id as number,
      );
      return successResult({ success: true, added_count: (args.ids as number[]).length });
    },

    // Lightboxes
    async list_lightboxes(args, { client }) {
      return successResult(await client.listLightboxes(args));
    },
    async get_lightbox(args, { client }) {
      return successResult(await client.getLightbox(args.id as number | string));
    },
    async create_lightbox(args, { client }) {
      return successResult(await client.createLightbox(args as { name: string; description?: string; parent_id?: number }));
    },
    async update_lightbox(args, { client }) {
      const { id, ...data } = args;
      return successResult(await client.updateLightbox(id as number | string, data));
    },
    async delete_lightbox(args, { client }) {
      await client.deleteLightbox(args.id as number | string);
      return successResult({ success: true });
    },
    async add_asset_to_lightbox(args, { client }) {
      await client.addAssetToLightbox(args.lightbox_id as number | string, args.asset_id as number | string);
      return successResult({ success: true });
    },
    async get_lightboxes_tree(_args, { client }) {
      return successResult(await client.getLightboxesTree());
    },

    // Storage Folders
    async list_storage_folders(args, { client }) {
      return successResult(await client.listStorageFolders(args));
    },
    async get_storage_folder(args, { client }) {
      return successResult(await client.getStorageFolder(args.id as number | string));
    },
    async create_storage_folder(args, { client }) {
      return successResult(await client.createStorageFolder(args as { name: string; description?: string; parent_id?: number }));
    },
    async get_storage_folders_tree(_args, { client }) {
      return successResult(await client.getStorageFoldersTree());
    },
  },
};
