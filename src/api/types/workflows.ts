/**
 * Workflow types
 */

import type { User } from './users.js';

export interface Workflow {
  id: number;
  name: string;
  description?: string;
  enabled?: boolean;
  created_at?: string;
  updated_at?: string;
  steps?: WorkflowStep[];
}

export interface WorkflowStep {
  id: number;
  workflow_id?: number;
  name: string;
  description?: string;
  step_type?: string;
  position?: number;
  required?: boolean;
  auto_approve?: boolean;
  created_at?: string;
  asset_group_id?: number;
  approved?: boolean;
  approved_at?: string;
  approved_by?: User;
}
