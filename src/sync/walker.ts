/**
 * Walk a remote storage-folder subtree.
 *
 * Yields `(asset, relativePath)` pairs — relativePath mirrors the remote
 * folder structure rooted at the configured `storageFolderId`.
 *
 * Notes on how the API exposes structure:
 *   - StorageFolders form a tree (`parent_id`).
 *   - Assets live in exactly one StorageFolder (or none).
 *   - We recurse via `listStorageFolders({ parent_id })` and enumerate
 *     assets per folder via `searchAssets({ storage_folder_id, omit_child_storage_folders: true })`.
 *
 * Pagination: page through 100 at a time. Cursor support is server-side
 * only and not exposed for storage folders, so we do a full fan-out per
 * run. Cheap relative to actual byte transfer.
 */

import type { MediagraphClient } from '../api/client.js';
import type { Asset } from '../api/types/assets.js';
import type { StorageFolder } from '../api/types/groups.js';

export interface RemoteAsset {
  asset: Asset;
  relativePath: string;
}

export interface WalkOptions {
  /** Root storage folder id, or null for "all top-level folders" (org root) */
  rootFolderId: number | null;
}

const PAGE_SIZE = 100;

export async function* walkRemote(
  client: MediagraphClient,
  options: WalkOptions,
): AsyncGenerator<RemoteAsset, void, void> {
  if (options.rootFolderId === null) {
    // Walk every top-level folder (parent_id = null is implied by listStorageFolders without parent_id)
    const tops = await listAllChildFolders(client, undefined);
    for (const top of tops) {
      yield* walkFolder(client, top, top.name || `folder-${top.id}`);
    }
    return;
  }

  const root = await client.getStorageFolder(options.rootFolderId);
  yield* walkFolder(client, root, root.name || `folder-${root.id}`);
}

async function* walkFolder(
  client: MediagraphClient,
  folder: StorageFolder,
  prefix: string,
): AsyncGenerator<RemoteAsset, void, void> {
  // Yield assets directly in this folder, one page at a time
  let page = 1;
  while (true) {
    const result = await client.searchAssets({
      storage_folder_id: folder.id,
      omit_child_storage_folders: true,
      page,
      per_page: PAGE_SIZE,
    });
    const assets = result.assets ?? [];
    for (const asset of assets) {
      yield { asset, relativePath: `${prefix}/${asset.filename || `asset-${asset.id}`}` };
    }
    if (assets.length < PAGE_SIZE) break;
    page += 1;
  }

  // Recurse into children
  const children = await listAllChildFolders(client, folder.id);
  for (const child of children) {
    const childPrefix = `${prefix}/${child.name || `folder-${child.id}`}`;
    yield* walkFolder(client, child, childPrefix);
  }
}

async function listAllChildFolders(
  client: MediagraphClient,
  parentId: number | undefined,
): Promise<StorageFolder[]> {
  const out: StorageFolder[] = [];
  let page = 1;
  while (true) {
    const params = parentId === undefined ? { page, per_page: PAGE_SIZE } : { parent_id: parentId, page, per_page: PAGE_SIZE };
    const folders = await client.listStorageFolders(params);
    if (!folders.length) break;
    out.push(...folders);
    if (folders.length < PAGE_SIZE) break;
    page += 1;
  }
  return out;
}
