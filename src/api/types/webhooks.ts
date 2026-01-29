/**
 * Webhook types
 */

export interface Webhook {
  id: number;
  name: string;
  url: string;
  events: string[];
  enabled?: boolean;
  secret?: string;
  created_at?: string;
  updated_at?: string;
  last_triggered_at?: string;
  failure_count?: number;
}

export interface WebhookLog {
  id: number;
  webhook_id: number;
  event: string;
  request_body?: string;
  response_status?: number;
  response_body?: string;
  success?: boolean;
  created_at: string;
}
