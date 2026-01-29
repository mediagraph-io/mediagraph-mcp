/**
 * Upload tools
 */

import { readFile, stat } from 'node:fs/promises';
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
      description: `Upload a file from the local filesystem to Mediagraph.
This creates a new asset in the user's Mediagraph library.
Supports images, videos, audio, documents, and other media files.
The file will be processed and thumbnails/previews generated automatically.`,
      inputSchema: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Absolute path to the file on the local filesystem',
          },
          storage_folder_id: {
            type: 'number',
            description: 'Optional: ID of the storage folder to upload into',
          },
        },
        required: ['file_path'],
      },
    },
    {
      name: 'upload_files',
      description: `Upload multiple files from the local filesystem to Mediagraph.
Creates new assets for each file in the user's Mediagraph library.
All files are uploaded in a single upload session.`,
      inputSchema: {
        type: 'object',
        properties: {
          file_paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of absolute paths to files on the local filesystem',
          },
          storage_folder_id: {
            type: 'number',
            description: 'Optional: ID of the storage folder to upload into',
          },
        },
        required: ['file_paths'],
      },
    },
  ],

  handlers: {
    async upload_file(args, { client }) {
      const filePath = args.file_path as string;

      // Check if file exists and get stats
      let fileStats;
      try {
        fileStats = await stat(filePath);
      } catch {
        return errorResult(`File not found: ${filePath}`);
      }

      if (!fileStats.isFile()) {
        return errorResult(`Not a file: ${filePath}`);
      }

      // Read file
      const fileData = await readFile(filePath);
      const filename = basename(filePath);
      const contentType = getMimeType(filename);

      // Create upload session
      const upload = await client.createUpload();

      // Prepare asset upload (get signed URL)
      const preparedAsset = await client.prepareAssetUpload(upload.guid, {
        filename,
        file_size: fileStats.size,
        created_via: 'mcp',
      });

      // Upload to S3
      await client.uploadToSignedUrl(preparedAsset.signed_upload_url, fileData, contentType);

      // Mark as uploaded (triggers processing)
      const asset = await client.setAssetUploaded(preparedAsset.guid);

      // Mark upload session as done
      await client.setUploadDone(upload.id);

      return successResult({
        message: `Successfully uploaded ${filename}`,
        asset: {
          id: asset.id,
          guid: asset.guid,
          filename: asset.filename,
          file_size: asset.file_size,
          content_type: asset.content_type,
        },
        upload_guid: upload.guid,
      });
    },

    async upload_files(args, { client }) {
      const filePaths = args.file_paths as string[];

      if (!filePaths || filePaths.length === 0) {
        return errorResult('No files provided');
      }

      // Create single upload session for all files
      const upload = await client.createUpload();
      const results: Array<{ filename: string; success: boolean; asset_id?: number; asset_guid?: string; error?: string }> = [];

      for (const filePath of filePaths) {
        try {
          // Check file
          const fileStats = await stat(filePath);
          if (!fileStats.isFile()) {
            results.push({ filename: filePath, success: false, error: 'Not a file' });
            continue;
          }

          // Read and upload
          const fileData = await readFile(filePath);
          const filename = basename(filePath);
          const contentType = getMimeType(filename);

          const preparedAsset = await client.prepareAssetUpload(upload.guid, {
            filename,
            file_size: fileStats.size,
            created_via: 'mcp',
          });

          await client.uploadToSignedUrl(preparedAsset.signed_upload_url, fileData, contentType);
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

      // Mark upload session as done
      await client.setUploadDone(upload.id);

      const successCount = results.filter(r => r.success).length;

      return successResult({
        message: `Uploaded ${successCount} of ${filePaths.length} files`,
        upload_guid: upload.guid,
        results,
      });
    },
  },
};
