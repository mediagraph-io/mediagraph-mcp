/**
 * Rights and permission types
 */

import type { User } from './users.js';

export interface RightsPackage {
  id: number;
  name: string;
  rights_class: 'owned' | 'unlimited' | 'some' | 'library' | 'none';
  rights_class_name?: string;
  rights_class_description?: string;
  description?: string;
  summary?: string;
  other_party_name?: string;
  expires?: boolean;
  expires_at?: string;
  visible_assets_count?: number;
  meta_field_text?: string;
  enabled?: boolean;
  enable_long_form?: boolean;
  long_form_url?: string;
  long_form?: string;
  long_form_type?: string;
  replace_meta_field?: boolean;
  replace_empty_meta_field?: boolean;
  reusable?: boolean;
  allow_contract_upload?: boolean;
  allow_model_release_upload?: boolean;
  watermark?: boolean;
  personalize?: boolean;
  prevent_download?: boolean;
  block_level?: number;
  default?: boolean;
  external_contract_id?: string;
  external_contract_location?: string;
  created_at?: string;
  user?: User;
  editable?: boolean;
}

export interface Permission {
  id: number;
  name: string;
  slug?: string;
  permission_type: string;
  target_type?: string;
  target_id?: number;
  created_at?: string;
}
