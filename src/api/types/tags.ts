/**
 * Tag and taxonomy types
 */

export type TagSubType = 'keyword' | 'event' | 'person';

export interface Tag {
  id: number;
  name: string;
  slug: string;
  description?: string;
  link?: string;
  sub_type?: TagSubType;
  list?: 'searchable' | 'visible' | 'blocked';
  content?: string;
  taggings_count?: number;
  parent_id?: number;
  path_names?: string[];
  taxonomy_id?: number;
  taxonomy_tag_id?: number;
  taxonomy_path_names?: string[];

  // Event sub_type fields
  date_start?: string;
  date_end?: string;
  location_country?: string;
  location_country_code?: string;
  location_state?: string;
  location_city?: string;
  location_name?: string;
  featured_organization_name?: string;

  // External-system links
  cms_id?: string;
  collection_management_system?: string;
  gtin?: string;
  sku?: string;

  // Artwork enrichment
  artwork_creator?: string;
  artwork_creator_id?: number;
  artwork_date_created?: string;
  artwork_circa_date_created?: string;
  artwork_medium?: string;
  artwork_style_period?: string;
  artwork_source?: string;
  artwork_source_inventory_url?: string;
  artwork_inventory_number?: string;
  artwork_copyright_notice?: string;
  artwork_copyright_owner_id?: number;
  artwork_licensor_id?: number;
  artwork_licensor_name?: string;
  artwork_physical_description?: string;
  artwork_content_description?: string;
  artwork_contribution_description?: string;
  artwork_title?: string;

  // Synonym graph
  is_lead_tag?: boolean;
  lead_tag_id?: number;
  lead_tag_name?: string;
  set_synonym_at?: string;
  set_synonym_by_id?: number;
  related_tag_names?: string[];

  // Face / poster
  main_face_id?: string;
  poster_image_guid?: string;
  thumb_url?: string;

  created_at?: string;
  updated_at?: string;
}

export interface AutoTag {
  id: number;
  name: string;
  confidence?: number;
  source?: string;
  created_at?: string;
}

export interface Taxonomy {
  id: number;
  name: string;
  slug?: string;
  description?: string;
  tags_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface TaxonomyTag {
  id: number;
  name: string;
  slug?: string;
  taxonomy_id: number;
  parent_id?: number;
  path_names?: string[];
  children_count?: number;
  taggings_count?: number;
  created_at?: string;
}

export interface Tagging {
  id: number;
  tag_id: number;
  asset_id: number;
  created_at?: string;
  tag?: Tag;
}

export interface CreatorTag {
  id: number;
  name: string;
  slug?: string;
  taggings_count?: number;
  created_at?: string;
}

export interface FaceTagging {
  id: number;
  asset_id: number;
  person_name?: string;
  confidence?: number;
  bounding_box?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  created_at?: string;
}
