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

export interface AdminFolderDuplicationRequest {
  source: number;
  destination: number;
  execute: boolean;
  idempotency_key?: string;
}

export interface AdminFolderDuplicationResponse {
  preview: boolean;
  guid?: string;
  organization_id?: number;
  aasm_state?: 'pending' | 'processing' | 'errored' | 'processed' | 'failed' | 'canceled';
  progress?: number;
  total_assets?: number;
  processed_assets?: number;
  error?: string | null;
  replayed?: boolean;
  conflicts?: string[];
  organization?: { id: number; slug: string; title: string };
  source?: number | { id: number; name: string; asset_count: number; folder_count: number };
  destination?: number | { id: number; name: string; path: string };
  execution: { mode: 'dedicated'; queue: string; status: string; worker_ready?: boolean };
}
