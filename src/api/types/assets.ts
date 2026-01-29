/**
 * Asset types
 */

import type { User } from './users.js';
import type { Collection, Lightbox, StorageFolder } from './groups.js';
import type { RightsPackage } from './rights.js';
import type { CustomMetaValue } from './meta.js';

export interface Rendition {
  name: string;
  display_name?: string;
  ext: string;
  width?: number;
  height?: number;
  file_size?: number;
  url?: string;
  watermarked?: boolean;
}

export interface Vote {
  value: number;
  created_at: string;
  updated_at: string;
}

export interface Asset {
  id: number;
  guid: string;
  short_guid?: string;
  filename: string;
  file_size?: number;
  file_type?: string;
  type?: string;
  ext?: string;
  mime_type?: string;
  width?: number;
  height?: number;
  ppi?: number;
  duration?: number;
  aspect?: string;
  vector?: boolean;
  has_alpha?: boolean;

  // URLs
  thumb_url?: string;
  grid_url?: string;
  small_url?: string;
  preview_url?: string;
  full_url?: string;
  permalink_url?: string;
  download_url?: string;
  pdf_url?: boolean;
  vtt_url?: string;

  // Metadata
  title?: string;
  description?: string;
  headline?: string;
  alt_text?: string;
  caption?: string;
  credit?: string;
  credit_line?: string;
  copyright?: string;
  event?: string;
  notes?: string;
  rating?: number;

  // Location
  city?: string;
  state?: string;
  country?: string;
  country_code?: string;
  sublocation?: string;
  latitude?: number;
  longitude?: number;

  // IPTC fields
  usage_terms?: string;
  instructions?: string;
  iptc_source?: string;
  iptc_rights?: string;
  web_statement?: string;
  copyright_owner?: string;
  licensor?: string;
  model_release_status?: string;
  property_release_status?: string;
  authors_position?: string;
  description_writer?: string;
  intellectual_genre?: string;
  scene?: string;
  subject_code?: string;
  iptc_event_id?: string;
  iptc_job_id?: string;
  organization_in_image_name?: string;
  extended_description?: string;
  iptc_dig_image_guid?: string;
  image_supplier?: string;
  iptc_image_supplier_image_id?: string;
  addl_model_info?: string;
  iptc_model_release_id?: string;
  model_age?: string;
  minor_model_age_disclosure?: string;
  iptc_property_release_id?: string;
  product_in_image?: string;
  artwork_or_object?: string;

  // Status flags
  expired?: boolean;
  expires_at?: string;
  released?: boolean;
  release?: boolean;
  contract?: boolean;
  has_people?: boolean;
  nsfw_detected?: boolean;
  submitted?: boolean;
  downloadable?: boolean;
  original_downloadable?: boolean;
  editable?: boolean;
  manageable?: boolean;
  rights_editable?: boolean;
  rights_manageable?: boolean;
  taggable?: boolean;
  description_editable?: boolean;
  downloadable_previews?: boolean;

  // Transcription
  has_transcript?: boolean;
  transcript?: string;
  transcript_version?: string;
  transcription_job_status?: string;
  transcript_output_json_url?: string;
  content_preview?: string;
  has_ocr_content?: boolean;

  // AI/Analysis
  auto_tags_count?: number;
  auto_tags_retrieved_at?: string;
  bedrock_retrieved_at?: string;
  bedrock_prompt?: string;
  bedrock_data?: unknown;
  textract_retrieved_at?: string;
  face_indexing_state?: string;
  faces_searched_at?: string;
  rekognition_faces_requested_at?: string;
  rekognition_faces_retrieved_at?: string;

  // Processing
  aasm_state?: string;
  processing_started_at?: string;
  processing_finished_at?: string;
  processing_error?: string;
  processing_progress?: number;
  time_to_process?: number;
  upload_started_at?: string;
  upload_finished_at?: string;

  // Versioning
  data_version_number?: number;
  data_versions_count?: number;
  preview_type?: string;

  // Rights
  rights_package_id?: number;
  rights_status?: string;
  rights_status_name?: string;
  rights_status_description?: string;
  block_level?: number;
  rights_package_block_level?: number;
  max_block_level?: number;

  // Organization/Storage
  organization_id?: number;
  storage_folder_id?: number;
  storage_folder_path?: string;
  path?: string;
  catalogue_number?: string;
  upload_id?: number;
  user_id?: number;
  featured_organization_name?: string;

  // Timestamps
  created_at: string;
  updated_at: string;
  captured_at?: string;
  captured_at_truncation?: string;
  captured_at_offset?: string;
  submitted_at?: string;
  trashed_at?: string;
  last_external_sync_at?: string;
  optimization_requested_at?: string;
  optimization_completed_at?: string;
  checked_out_at?: string;
  checked_in_at?: string;

  // Checkout
  checkout_integration?: string;
  frame_asset_id?: string;
  frame_status?: string;

  // Stats
  downloads_count?: number;
  views_count?: number;
  up_votes_count?: number;
  down_votes_count?: number;

  // Relations
  tags?: string[];
  renditions?: Rendition[];
  download_sizes?: string[];
  custom_meta_values?: CustomMetaValue[];
  meta?: Record<string, unknown>;
  creator?: string[];
  creator_tag?: unknown;
  creator_contact_info?: unknown;
  user?: User;
  storage_folder?: StorageFolder;
  collections?: Collection[];
  lightboxes?: Lightbox[];
  available_rights_packages?: RightsPackage[];
  vote?: Vote;
  meta_structs?: unknown[];
  links?: unknown[];
  trashed_by?: User;

  // Creation tracking
  created_via?: string;
  created_via_id?: string;
  s3_upload_id?: string;
  s3_upload_key?: string;
  md5?: string;
  has_published_images?: boolean;
  has_document_url?: boolean;
}

export interface AssetDataVersion {
  id: number;
  number: number;
  asset_id: number;
  filename?: string;
  file_size?: number;
  width?: number;
  height?: number;
  created_at: string;
  current?: boolean;
  thumb_url?: string;
  user?: User;
}

export interface SearchParams {
  q?: string;
  page?: number;
  per_page?: number;
  ids?: number[];
  guids?: string[];
  upload_id?: number;
  upload_guid?: string;
  storage_folder_id?: number;
  omit_child_storage_folders?: boolean;
  collection_id?: number;
  omit_child_collections?: boolean;
  lightbox_id?: number;
  omit_child_lightboxes?: boolean;
  lightbox_folder_id?: number;
  omit_child_lightbox_folders?: boolean;
  tags?: string[];
  hide_tags?: string[];
  taxonomy?: boolean;
  hide_taxonomy?: boolean;
  taxonomy_filter_mode?: 'union' | 'intersection';
  exts?: string[];
  rating?: number[];
  rights?: number[];
  rights_code?: string[];
  aspect?: 'square' | 'portrait' | 'landscape' | 'panorama';
  has_people?: 'yes' | 'no' | 'untagged';
  has_alt_text?: 'yes' | 'no';
  file_size_range?: '<1' | '1-10' | '10-50' | '50-100' | '>100';
  gps?: boolean;
  bounds?: string;
  captured_at?: string[];
  missing_captured_at?: boolean;
  created_at?: string[];
  updated_at?: string[];
  snapshot_timestamp?: number;
  proximity_field?: 'transcript' | 'description' | 'content';
  proximity_word_1?: string;
  proximity_word_2?: string;
  proximity_max_gaps?: number;
  user_ids?: number[];
  creator_ids?: number[];
  include_totals?: boolean;
  as_filters?: boolean;
  include_renditions?: boolean;
  include_meta?: boolean;
  [key: string]: unknown;
}

export interface SearchResponse {
  assets: Asset[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  aggs?: Record<string, unknown>;
}

export interface AssetCountsResponse {
  total: number;
  by_type?: Record<string, number>;
  by_state?: Record<string, number>;
}
