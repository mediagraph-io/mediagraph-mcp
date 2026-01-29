/**
 * Tag and taxonomy types
 */

export interface Tag {
  id: number;
  name: string;
  slug: string;
  taggings_count?: number;
  parent_id?: number;
  path_names?: string[];
  taxonomy_id?: number;
  taxonomy_tag_id?: number;
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
