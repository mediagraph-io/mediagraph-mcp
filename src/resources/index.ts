/**
 * MCP Resources for Mediagraph
 */

import type { MediagraphClient } from '../api/client.js';

export interface ResourceContext {
  client: MediagraphClient;
}

export interface Resource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface ResourceContent {
  uri: string;
  mimeType: string;
  text: string;
}

// Resource templates for listing
export const resourceTemplates = [
  {
    uriTemplate: 'mediagraph://asset/{id}',
    name: 'Mediagraph Asset',
    description: 'Get details about a specific asset by ID or GUID',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'mediagraph://collection/{id}',
    name: 'Mediagraph Collection',
    description: 'Get details about a specific collection',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'mediagraph://lightbox/{id}',
    name: 'Mediagraph Lightbox',
    description: 'Get details about a specific lightbox',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'mediagraph://search',
    name: 'Mediagraph Search',
    description: 'Search for assets with query parameters',
    mimeType: 'application/json',
  },
];

/**
 * Parse a mediagraph:// URI and extract the resource type and ID
 */
function parseUri(uri: string): { type: string; id?: string; query?: URLSearchParams } {
  const url = new URL(uri);
  const pathParts = url.pathname.split('/').filter(Boolean);

  if (pathParts.length === 0) {
    throw new Error('Invalid resource URI');
  }

  const type = pathParts[0];
  const id = pathParts[1];
  const query = url.searchParams;

  return { type, id, query };
}

/**
 * Read a resource by URI
 */
export async function readResource(uri: string, context: ResourceContext): Promise<ResourceContent> {
  const { client } = context;
  const { type, id, query } = parseUri(uri);

  try {
    switch (type) {
      case 'asset': {
        if (!id) {
          throw new Error('Asset ID is required');
        }
        const asset = await client.getAsset(id, {
          include_renditions: true,
          include_meta: true,
        });
        return {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(asset, null, 2),
        };
      }

      case 'collection': {
        if (!id) {
          throw new Error('Collection ID is required');
        }
        const collection = await client.getCollection(id);
        // Also get assets in the collection
        const assets = await client.searchAssets({
          collection_id: parseInt(id, 10),
          per_page: 50,
        });
        return {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({ ...collection, assets: assets.assets }, null, 2),
        };
      }

      case 'lightbox': {
        if (!id) {
          throw new Error('Lightbox ID is required');
        }
        const lightbox = await client.getLightbox(id);
        // Also get assets in the lightbox
        const assets = await client.searchAssets({
          lightbox_id: parseInt(id, 10),
          per_page: 50,
        });
        return {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({ ...lightbox, assets: assets.assets }, null, 2),
        };
      }

      case 'search': {
        const searchParams = {
          q: query?.get('q') || undefined,
          page: query?.has('page') ? parseInt(query.get('page')!, 10) : undefined,
          per_page: query?.has('per_page') ? parseInt(query.get('per_page')!, 10) : 25,
          tags: query?.getAll('tags') || undefined,
          collection_id: query?.has('collection_id') ? parseInt(query.get('collection_id')!, 10) : undefined,
          storage_folder_id: query?.has('storage_folder_id')
            ? parseInt(query.get('storage_folder_id')!, 10)
            : undefined,
        };
        const results = await client.searchAssets(searchParams);
        return {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(results, null, 2),
        };
      }

      default:
        throw new Error(`Unknown resource type: ${type}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      uri,
      mimeType: 'text/plain',
      text: `Error reading resource: ${message}`,
    };
  }
}

/**
 * List available resources (static list + dynamic based on recent activity)
 */
export async function listResources(context: ResourceContext): Promise<Resource[]> {
  const resources: Resource[] = [];

  try {
    // Get recent assets
    const recentAssets = await context.client.searchAssets({ per_page: 10 });
    for (const asset of recentAssets.assets) {
      resources.push({
        uri: `mediagraph://asset/${asset.guid}`,
        name: `Asset: ${asset.filename}`,
        description: asset.title || asset.description || `${asset.file_type} file`,
        mimeType: 'application/json',
      });
    }

    // Get collections
    const collections = await context.client.listCollections({ per_page: 10 });
    for (const collection of collections) {
      resources.push({
        uri: `mediagraph://collection/${collection.id}`,
        name: `Collection: ${collection.name}`,
        description: collection.description || `Collection with ${collection.visible_assets_count || 0} assets`,
        mimeType: 'application/json',
      });
    }

    // Get lightboxes
    const lightboxes = await context.client.listLightboxes({ per_page: 10 });
    for (const lightbox of lightboxes) {
      resources.push({
        uri: `mediagraph://lightbox/${lightbox.id}`,
        name: `Lightbox: ${lightbox.name}`,
        description: lightbox.description || `Lightbox with ${lightbox.visible_assets_count || 0} assets`,
        mimeType: 'application/json',
      });
    }
  } catch (error) {
    // If not authenticated or error, return empty list
    console.error('Error listing resources:', error);
  }

  return resources;
}
