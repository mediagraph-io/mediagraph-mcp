/**
 * User and organization types
 */

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  name?: string;
  avatar_url?: string;
  initials?: string;
  username?: string;
  title?: string;
  timezone?: string;
  guest?: boolean;
  guest_email?: string;
  lang?: string;
  created_at?: string;
  default_username?: string;
  notify_new_membership_requests?: boolean;
}

export interface Organization {
  id: number;
  name?: string;
  title?: string;
  slug: string;
  logo_url?: string;
  subdomain?: string;
  created_at?: string;
  updated_at?: string;
  features?: Record<string, boolean>;
  settings?: Record<string, unknown>;
}

export interface Membership {
  id: number;
  user_id: number;
  organization_id: number;
  role: 'admin' | 'global_content' | 'global_library' | 'global_tagger' | 'general' | 'restricted';
  status?: string;
  created_at?: string;
  updated_at?: string;
  user?: User;
}

export interface WhoamiResponse {
  user: User;
  organization: Organization;
  membership: Membership;
}
