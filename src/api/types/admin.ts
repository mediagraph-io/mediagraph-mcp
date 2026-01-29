/**
 * Admin types (user groups, invites, settings)
 */

import type { User } from './users.js';

export interface UserGroup {
  id: number;
  name: string;
  description?: string;
  members_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Invite {
  id: number;
  email: string;
  role: string;
  status?: 'pending' | 'accepted' | 'expired';
  expires_at?: string;
  created_at: string;
  accepted_at?: string;
  user?: User;
  invited_by?: User;
}

export interface FilterGroup {
  id: number;
  name: string;
  filters: Record<string, unknown>;
  shared?: boolean;
  position?: number;
  created_at?: string;
  updated_at?: string;
  user?: User;
}

export interface SearchQuery {
  id: number;
  name: string;
  query: string;
  filters?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  user?: User;
}

export interface CropPreset {
  id: number;
  name: string;
  width: number;
  height: number;
  position?: number;
  created_at?: string;
}

export interface PersonalAccessToken {
  id: number;
  name: string;
  token?: string;
  last_used_at?: string;
  expires_at?: string;
  created_at: string;
  scopes?: string[];
}
