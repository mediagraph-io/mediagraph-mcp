/**
 * MCP App tools - Visual UI tools for Mediagraph
 */

import type { SearchParams } from '../api/types/index.js';
import { paginationParams, successResult, type ToolModule } from './shared.js';

export const appTools: ToolModule = {
  definitions: [
    {
      name: 'search_assets_visual',
      description: `Search for assets and display results in an interactive visual gallery.

This tool provides a rich visual interface for browsing search results with:
- Thumbnail grid with hover previews
- Click to view full asset details
- Inline editing of metadata
- Rating, tagging, and download options
- Pagination controls

Use this when the user wants to visually browse or explore assets.`,
      inputSchema: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Search query with optional advanced operators (AND, OR, NOT, field:value, wildcards)' },
          ...paginationParams,
          ids: { type: 'array', items: { type: 'number' }, description: 'Filter by specific asset IDs' },
          guids: { type: 'array', items: { type: 'string' }, description: 'Filter by specific asset GUIDs' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
          collection_id: { type: 'number', description: 'Filter by collection ID' },
          storage_folder_id: { type: 'number', description: 'Filter by storage folder ID' },
          lightbox_id: { type: 'number', description: 'Filter by lightbox ID' },
          exts: { type: 'array', items: { type: 'string' }, description: 'Filter by file extensions' },
          rating: { type: 'array', items: { type: 'number' }, description: 'Filter by rating range [min, max]' },
          aspect: { type: 'string', enum: ['square', 'portrait', 'landscape', 'panorama'] },
          has_people: { type: 'string', enum: ['yes', 'no', 'untagged'] },
          has_alt_text: { type: 'string', enum: ['yes', 'no'] },
          gps: { type: 'boolean', description: 'Filter for assets with GPS data' },
          captured_at: { type: 'array', items: { type: 'string' }, description: 'Date range [start, end] in ISO 8601' },
          created_at: { type: 'array', items: { type: 'string' }, description: 'Date range [start, end] in ISO 8601' },
        },
        required: [],
      },
      // MCP Apps metadata - tells the host to display the UI
      // Include both formats for compatibility with different host versions
      _meta: {
        ui: {
          resourceUri: 'ui://mediagraph/gallery',
        },
        'ui/resourceUri': 'ui://mediagraph/gallery', // Legacy format for older hosts
      },
    },
  ],

  handlers: {
    async search_assets_visual(args, { client, organizationSlug }) {
      // Search with limited data to reduce response size
      const params: SearchParams = {
        ...(args as SearchParams),
        include_renditions: false, // Don't include all renditions to reduce size
        include_totals: true,
        per_page: (args as SearchParams).per_page || 24, // Reasonable default
      };
      const response = await client.searchAssets(params);

      // Return only essential fields to keep response small
      const lightAssets = response.assets.map(asset => ({
        id: asset.id,
        guid: asset.guid,
        filename: asset.filename,
        title: asset.title,
        description: asset.description,
        alt_text: asset.alt_text,
        type: asset.type || asset.file_type,
        ext: asset.ext,
        width: asset.width,
        height: asset.height,
        duration: asset.duration,
        rating: asset.rating,
        // Tags come as objects from API, extract just the names
        tags: asset.tags?.map(tag => typeof tag === 'string' ? tag : (tag as { name?: string }).name).filter(Boolean),
        thumb_url: asset.thumb_url,
        grid_url: asset.grid_url,
        small_url: asset.small_url,
        preview_url: asset.preview_url,
        created_at: asset.created_at,
        updated_at: asset.updated_at,
        captured_at: asset.captured_at,
      }));

      return successResult({
        assets: lightAssets,
        total: response.total,
        page: response.page,
        per_page: response.per_page,
        total_pages: response.total_pages,
        organization_slug: organizationSlug,
      });
    },
  },
};
