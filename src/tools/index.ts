/**
 * MCP Tools for Mediagraph - Combined from all tool modules
 */

import type { MediagraphClient } from '../api/client.js';
import type { ToolContext, ToolResult, ToolDefinition, ToolModule } from './shared.js';
import { errorResult } from './shared.js';

// Import all tool modules
import { userTools } from './users.js';
import { assetTools } from './assets.js';
import { groupTools } from './groups.js';
import { tagTools } from './tags.js';
import { rightsTools } from './rights.js';
import { sharingTools } from './sharing.js';
import { jobTools } from './jobs.js';
import { metaTools } from './meta.js';
import { workflowTools } from './workflows.js';
import { socialTools } from './social.js';
import { downloadTools } from './downloads.js';
import { uploadTools } from './uploads.js';
import { webhookTools } from './webhooks.js';
import { adminTools } from './admin.js';

// Re-export types
export type { ToolContext, ToolResult, ToolDefinition, ToolModule };
export { successResult, errorResult } from './shared.js';

// Combine all tool modules
const allToolModules: ToolModule[] = [
  userTools,
  assetTools,
  groupTools,
  tagTools,
  rightsTools,
  sharingTools,
  jobTools,
  metaTools,
  workflowTools,
  socialTools,
  downloadTools,
  uploadTools,
  webhookTools,
  adminTools,
];

// Export combined definitions
export const toolDefinitions: ToolDefinition[] = allToolModules.flatMap(m => m.definitions);

// Build combined handlers map
const allHandlers: Record<string, (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>> = {};
for (const module of allToolModules) {
  Object.assign(allHandlers, module.handlers);
}

// Tool handler function
export async function handleTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const handler = allHandlers[name];
  if (!handler) {
    return errorResult(`Unknown tool: ${name}`);
  }

  try {
    return await handler(args, context);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return errorResult(message);
  }
}

// Re-export individual modules for direct access
export {
  userTools,
  assetTools,
  groupTools,
  tagTools,
  rightsTools,
  sharingTools,
  jobTools,
  metaTools,
  workflowTools,
  socialTools,
  downloadTools,
  uploadTools,
  webhookTools,
  adminTools,
};
