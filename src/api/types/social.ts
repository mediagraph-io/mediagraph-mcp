/**
 * Social interaction types (comments, notifications)
 */

import type { User } from './users.js';

export interface Comment {
  id: number;
  body: string;
  commentable_type: string;
  commentable_id: number;
  user_id: number;
  created_at: string;
  updated_at?: string;
  user?: User;
  replies?: Comment[];
  parent_id?: number;
}

export interface Notification {
  id: number;
  notification_type: string;
  title?: string;
  body?: string;
  read?: boolean;
  read_at?: string;
  created_at: string;
  data?: Record<string, unknown>;
}

export interface NotificationCount {
  unread: number;
  total: number;
}
