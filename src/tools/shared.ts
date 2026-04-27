/**
 * Shared types and helpers for MCP tools
 */

import type { MediagraphClient } from '../api/client.js';

export interface ReauthorizeResult {
  success: boolean;
  organizationName?: string;
  userEmail?: string;
}

export interface ToolContext {
  client: MediagraphClient;
  organizationSlug?: string;
  reauthorize?: () => Promise<ReauthorizeResult>;
}

export interface ToolResultContent {
  type: 'text';
  text: string;
}

export interface ToolResult {
  content: ToolResultContent[];
  isError?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required: string[];
  };
  // MCP Apps metadata for tools with UI
  _meta?: {
    ui?: {
      resourceUri: string;
      visibility?: ('model' | 'app')[];
    };
    /**
     * If present, the CLI's `--wait` flag polls another tool until the job
     * reaches a terminal state.
     *   pollTool      — name of a tool that fetches the job by id
     *   idField       — field on the *result* of THIS tool that contains the id (default: 'id')
     *   statusField   — field on the *poll response* that contains the state
     *   terminal      — set of states that mean "done" (success or failure)
     */
    wait?: {
      pollTool: string;
      idField?: string;
      statusField: string;
      terminal: string[];
    };
    [key: string]: unknown;
  };
}

export function successResult(data: unknown): ToolResult {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function errorResult(message: string): ToolResult {
  return {
    content: [
      {
        type: 'text' as const,
        text: message,
      },
    ],
    isError: true,
  };
}

// Common input schema types
export const idParam = {
  type: ['number', 'string'],
  description: 'ID of the resource',
};

export const paginationParams = {
  page: { type: 'number', description: 'Page number' },
  per_page: { type: 'number', description: 'Results per page (max 100)' },
};

export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolContext,
) => Promise<ToolResult>;

export interface ToolModule {
  definitions: ToolDefinition[];
  handlers: Record<string, ToolHandler>;
}
