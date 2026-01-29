/**
 * Background job types
 */

import type { User } from './users.js';

export interface BulkJob {
  id: number;
  guid: string;
  job_type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  total_count: number;
  processed_count: number;
  success_count: number;
  error_count: number;
  created_at: string;
  updated_at?: string;
  started_at?: string;
  completed_at?: string;
  user?: User;
  params?: Record<string, unknown>;
  errors?: string[];
}

export interface BulkJobQueuePosition {
  position: number;
  estimated_wait?: number;
}

export interface Ingestion {
  id: number;
  name?: string;
  status?: string;
  source_type?: string;
  assets_count?: number;
  created_at: string;
  completed_at?: string;
}

export interface MetaImport {
  id: number;
  name?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  filename?: string;
  rows_count?: number;
  processed_count?: number;
  success_count?: number;
  error_count?: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  mapping?: Record<string, string>;
  errors?: string[];
}
