/**
 * Asset tools
 */

import type { SearchParams } from '../api/types/index.js';
import { idParam, paginationParams, successResult, type ToolModule } from './shared.js';

export const assetTools: ToolModule = {
  definitions: [
    {
      name: 'search_assets',
      description: `Search for assets using filters and advanced query operators.

ADVANCED SEARCH QUERY SYNTAX (for the 'q' parameter):
- Basic: Just type a term to search all fields (e.g., "dog")
- Exclude: Use NOT or minus to exclude (e.g., "NOT dog" or "-dog")
- Combine: Use AND, OR, NOT (e.g., "dog AND cat", "dog OR cat", "dog NOT cat")
- Field search: Use field:value syntax (e.g., "tag_text:nature", "filename.keyword:IMG_1234.jpg")
- Wildcards: Use * (zero or more chars) or ? (single char) (e.g., "tag_text:part*", "tag_text:?artial")
- Existence: Use field:** to find assets with any value, NOT field:** for empty (e.g., "NOT tag_text:**" finds untagged assets)
- Complex: Use parentheses for grouping (e.g., "(dog OR cat) AND ext:jpg")

COMMON SEARCH FIELDS:
- tag_text: Keywords/tags
- filename.keyword: Exact filename
- description: Asset description
- title: Asset title
- ext: File extension
- creator_text: Creator/photographer name
- copyright: Copyright text
- city, state, country: Location fields`,
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
          include_totals: { type: 'boolean', description: 'Include aggregate counts' },
          include_renditions: { type: 'boolean', description: 'Include available sizes/formats' },
          include_meta: { type: 'boolean', description: 'Include full EXIF/IPTC metadata' },
        },
        required: [],
      },
    },
    {
      name: 'get_asset',
      description: 'Get detailed information about a specific asset',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          include_renditions: { type: 'boolean' },
          include_meta: { type: 'boolean' },
        },
        required: ['id'],
      },
    },
    {
      name: 'update_asset',
      description: 'Update asset metadata',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          title: { type: 'string' },
          description: { type: 'string' },
          alt_text: { type: 'string' },
          caption: { type: 'string' },
          credit: { type: 'string' },
          copyright: { type: 'string' },
          rating: { type: 'number', minimum: 0, maximum: 5 },
          headline: { type: 'string' },
          city: { type: 'string' },
          state: { type: 'string' },
          country: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['id'],
      },
    },
    {
      name: 'delete_asset',
      description: 'Delete (trash) an asset',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'add_tags_to_asset',
      description: 'Add tags to an asset',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags to add' },
        },
        required: ['id', 'tags'],
      },
    },
    {
      name: 'get_asset_download',
      description: 'Get a download URL for an asset',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          size: {
            type: 'string',
            enum: ['small', 'permalink', 'full', 'original'],
            description: 'Maximum size for the download (default: original)',
          },
          watermarked: { type: 'boolean', description: 'Request watermarked version' },
          version_number: { type: 'number', description: 'Specific version number to download' },
        },
        required: ['id'],
      },
    },
    {
      name: 'bulk_download_assets',
      description: 'Get a download URL for multiple assets (returns a ZIP file)',
      inputSchema: {
        type: 'object',
        properties: {
          asset_ids: {
            type: 'array',
            items: { type: 'number' },
            description: 'Array of asset IDs to download',
          },
          size: {
            type: 'string',
            enum: ['small', 'permalink', 'full', 'original'],
            description: 'Maximum size for all assets in the download (default: original)',
          },
          watermarked: { type: 'boolean', description: 'Request watermarked versions' },
          via: { type: 'string', description: 'Description of the app or integration making the call' },
          skip_meta: { type: 'boolean', description: 'Do not write metadata to files' },
        },
        required: ['asset_ids'],
      },
    },
    {
      name: 'get_asset_auto_tags',
      description: 'Get AI-generated auto tags for an asset',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'get_asset_face_taggings',
      description: 'Get face taggings for an asset',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'get_asset_versions',
      description: 'Get version history for an asset',
      inputSchema: { type: 'object', properties: { asset_id: idParam }, required: ['asset_id'] },
    },
    {
      name: 'revert_asset',
      description: 'Revert an asset to a previous version',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          version: { type: 'number', description: 'Version number to revert to' },
        },
        required: ['id', 'version'],
      },
    },
    {
      name: 'get_asset_counts',
      description: 'Get asset counts with optional filters',
      inputSchema: {
        type: 'object',
        properties: {
          collection_id: { type: 'number' },
          storage_folder_id: { type: 'number' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: [],
      },
    },
    {
      name: 'get_trashed_assets',
      description: 'Get trashed assets',
      inputSchema: { type: 'object', properties: { ...paginationParams }, required: [] },
    },
    {
      name: 'get_popular_assets',
      description: 'Get popular assets',
      inputSchema: { type: 'object', properties: { ...paginationParams }, required: [] },
    },
  ],

  handlers: {
    async search_assets(args, { client }) {
      return successResult(await client.searchAssets(args as SearchParams));
    },
    async get_asset(args, { client }) {
      return successResult(await client.getAsset(args.id as number | string, {
        include_renditions: args.include_renditions as boolean,
        include_meta: args.include_meta as boolean,
      }));
    },
    async update_asset(args, { client }) {
      const { id, ...data } = args;
      return successResult(await client.updateAsset(id as number | string, data));
    },
    async delete_asset(args, { client }) {
      await client.deleteAsset(args.id as number | string);
      return successResult({ success: true });
    },
    async add_tags_to_asset(args, { client }) {
      return successResult(await client.addTagsToAsset(args.id as number | string, args.tags as string[]));
    },
    async get_asset_download(args, { client }) {
      return successResult(await client.getAssetDownload(args.id as number | string, {
        size: args.size as string | undefined,
        watermarked: args.watermarked as boolean | undefined,
        version_number: args.version_number as number | undefined,
      }));
    },
    async bulk_download_assets(args, { client }) {
      return successResult(await client.getBulkDownload({
        asset_ids: args.asset_ids as number[],
        size: args.size as string | undefined,
        watermarked: args.watermarked as boolean | undefined,
        via: args.via as string | undefined,
        skip_meta: args.skip_meta as boolean | undefined,
      }));
    },
    async get_asset_auto_tags(args, { client }) {
      return successResult(await client.getAssetAutoTags(args.id as number | string));
    },
    async get_asset_face_taggings(args, { client }) {
      return successResult(await client.getAssetFaceTaggings(args.id as number | string));
    },
    async get_asset_versions(args, { client }) {
      return successResult(await client.getAssetDataVersions(args.asset_id as number | string));
    },
    async revert_asset(args, { client }) {
      return successResult(await client.revertAsset(args.id as number | string, args.version as number));
    },
    async get_asset_counts(args, { client }) {
      return successResult(await client.getAssetCounts(args as SearchParams));
    },
    async get_trashed_assets(args, { client }) {
      return successResult(await client.getTrashedAssets(args));
    },
    async get_popular_assets(args, { client }) {
      return successResult(await client.getPopularAssets(args));
    },
  },
};
