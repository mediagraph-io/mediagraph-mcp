/**
 * Sharing and access types
 */

import type { User } from './users.js';
import type { UserGroup } from './admin.js';

export interface ShareLink {
  id: number;
  guid: string;
  url?: string;
  name?: string;
  password_protected?: boolean;
  expires_at?: string;
  created_at: string;
  updated_at?: string;
  assets_count?: number;
  views_count?: number;
  downloads_count?: number;
  share_type?: string;
  asset_group_id?: number;
  user?: User;
  editable?: boolean;
}

export interface Share {
  id: number;
  share_link_id: number;
  asset_id?: number;
  collection_id?: number;
  lightbox_id?: number;
  created_at?: string;
}

export interface CollectionShare {
  id: number;
  collection_id: number;
  user_id?: number;
  user_group_id?: number;
  permission_level?: string;
  created_at?: string;
  user?: User;
  user_group?: UserGroup;
}

export interface AccessRequest {
  id: number;
  name: string;
  aasm_state: 'pending' | 'submitted' | 'finalized';
  is_grant?: boolean;
  sub_type?: string;
  description?: string;
  requester_name?: string;
  requester_email?: string;
  submitted_at?: string;
  finalized_at?: string;
  assets_count?: number;
  created_at: string;
  updated_at?: string;
  path_names?: string[];
  path_slugs?: string[];
  has_children?: boolean;
  parent_id?: number;
  ancestor_ids?: number[];
}
