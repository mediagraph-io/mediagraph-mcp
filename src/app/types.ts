/**
 * Shared types for the Mediagraph MCP App
 * These mirror the API types for use in the React app
 */

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
  duration?: number;
  aspect?: string;

  // URLs
  thumb_url?: string;
  grid_url?: string;
  small_url?: string;
  preview_url?: string;
  full_url?: string;
  original_url?: string;
  permalink_url?: string;
  download_url?: string;

  // Metadata
  title?: string;
  description?: string;
  headline?: string;
  alt_text?: string;
  caption?: string;
  credit?: string;
  copyright?: string;
  notes?: string;
  rating?: number;

  // Location
  city?: string;
  state?: string;
  country?: string;

  // Tags
  tags?: string[];

  // Timestamps
  created_at: string;
  updated_at: string;
  captured_at?: string;

  // Renditions (when include_renditions=true)
  renditions?: Rendition[];
  download_sizes?: string[];

  // Metadata (when include_meta=true)
  meta?: Record<string, unknown>;
}

export interface SearchResponse {
  assets: Asset[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  organization_slug?: string;
  aggs?: Record<string, unknown>;
}

export interface Lightbox {
  id: number;
  name: string;
  description?: string;
  parent_id?: number;
  assets_count?: number;
}
