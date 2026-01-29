/**
 * Upload and contribution types
 */

import type { User } from './users.js';
import type { StorageFolder, Lightbox } from './groups.js';

export interface Upload {
  id: number;
  guid: string;
  status?: string;
  assets_count?: number;
  completed_count?: number;
  failed_count?: number;
  created_at: string;
  updated_at?: string;
  done_at?: string;
  user?: User;
}

export interface Contribution {
  id: number;
  guid?: string;
  name?: string;
  description?: string;
  status?: string;
  assets_count?: number;
  storage_folder_id?: number;
  lightbox_id?: number;
  created_at: string;
  updated_at?: string;
  user?: User;
  storage_folder?: StorageFolder;
  lightbox?: Lightbox;
}

export interface CanUploadResponse {
  can_upload: boolean;
  reason?: string;
  storage_used?: number;
  storage_limit?: number;
}
