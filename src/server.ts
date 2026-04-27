/**
 * MCP server entry. Boots stdio transport and wires tool/resource handlers
 * to the shared Runtime (so CLI and MCP share auth state).
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Runtime } from './core/runtime.js';
import { handleTool, toolDefinitions } from './tools/index.js';
import { listResources, readResource, resourceTemplates, type ResourceContext } from './resources/index.js';

export async function runServer(): Promise<void> {
  const runtime = new Runtime();
  const resourceContext: ResourceContext = { client: runtime.client };

  const server = new Server(
    { name: 'mediagraph-mcp', version: '1.0.0' },
    { capabilities: { tools: {}, resources: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefinitions }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const toolContext = runtime.toolContext();

    if (name === 'reauthorize') {
      console.error(`[MCP] Tool call: ${name}`);
      const result = await handleTool(name, (args || {}) as Record<string, unknown>, toolContext);
      return { content: result.content, isError: result.isError };
    }

    let token = await runtime.getAccessToken();
    if (!token) {
      if (runtime.authIsInProgress()) {
        const start = Date.now();
        while (runtime.authIsInProgress() && Date.now() - start < 120000) {
          await new Promise(r => setTimeout(r, 500));
        }
        token = await runtime.getAccessToken();
      }
      if (!token) {
        const ok = await runtime.runAutoAuth();
        if (!ok) {
          return {
            content: [{ type: 'text' as const, text: 'Authorization is in progress. Please complete login in your browser, then retry.' }],
            isError: true,
          };
        }
        token = await runtime.getAccessToken();
        if (!token) {
          return {
            content: [{ type: 'text' as const, text: 'Authentication completed but failed to retrieve access token. Please try again.' }],
            isError: true,
          };
        }
      }
    }

    console.error(`[MCP] Tool call: ${name}`);
    console.error(`[MCP] Arguments: ${JSON.stringify(args, null, 2)}`);

    const result = await handleTool(name, (args || {}) as Record<string, unknown>, toolContext);
    if (result.isError) {
      console.error(`[MCP] Tool error: ${result.content[0]?.text}`);
    } else {
      console.error(`[MCP] Tool success: ${name}`);
    }
    return { content: result.content, isError: result.isError };
  });

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates }));

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const token = await runtime.getAccessToken();
    if (!token) return { resources: [] };
    const resources = await listResources(resourceContext);
    return { resources };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    if (uri.startsWith('ui://mediagraph/')) return handleAppResource(uri);

    let token = await runtime.getAccessToken();
    if (!token) {
      const ok = await runtime.runAutoAuth();
      if (!ok) {
        return {
          contents: [{ uri, mimeType: 'text/plain', text: 'Failed to authenticate with Mediagraph. Please try again.' }],
        };
      }
      token = await runtime.getAccessToken();
    }
    if (!token) {
      return {
        contents: [{ uri, mimeType: 'text/plain', text: 'Authentication completed but failed to retrieve access token.' }],
      };
    }

    const content = await readResource(uri, resourceContext);
    return { contents: [content] };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Mediagraph MCP server started');
}

function handleAppResource(uri: string) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const appPath = join(__dirname, 'app', 'index.html');

  if (!existsSync(appPath)) {
    return {
      contents: [{ uri, mimeType: 'text/plain', text: 'MCP App UI not found. Please rebuild the project with npm run build.' }],
    };
  }

  try {
    const html = readFileSync(appPath, 'utf-8');
    return {
      contents: [{
        uri,
        mimeType: 'text/html;profile=mcp-app',
        text: html,
        _meta: {
          ui: {
            csp: {
              resourceDomains: ['https://*.cloudfront.net'],
              connectDomains: ['https://api.mediagraph.io'],
            },
          },
        },
      }],
    };
  } catch (error) {
    console.error('[MCP] Failed to read app resource:', error);
    return { contents: [{ uri, mimeType: 'text/plain', text: 'Failed to load MCP App UI.' }] };
  }
}
