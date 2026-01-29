/**
 * Asset group types (Collections, Lightboxes, Storage Folders)
 */

import type { User } from './users.js';
import type { WorkflowStep } from './workflows.js';

interface BaseAssetGroup {
  id: number;
  name: string;
  slug?: string;
  description?: string;
  type: string;
  sub_type?: string;
  path_names: string[];
  path_slugs: string[];
  created_at: string;
  updated_at?: string;
  has_children: boolean;
  parent_id?: number;
  ancestor_ids: number[];
  visible_assets_count?: number;
  thumb_url?: string;
  organizer?: boolean;
  asset_group_id?: number;
  has_workflow_steps?: boolean;
  sort_order?: string;
  view_settings?: unknown;
  children_sort_order?: string;
  user?: User;
  editable?: boolean;
  workflow_steps?: WorkflowStep[];
}

export interface Collection extends BaseAssetGroup {
  type: 'Collection';
  project_id?: number;
  commentable?: boolean;
  comments_count?: number;
  share_links_count?: number;
  sortable?: boolean;
}

export interface Lightbox extends BaseAssetGroup {
  type: 'Lightbox';
  project_id?: number;
  commentable?: boolean;
  comments_count?: number;
  enable_contribution?: boolean;
  share_links_count?: number;
  sortable?: boolean;
  folder_root_id?: number;
}

export interface StorageFolder extends BaseAssetGroup {
  type: 'StorageFolder';
  contribution_id?: number;
  enable_contribution?: boolean;
  box_folder_id?: string;
  box_folder_name?: string;
  dropbox_folder_id?: string;
  dropbox_folder_name?: string;
  google_drive_folder_id?: string;
  google_drive_folder_name?: string;
  frame_project_id?: string;
  frame_project_name?: string;
  frame_team_id?: string;
  frame_team_name?: string;
  lightroom_publish_service_id?: string;
  last_lightroom_sync_at?: string;
  publish_user_id?: number;
  publish_user?: User;
  publish_type?: string;
  created_via?: string;
  created_via_id?: string;
  reindexing_at?: string;
}

export interface AssetGroupTree {
  id: number;
  name: string;
  slug: string;
  has_children: boolean;
  children?: AssetGroupTree[];
  visible_assets_count?: number;
}
