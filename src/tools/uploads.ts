/**
 * Upload tools
 */

import { stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { successResult, errorResult, type ToolModule } from './shared.js';

// Common MIME types
const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
  '.psd': 'image/vnd.adobe.photoshop',
  '.ai': 'application/postscript',
  '.eps': 'application/postscript',
  '.raw': 'image/x-raw',
  '.cr2': 'image/x-canon-cr2',
  '.nef': 'image/x-nikon-nef',
  '.arw': 'image/x-sony-arw',
  '.dng': 'image/x-adobe-dng',
};

function getMimeType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

export const uploadTools: ToolModule = {
  definitions: [
    {
      name: 'upload_file',
      description: `Upload a file to Mediagraph. Two body modes (file_path or file_data) and three session modes:

Body modes:
1. Local file: Provide file_path for files on the user's local filesystem
2. Direct upload: Provide file_data (base64-encoded) with filename for files from other sources

Session modes (mutually exclusive):
- Default: a fresh one-shot upload session is created and finalized for this single file.
- upload_guid: append to an existing session created via create_upload_session. The session is NOT finalized; call set_upload_done when your batch is complete.
- contribution_id: upload via a contribution's configured destination (storage folder / lightbox).

Files >16 MiB automatically use S3 multipart upload (parallel parts, retry per part); smaller files go through a single signed PUT.`,
      inputSchema: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Absolute path to the file on the local filesystem',
          },
          file_data: {
            type: 'string',
            description: 'Base64-encoded file content (use this when file_path is not available)',
          },
          filename: {
            type: 'string',
            description: 'Filename with extension (required when using file_data)',
          },
          upload_guid: {
            type: 'string',
            description: 'Append to an existing upload session (from create_upload_session). Caller is responsible for finalizing with set_upload_done.',
          },
          contribution_id: {
            type: 'number',
            description: 'Optional: ID of a contribution (upload link). Mutually exclusive with upload_guid.',
          },
        },
        required: [],
      },
    },
    {
      name: 'upload_files',
      description: `Upload multiple files from the local filesystem in one operation.

Session behavior:
- Default: creates one fresh session, uploads all files into it, finalizes it.
- upload_guid: appends to an existing session; does NOT finalize (caller's job).
- contribution_id: routes the new session through a contribution.

Files >16 MiB use S3 multipart automatically.`,
      inputSchema: {
        type: 'object',
        properties: {
          file_paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of absolute paths to files on the local filesystem',
          },
          upload_guid: {
            type: 'string',
            description: 'Append to an existing upload session (from create_upload_session). Caller is responsible for finalizing with set_upload_done.',
          },
          contribution_id: {
            type: 'number',
            description: 'Optional: ID of a contribution (upload link). Mutually exclusive with upload_guid.',
          },
        },
        required: ['file_paths'],
      },
    },
    {
      name: 'create_upload_session',
      description: `Create a long-lived upload session that you can append files to over multiple upload_file / upload_files calls.

Use this when batch-uploading many files from a script or agent loop, when you want them grouped under one upload in the Mediagraph UI, or when you need to resume after a crash.

Returns the session guid plus aws_key/bucket (used internally for direct-to-S3 multipart). Call set_upload_done with the returned id when the batch is complete.`,
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Display name shown in the Mediagraph UI' },
          note: { type: 'string', description: 'Optional internal note' },
          default_rights_package_id: { type: 'number', description: 'Default rights package to apply to assets in this session' },
          contribution_id: { type: 'number', description: 'Route through a contribution destination' },
        },
        required: [],
      },
    },
    {
      name: 'set_upload_done',
      description: 'Finalize an upload session, marking it as complete. Triggers any post-upload hooks (notifications, contribution acceptance, etc.). Call this after the last upload_file/upload_files in a batch you opened with create_upload_session.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: ['number', 'string'], description: 'The numeric Upload id (NOT the guid) returned by create_upload_session' },
        },
        required: ['id'],
      },
    },
  ],

  handlers: {
    async upload_file(args, { client }) {
      const filePath = args.file_path as string | undefined;
      const fileDataB64 = args.file_data as string | undefined;
      const providedFilename = args.filename as string | undefined;
      const contributionId = args.contribution_id as number | undefined;
      const uploadGuid = args.upload_guid as string | undefined;

      if (uploadGuid && contributionId) {
        return errorResult('upload_guid and contribution_id are mutually exclusive — pick one.');
      }

      let filename: string;
      let fileSize: number;
      // For base64 mode, we have to materialize the bytes; that's fine for the
      // small payloads agents typically pass that way. For local files we
      // stream directly from disk so multi-GB files don't OOM the process.
      let inMemory: Buffer | null = null;
      let localPath: string | null = null;

      if (fileDataB64) {
        if (!providedFilename) {
          return errorResult('filename is required when using file_data');
        }
        inMemory = Buffer.from(fileDataB64, 'base64');
        filename = providedFilename;
        fileSize = inMemory.length;
      } else if (filePath) {
        let fileStats;
        try {
          fileStats = await stat(filePath);
        } catch {
          return errorResult(`File not found: ${filePath}`);
        }
        if (!fileStats.isFile()) return errorResult(`Not a file: ${filePath}`);
        localPath = filePath;
        filename = basename(filePath);
        fileSize = fileStats.size;
      } else {
        return errorResult('Either file_path or file_data (with filename) is required');
      }

      const contentType = getMimeType(filename);

      // Three session modes: reuse existing (upload_guid) | via contribution | one-shot.
      // When reusing, we must hydrate aws_key/bucket so multipart works.
      const ownsSession = !uploadGuid;
      const upload = uploadGuid
        ? await client.getUpload(uploadGuid)
        : contributionId
          ? await client.createUploadFromContribution(contributionId)
          : await client.createUpload();

      const preparedAsset = await client.prepareAssetUpload(upload.guid, {
        filename,
        file_size: fileSize,
        created_via: 'mcp',
      });

      if (localPath) {
        // Auto-routes to S3 multipart for large files when bucket info present.
        await client.uploadAssetFile(preparedAsset, upload, localPath, contentType);
      } else {
        await client.uploadToSignedUrl(preparedAsset.signed_upload_url, inMemory!, contentType);
      }

      // Mark as uploaded (triggers processing)
      const asset = await client.setAssetUploaded(preparedAsset.guid);

      // Only finalize the session if we created it. Otherwise the caller is
      // responsible for calling set_upload_done when their batch is done.
      if (ownsSession) {
        await client.setUploadDone(upload.id);
      }

      const sessionDescriptor = uploadGuid
        ? ` (appended to session ${uploadGuid})`
        : contributionId ? ` via contribution ${contributionId}` : '';

      return successResult({
        message: `Successfully uploaded ${filename}${sessionDescriptor}`,
        asset: {
          id: asset.id,
          guid: asset.guid,
          filename: asset.filename,
          file_size: asset.file_size,
          mime_type: asset.mime_type,
        },
        upload_guid: upload.guid,
        contribution_id: contributionId,
      });
    },

    async upload_files(args, { client }) {
      const filePaths = args.file_paths as string[];
      const contributionId = args.contribution_id as number | undefined;
      const uploadGuid = args.upload_guid as string | undefined;

      if (uploadGuid && contributionId) {
        return errorResult('upload_guid and contribution_id are mutually exclusive — pick one.');
      }
      if (!filePaths || filePaths.length === 0) {
        return errorResult('No files provided');
      }

      const ownsSession = !uploadGuid;
      const upload = uploadGuid
        ? await client.getUpload(uploadGuid)
        : contributionId
          ? await client.createUploadFromContribution(contributionId)
          : await client.createUpload();

      const results: Array<{ filename: string; success: boolean; asset_id?: number; asset_guid?: string; error?: string }> = [];

      for (const filePath of filePaths) {
        try {
          // Check file
          const fileStats = await stat(filePath);
          if (!fileStats.isFile()) {
            results.push({ filename: filePath, success: false, error: 'Not a file' });
            continue;
          }

          // Stream from disk so a single 10 GB file in the batch doesn't
          // stall the whole list with memory pressure.
          const filename = basename(filePath);
          const contentType = getMimeType(filename);

          const preparedAsset = await client.prepareAssetUpload(upload.guid, {
            filename,
            file_size: fileStats.size,
            created_via: 'mcp',
          });

          await client.uploadAssetFile(preparedAsset, upload, filePath, contentType);
          const asset = await client.setAssetUploaded(preparedAsset.guid);

          results.push({
            filename,
            success: true,
            asset_id: asset.id,
            asset_guid: asset.guid,
          });
        } catch (error) {
          results.push({
            filename: basename(filePath),
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Only finalize if we created the session.
      if (ownsSession) {
        await client.setUploadDone(upload.id);
      }

      const successCount = results.filter(r => r.success).length;
      const sessionDescriptor = uploadGuid
        ? ` (appended to session ${uploadGuid})`
        : contributionId ? ` via contribution ${contributionId}` : '';

      return successResult({
        message: `Uploaded ${successCount} of ${filePaths.length} files${sessionDescriptor}`,
        upload_guid: upload.guid,
        upload_id: upload.id,
        contribution_id: contributionId,
        results,
      });
    },

    async create_upload_session(args, { client }) {
      const contributionId = args.contribution_id as number | undefined;
      const data = {
        name: args.name as string | undefined,
        note: args.note as string | undefined,
        default_rights_package_id: args.default_rights_package_id as number | undefined,
      };
      const upload = contributionId
        ? await client.createUploadFromContribution(contributionId, data)
        : await client.createUpload(data);
      return successResult({
        id: upload.id,
        guid: upload.guid,
        aws_key: upload.aws_key,
        bucket: upload.bucket,
        contribution_id: contributionId,
        hint: 'Pass guid as `upload_guid` to upload_file/upload_files. Call set_upload_done with `id` when finished.',
      });
    },

    async set_upload_done(args, { client }) {
      // The server's PUT /set_done response renders before the done_at column
      // commits, so done_at is often null in the immediate response. Calling
      // it succeeded if the request didn't throw — that's the source of truth
      // we report to the caller. We still pass through whatever fields the
      // server gave us.
      const upload = await client.setUploadDone(args.id as number | string);
      return successResult({
        finalized: true,
        id: upload.id,
        guid: upload.guid,
        done_at: upload.done_at ?? null,
        assets_count: upload.assets_count,
        note: upload.done_at ? undefined : 'done_at may render null in this response due to a server-side timing quirk; the upload is finalized server-side. List_uploads will show the timestamp.',
      });
    },

  },
};
