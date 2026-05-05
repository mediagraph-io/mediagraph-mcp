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

    // ── Lightbox-specific ────────────────────────────────────────────────
    {
      name: 'transfer_lightbox_ownership',
      description: 'Transfer ownership of a lightbox to another user (by user id).',
      inputSchema: {
        type: 'object',
        properties: { id: idParam, user_id: { type: 'number' } },
        required: ['id', 'user_id'],
      },
    },
    {
      name: 'apply_lightbox_membership_assets',
      description: 'Push a lightbox membership\'s pinned assets out to all members (creates per-member copies). Used to broadcast curated picks to a shared lightbox.',
      inputSchema: {
        type: 'object',
        properties: {
          asset_group_membership_id: { type: 'number' },
          asset_ids: { type: 'array', items: { type: 'number' } },
        },
        required: ['asset_group_membership_id', 'asset_ids'],
      },
    },
    {
      name: 'remove_lightbox_membership_assets',
      description: 'Remove pinned-assets from a lightbox membership (counterpart to apply).',
      inputSchema: {
        type: 'object',
        properties: {
          asset_group_membership_id: { type: 'number' },
          asset_ids: { type: 'array', items: { type: 'number' } },
        },
        required: ['asset_group_membership_id', 'asset_ids'],
      },
    },

    // ── Asset group invites (collection / lightbox / folder invitations) ─
    {
      name: 'list_asset_group_invites',
      description: 'List pending and accepted invitations to collections, lightboxes, and storage folders.',
      inputSchema: { type: 'object', properties: { ...paginationParams }, required: [] },
    },
    {
      name: 'get_asset_group_invite',
      description: 'Get an asset group invite by id.',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'create_asset_group_invite',
      description: 'Invite a user (by email) or existing membership to a collection / lightbox / storage folder.',
      inputSchema: {
        type: 'object',
        properties: {
          asset_group_id: { type: 'number', description: 'Collection / Lightbox / StorageFolder id' },
          email: { type: 'string' },
          membership_id: { type: 'number', description: 'Existing membership id (alternative to email)' },
          role: { type: 'string', description: 'Role to grant within the group (e.g. viewer, editor)' },
          message: { type: 'string', description: 'Personal note included in the invitation email' },
        },
        required: ['asset_group_id'],
      },
    },
    {
      name: 'update_asset_group_invite',
      description: 'Update an asset group invite (e.g. change role).',
      inputSchema: {
        type: 'object',
        properties: { id: idParam, role: { type: 'string' }, message: { type: 'string' } },
        required: ['id'],
      },
    },
    {
      name: 'delete_asset_group_invite',
      description: 'Cancel/revoke an asset group invite.',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
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

    // ── Lightbox-specific ────────────────────────────────────────────────
    async transfer_lightbox_ownership(args, { client }) {
      return successResult(await client.transferLightboxOwnership(args.id as number | string, args.user_id as number));
    },
    async apply_lightbox_membership_assets(args, { client }) {
      return successResult(await client.applyLightboxMembershipAssets(
        args.asset_group_membership_id as number,
        args.asset_ids as number[],
      ));
    },
    async remove_lightbox_membership_assets(args, { client }) {
      return successResult(await client.removeLightboxMembershipAssets(
        args.asset_group_membership_id as number,
        args.asset_ids as number[],
      ));
    },

    // ── Asset group invites ──────────────────────────────────────────────
    async list_asset_group_invites(args, { client }) {
      return successResult(await client.listAssetGroupInvites(args));
    },
    async get_asset_group_invite(args, { client }) {
      return successResult(await client.getAssetGroupInvite(args.id as number | string));
    },
    async create_asset_group_invite(args, { client }) {
      return successResult(await client.createAssetGroupInvite(args as Parameters<typeof client.createAssetGroupInvite>[0]));
    },
    async update_asset_group_invite(args, { client }) {
      const { id, ...data } = args;
      return successResult(await client.updateAssetGroupInvite(id as number | string, data));
    },
    async delete_asset_group_invite(args, { client }) {
      await client.deleteAssetGroupInvite(args.id as number | string);
      return successResult({ success: true });
    },
  },
};
