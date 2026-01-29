/**
 * Custom metadata field types
 */

export interface CustomMetaField {
  id: number;
  name: string;
  slug?: string;
  field_type: string;
  description?: string;
  required?: boolean;
  searchable?: boolean;
  filterable?: boolean;
  show_in_list?: boolean;
  show_in_detail?: boolean;
  enable_ai?: boolean;
  ai_prompt?: string;
  options?: string[];
  default_value?: unknown;
  position?: number;
  created_at?: string;
  updated_at?: string;
}

export interface CustomMetaValue {
  id: number;
  custom_meta_field_id: number;
  value: unknown;
  display_value?: string;
}
