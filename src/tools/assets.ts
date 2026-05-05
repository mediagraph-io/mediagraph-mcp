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

    // ── Bulk asset operations ────────────────────────────────────────────
    {
      name: 'bulk_edit_assets',
      description: 'Update fields on many assets in a single call. Pass an `updates` object with the same field names as `update_asset` (title, description, alt_text, caption, credit, copyright, etc.).',
      inputSchema: {
        type: 'object',
        properties: {
          asset_ids: { type: 'array', items: { type: 'number' } },
          updates: { type: 'object', description: 'Field → new value map (mirrors update_asset)' },
        },
        required: ['asset_ids', 'updates'],
      },
    },
    {
      name: 'bulk_add_tags_to_assets',
      description: 'Add the same tag names to many assets at once.',
      inputSchema: {
        type: 'object',
        properties: {
          asset_ids: { type: 'array', items: { type: 'number' } },
          tag_names: { type: 'array', items: { type: 'string' } },
        },
        required: ['asset_ids', 'tag_names'],
      },
    },
    {
      name: 'bulk_remove_tags_from_assets',
      description: 'Remove the same tag names from many assets at once.',
      inputSchema: {
        type: 'object',
        properties: {
          asset_ids: { type: 'array', items: { type: 'number' } },
          tag_names: { type: 'array', items: { type: 'string' } },
        },
        required: ['asset_ids', 'tag_names'],
      },
    },
    {
      name: 'bulk_set_asset_rights_package',
      description: 'Set (or clear with null) the rights package on many assets in one call.',
      inputSchema: {
        type: 'object',
        properties: {
          asset_ids: { type: 'array', items: { type: 'number' } },
          rights_package_id: { type: ['number', 'null'] },
        },
        required: ['asset_ids'],
      },
    },
    {
      name: 'bulk_set_asset_creator_tag',
      description: 'Set (or clear with null) the creator tag on many assets in one call.',
      inputSchema: {
        type: 'object',
        properties: {
          asset_ids: { type: 'array', items: { type: 'number' } },
          creator_tag_id: { type: ['number', 'null'] },
        },
        required: ['asset_ids'],
      },
    },
    {
      name: 'remove_assets_from_group',
      description: 'Remove many assets from a collection / lightbox / storage folder at once.',
      inputSchema: {
        type: 'object',
        properties: {
          asset_ids: { type: 'array', items: { type: 'number' } },
          asset_group_id: { type: 'number', description: 'Collection / Lightbox / StorageFolder id' },
        },
        required: ['asset_ids', 'asset_group_id'],
      },
    },

    // ── Asset enrichment / AI / lifecycle ───────────────────────────────
    {
      name: 'auto_tag_asset',
      description: 'Run Rekognition / Vision auto-tagging on a single asset. Existing auto-tags are preserved; new ones are appended.',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'remove_asset_auto_tag',
      description: 'Dismiss a specific auto-tag from this asset (does not delete the auto-tag globally).',
      inputSchema: {
        type: 'object',
        properties: { id: idParam, auto_tag_id: { type: 'number' } },
        required: ['id', 'auto_tag_id'],
      },
    },
    {
      name: 'generate_asset_alt_text',
      description: 'Generate accessibility alt text for an asset using AI; saves to the alt_text field.',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'run_asset_ai',
      description: 'Invoke an AI-enabled custom meta field action on an asset (e.g., LLM-driven extraction, classification, or description).',
      inputSchema: {
        type: 'object',
        properties: { id: idParam, custom_meta_field_id: { type: 'number' } },
        required: ['id', 'custom_meta_field_id'],
      },
    },
    {
      name: 'clear_asset_nsfw',
      description: 'Mark an NSFW detection as a false positive on an asset; clears the moderation flag and re-indexes.',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'restore_asset',
      description: 'Restore a trashed asset (undo delete_asset).',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'get_asset_meta',
      description: 'Get extracted EXIF / IPTC / XMP / file metadata for an asset.',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'get_asset_content',
      description: 'Get extracted text content for a document asset (PDF/DOCX/etc.).',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'get_asset_ocr_content',
      description: 'Get OCR-extracted text from an image asset.',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'update_asset_description',
      description: 'Patch only the description field on an asset (lighter than update_asset; does not touch other fields).',
      inputSchema: {
        type: 'object',
        properties: { id: idParam, description: { type: 'string' } },
        required: ['id', 'description'],
      },
    },

    // ── Search-driven asset reads ────────────────────────────────────────
    {
      name: 'get_selected_assets',
      description: 'Fetch full asset records for an explicit ID list in one call. Use after `search_assets` returned a set of IDs and you want full attributes without N round-trips.',
      inputSchema: {
        type: 'object',
        properties: {
          ids: { type: 'array', items: { type: 'number' }, description: 'Asset ids to hydrate' },
          aggregates_only: { type: 'boolean', description: 'Return only aggregations, not full assets' },
        },
        required: ['ids'],
      },
    },
    {
      name: 'get_assets_updated_since_last_sync',
      description: 'Sync helper: returns asset ids that changed since `last_sync_at` (or since the server-tracked last_external_sync_at if omitted). Useful for export/mirror jobs.',
      inputSchema: {
        type: 'object',
        properties: {
          last_sync_at: { type: ['string', 'number'], description: 'ISO timestamp or unix seconds. Omit to use server-tracked value.' },
          any_user: { type: 'boolean', description: 'Include assets from any user (admin only).' },
          created_via: { type: 'string', description: 'Filter by `created_via` source (e.g. "lightroom", "api").' },
        },
        required: [],
      },
    },
    {
      name: 'get_asset_event_log',
      description: 'Audit trail for an asset: every version + who did what, paginated.',
      inputSchema: {
        type: 'object',
        properties: { id: idParam, ...paginationParams },
        required: ['id'],
      },
    },
    {
      name: 'get_asset_added_by',
      description: 'Find which user added a given asset to a given asset_group (collection / lightbox / folder).',
      inputSchema: {
        type: 'object',
        properties: { id: idParam, asset_group_id: { type: 'number' } },
        required: ['id', 'asset_group_id'],
      },
    },

    // ── Asset versioning + video editing ─────────────────────────────────
    {
      name: 'add_asset_version',
      description: 'Initiate an upload of a NEW version of an existing asset. Returns a signed S3 URL; PUT the file there to complete. For end-to-end uploads from disk, prefer `upload_file` with the asset id.',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          filename: { type: 'string' },
          content_type: { type: 'string' },
          file_size: { type: 'number' },
        },
        required: ['id', 'filename', 'content_type', 'file_size'],
      },
    },
    {
      name: 'slice_new_asset_version',
      description: 'Slice a video asset between `start` and `end` (seconds) and queue the result as a NEW VERSION of the same asset. Async — poll the asset.',
      inputSchema: {
        type: 'object',
        properties: { id: idParam, start: { type: 'number' }, end: { type: 'number' } },
        required: ['id', 'start', 'end'],
      },
    },
    {
      name: 'slice_new_asset',
      description: 'Slice a video asset between `start` and `end` (seconds) and queue the result as a brand-NEW asset (optionally added to a lightbox).',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          start: { type: 'number' },
          end: { type: 'number' },
          lightbox_id: { type: 'number', description: 'Optional: drop the new asset into this lightbox' },
        },
        required: ['id', 'start', 'end'],
      },
    },
    {
      name: 'set_asset_preview_image_from_time',
      description: 'For a video asset: set the poster/preview image from the frame at `seconds` into the video.',
      inputSchema: {
        type: 'object',
        properties: { id: idParam, seconds: { type: 'number' } },
        required: ['id', 'seconds'],
      },
    },
    {
      name: 'upload_asset_transcript',
      description: 'Upload a closed-caption / transcript text for a video asset (e.g. WebVTT or plain text).',
      inputSchema: {
        type: 'object',
        properties: { id: idParam, transcript: { type: 'string' } },
        required: ['id', 'transcript'],
      },
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

    // ── Bulk asset operations ────────────────────────────────────────────
    async bulk_edit_assets(args, { client }) {
      return successResult(await client.bulkEditAssets({
        asset_ids: args.asset_ids as number[],
        updates: args.updates as Record<string, unknown>,
      }));
    },
    async bulk_add_tags_to_assets(args, { client }) {
      return successResult(await client.bulkAddTagsToAssets(args.asset_ids as number[], args.tag_names as string[]));
    },
    async bulk_remove_tags_from_assets(args, { client }) {
      return successResult(await client.bulkRemoveTagsFromAssets(args.asset_ids as number[], args.tag_names as string[]));
    },
    async bulk_set_asset_rights_package(args, { client }) {
      return successResult(await client.bulkSetAssetRightsPackage(args.asset_ids as number[], (args.rights_package_id ?? null) as number | null));
    },
    async bulk_set_asset_creator_tag(args, { client }) {
      return successResult(await client.bulkSetAssetCreatorTag(args.asset_ids as number[], (args.creator_tag_id ?? null) as number | null));
    },
    async remove_assets_from_group(args, { client }) {
      return successResult(await client.removeAssetsFromGroup(args.asset_ids as number[], args.asset_group_id as number));
    },

    // ── Asset enrichment / AI / lifecycle ───────────────────────────────
    async auto_tag_asset(args, { client }) {
      return successResult(await client.autoTagAsset(args.id as number | string));
    },
    async remove_asset_auto_tag(args, { client }) {
      return successResult(await client.removeAssetAutoTag(args.id as number | string, args.auto_tag_id as number));
    },
    async generate_asset_alt_text(args, { client }) {
      return successResult(await client.generateAssetAltText(args.id as number | string));
    },
    async run_asset_ai(args, { client }) {
      return successResult(await client.runAssetAi(args.id as number | string, args.custom_meta_field_id as number));
    },
    async clear_asset_nsfw(args, { client }) {
      return successResult(await client.clearAssetNsfw(args.id as number | string));
    },
    async restore_asset(args, { client }) {
      return successResult(await client.restoreAsset(args.id as number | string));
    },
    async get_asset_meta(args, { client }) {
      return successResult(await client.getAssetMeta(args.id as number | string));
    },
    async get_asset_content(args, { client }) {
      return successResult(await client.getAssetContent(args.id as number | string));
    },
    async get_asset_ocr_content(args, { client }) {
      return successResult(await client.getAssetOcrContent(args.id as number | string));
    },
    async update_asset_description(args, { client }) {
      return successResult(await client.updateAssetDescription(args.id as number | string, args.description as string));
    },

    // ── Search-driven asset reads ────────────────────────────────────────
    async get_selected_assets(args, { client }) {
      return successResult(await client.getSelectedAssets(args as Parameters<typeof client.getSelectedAssets>[0]));
    },
    async get_assets_updated_since_last_sync(args, { client }) {
      return successResult(await client.getAssetsUpdatedSinceLastSync(args));
    },
    async get_asset_event_log(args, { client }) {
      const { id, ...rest } = args;
      return successResult(await client.getAssetEventLog(id as number | string, rest));
    },
    async get_asset_added_by(args, { client }) {
      return successResult(await client.getAssetAddedBy(args.id as number | string, args.asset_group_id as number));
    },

    // ── Asset versioning + video editing ─────────────────────────────────
    async add_asset_version(args, { client }) {
      const { id, ...rest } = args;
      return successResult(await client.addAssetVersion(id as number | string, rest as Parameters<typeof client.addAssetVersion>[1]));
    },
    async slice_new_asset_version(args, { client }) {
      return successResult(await client.sliceNewAssetVersion(args.id as number | string, args.start as number, args.end as number));
    },
    async slice_new_asset(args, { client }) {
      const { id, ...rest } = args;
      return successResult(await client.sliceNewAsset(id as number | string, rest as Parameters<typeof client.sliceNewAsset>[1]));
    },
    async set_asset_preview_image_from_time(args, { client }) {
      return successResult(await client.setAssetPreviewImageFromTime(args.id as number | string, args.seconds as number));
    },
    async upload_asset_transcript(args, { client }) {
      return successResult(await client.uploadAssetTranscript(args.id as number | string, args.transcript as string));
    },
  },
};
