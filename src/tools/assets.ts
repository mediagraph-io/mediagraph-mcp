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

NOTE on multi-word queries: the API uses Elasticsearch cross_fields, so a
multi-word query like "red barn" can match if "red" appears in one field and
"barn" appears in another. Quote phrases ("red barn") to require both terms
in the same field.

Sort: pass either 'order' or its alias 'direction' (asc/desc). Results have
an implicit id:asc tiebreaker (except when using a custom sort).

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
      name: 'tag_video_face',
      description: 'Manually tag a face track in a video; indexes the cropped frame into Rekognition.',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          person_index: { type: 'number', description: 'Person index returned by face detection' },
          name: { type: 'string', description: 'Optional name for the tagged face' },
          tag_id: { type: 'number', description: 'Optional existing tag ID to associate' },
        },
        required: ['id', 'person_index'],
      },
    },
    {
      name: 'detect_video_faces',
      description: 'Trigger face detection for an existing video asset (for videos uploaded before video face tagging shipped).',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'tag_asset_face',
      description: `Manually tag a detected face crop on an image asset and index it into Rekognition for org-wide face matching.

Workflow for "upload a headshot for a person tag":
  1. Upload the headshot via upload_file (optionally with the person tag attached).
  2. Call get_asset_face_taggings to get the face_id of the detected face crop.
  3. Call tag_asset_face with the person tag's id (or a new name) + that face_id.

After indexing, future uploads automatically run face matching against this person.`,
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          face_id: { type: 'string', description: 'Detected face id from face_taggings (Rekognition face id)' },
          tag_id: { type: 'number', description: 'Existing person tag id to associate (preferred when the tag already exists in a taxonomy)' },
          name: { type: 'string', description: 'Create a new person tag with this name (alternative to tag_id)' },
        },
        required: ['id', 'face_id'],
      },
    },
    {
      name: 'search_asset_faces',
      description: 'Run face search on an asset using the org-wide face index; matches detected faces to indexed person tags. Reindexes the asset on success.',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'block_asset_face',
      description: 'Block a detected face crop on an asset (creates a "Blocked Face" tag and excludes from future matching).',
      inputSchema: {
        type: 'object',
        properties: { id: idParam, face_id: { type: 'string' } },
        required: ['id', 'face_id'],
      },
    },
    {
      name: 'ignore_asset_face_toggle',
      description: 'Toggle the per-asset "ignore" state on a detected face id. Useful for hiding low-confidence detections without blocking the face globally.',
      inputSchema: {
        type: 'object',
        properties: { id: idParam, face_id: { type: 'string' } },
        required: ['id', 'face_id'],
      },
    },
    {
      name: 'ignore_asset_unidentified_faces',
      description: 'Hide all unidentified (unmatched) face crops on an asset.',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'set_asset_custom_meta',
      description: `Write to a custom meta field on an asset. The field's shape determines which value param to pass:

  - free (free-text):     pass \`value\` (or \`text\`)
  - select (single-pick): pass \`custom_meta_value_id\`
  - multi  (multi-pick):  pass \`custom_meta_value_ids\` (array)

Pass none of value/text/*_id to clear the field. The asset is reindexed on success.`,
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          custom_meta_field_id: { type: ['number', 'string'], description: 'CustomMetaField id to write' },
          value: { type: 'string', description: 'Free-text value (free fields)' },
          text: { type: 'string', description: 'Alias for value (server accepts either)' },
          custom_meta_value_id: { type: ['number', 'string'], description: 'Predefined value id (single-select fields)' },
          custom_meta_value_ids: { type: 'array', items: { type: ['number', 'string'] }, description: 'Predefined value ids (multi-select fields)' },
        },
        required: ['id', 'custom_meta_field_id'],
      },
    },
    {
      name: 'explain_asset_search',
      description: 'Super-admin diagnostic: show which Elasticsearch fields/terms matched a query for a given asset.',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          q: { type: 'string', description: 'Query to explain (or use text_q)' },
          text_q: { type: 'string', description: 'Alternate text query to explain' },
        },
        required: ['id'],
      },
    },
    {
      name: 'delete_published_image',
      description: 'Delete a single PublishedImage row. Auto-cleans the parent PublishedAsset when the last image is removed.',
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
    async tag_video_face(args, { client }) {
      const { id, ...rest } = args;
      return successResult(await client.tagVideoFace(id as number | string, rest as { person_index: number; name?: string; tag_id?: number }));
    },
    async detect_video_faces(args, { client }) {
      return successResult(await client.detectVideoFaces(args.id as number | string));
    },
    async tag_asset_face(args, { client }) {
      const { id, ...rest } = args;
      return successResult(await client.tagAssetFace(id as number | string, rest as { face_id: string; tag_id?: number; name?: string }));
    },
    async search_asset_faces(args, { client }) {
      return successResult(await client.searchAssetFaces(args.id as number | string));
    },
    async block_asset_face(args, { client }) {
      return successResult(await client.blockAssetFace(args.id as number | string, args.face_id as string));
    },
    async ignore_asset_face_toggle(args, { client }) {
      return successResult(await client.ignoreAssetFaceToggle(args.id as number | string, args.face_id as string));
    },
    async ignore_asset_unidentified_faces(args, { client }) {
      return successResult(await client.ignoreAssetUnidentifiedFaces(args.id as number | string));
    },
    async set_asset_custom_meta(args, { client }) {
      const { id, ...rest } = args;
      return successResult(await client.setAssetCustomMeta(
        id as number | string,
        rest as Parameters<typeof client.setAssetCustomMeta>[1],
      ));
    },
    async explain_asset_search(args, { client }) {
      const { id, ...rest } = args;
      return successResult(await client.explainAssetSearch(id as number | string, rest as { q?: string; text_q?: string }));
    },
    async delete_published_image(args, { client }) {
      await client.deletePublishedImage(args.id as number | string);
      return successResult({ success: true });
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
