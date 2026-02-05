#!/usr/bin/env node
/**
 * Mediagraph MCP Server
 *
 * An MCP server that provides AI assistants with access to the Mediagraph API
 * for digital asset management operations.
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
import { exec } from 'node:child_process';
import { platform } from 'node:os';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { OAuthHandler, type TokenData } from './auth/oauth.js';
import { TokenStore, type StoredTokens } from './auth/token-store.js';
import { MediagraphClient } from './api/client.js';
import { toolDefinitions, handleTool, type ToolContext } from './tools/index.js';
import { resourceTemplates, readResource, listResources, type ResourceContext } from './resources/index.js';

// Default OAuth client ID for the official Mediagraph MCP Server
const DEFAULT_CLIENT_ID = '7Y8rlAetr9IK2N91X4wCvVlo2hQLX6nJvFY1N8CY0GI';

// Configuration from environment variables (with sensible defaults)
const config = {
  clientId: process.env.MEDIAGRAPH_CLIENT_ID || DEFAULT_CLIENT_ID,
  clientSecret: process.env.MEDIAGRAPH_CLIENT_SECRET,
  apiUrl: process.env.MEDIAGRAPH_API_URL || 'https://api.mediagraph.io',
  oauthUrl: process.env.MEDIAGRAPH_OAUTH_URL || 'https://mediagraph.io',
  redirectPort: parseInt(process.env.MEDIAGRAPH_REDIRECT_PORT || '52584', 10),
};

// Initialize components
const tokenStore = new TokenStore();
const oauthHandler = new OAuthHandler({
  clientId: config.clientId,
  clientSecret: config.clientSecret,
  oauthUrl: config.oauthUrl,
  redirectPort: config.redirectPort,
});

// Token management
let currentTokens: TokenData | null = null;
let isAuthInProgress = false;

/**
 * Open a URL in the default browser (cross-platform)
 */
function openBrowser(url: string): void {
  const command = platform() === 'darwin'
    ? `open "${url}"`
    : platform() === 'win32'
      ? `start "" "${url}"`
      : `xdg-open "${url}"`;

  exec(command, (error) => {
    if (error) {
      console.error('Failed to open browser:', error);
    }
  });
}

/**
 * Run the full OAuth flow automatically
 * Returns true if successful, false otherwise
 */
async function runAutoAuth(): Promise<boolean> {
  if (isAuthInProgress) {
    console.error('[MCP] OAuth already in progress, waiting for completion...');
    // Wait for existing auth to complete (max 2 minutes)
    const waitStart = Date.now();
    const maxWait = 120000;
    while (isAuthInProgress && Date.now() - waitStart < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (isAuthInProgress) {
      console.error('[MCP] Timed out waiting for existing OAuth flow');
      return false;
    }
    return currentTokens !== null;
  }

  isAuthInProgress = true;
  console.error('[MCP] Starting OAuth flow...');

  try {
    // Generate the auth URL (this sets up PKCE internally)
    const authUrl = oauthHandler.getAuthorizationUrl();

    // Start the callback server FIRST and wait for it to be ready
    await oauthHandler.startCallbackServer();
    console.error('[MCP] Callback server ready, opening browser...');

    // NOW open the browser (server is ready to receive callback)
    openBrowser(authUrl);

    // Wait for the OAuth callback
    console.error('[MCP] Waiting for OAuth callback...');
    const { code } = await oauthHandler.waitForCallback();
    console.error('[MCP] OAuth callback received, exchanging code...');

    // Exchange code for tokens
    const tokens = await oauthHandler.exchangeCode(code);
    currentTokens = tokens;
    console.error('[MCP] Token exchange successful');

    // Save tokens immediately (even before whoami, in case that fails)
    let storedData: StoredTokens = { tokens };
    tokenStore.save(storedData);

    // Try to get user info to enrich the stored data
    try {
      const whoami = await client.whoami();
      if (whoami?.organization?.id) {
        const org = whoami.organization;
        storedData = {
          tokens,
          organizationId: org.id,
          organizationName: org.title || org.name,
          organizationSlug: org.slug,
          userId: whoami.user?.id,
          userEmail: whoami.user?.email,
        };
        tokenStore.save(storedData);
        console.error(`[MCP] Authenticated as ${whoami.user?.email} in ${org.title || org.name}`);
      } else {
        console.error('[MCP] Authenticated (whoami returned incomplete data)');
      }
    } catch (whoamiError) {
      console.error('[MCP] Authenticated (whoami failed, tokens saved):', whoamiError);
    }

    return true;
  } catch (error) {
    console.error('[MCP] Auto-auth failed:', error);
    oauthHandler.stopCallbackServer();
    return false;
  } finally {
    isAuthInProgress = false;
  }
}

async function getAccessToken(): Promise<string | null> {
  // First check if we have valid tokens in memory
  if (currentTokens && Date.now() < currentTokens.expires_at - 300000) {
    return currentTokens.access_token;
  }

  // Try to load from store
  const stored = tokenStore.load();
  if (stored?.tokens) {
    // Check if token is still valid
    if (Date.now() < stored.tokens.expires_at - 300000) {
      currentTokens = stored.tokens;
      return currentTokens.access_token;
    }

    // Try to refresh
    if (stored.tokens.refresh_token) {
      try {
        const newTokens = await oauthHandler.refreshToken(stored.tokens.refresh_token);
        currentTokens = newTokens;
        tokenStore.save({
          ...stored,
          tokens: newTokens,
        });
        return newTokens.access_token;
      } catch (error) {
        console.error('Failed to refresh token:', error);
      }
    }
  }

  return null;
}

// Initialize API client
const client = new MediagraphClient({
  apiUrl: config.apiUrl,
  getAccessToken,
});

// Create contexts for tools and resources
// Note: organizationSlug is populated dynamically before each tool call
const toolContext: ToolContext = {
  client,
  reauthorize: async () => {
    console.error('[MCP] Reauthorize requested, clearing tokens and starting new OAuth flow...');
    currentTokens = null;
    tokenStore.clear();
    const success = await runAutoAuth();
    if (!success) return { success: false };
    const stored = tokenStore.load();
    return {
      success: true,
      organizationName: stored?.organizationName,
      userEmail: stored?.userEmail,
    };
  },
};
const resourceContext: ResourceContext = { client };

/**
 * Get organization slug from stored tokens
 */
function getOrganizationSlug(): string | undefined {
  const stored = tokenStore.load();
  return stored?.organizationSlug;
}

// Create MCP server
const server = new Server(
  {
    name: 'mediagraph-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  },
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: toolDefinitions,
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Reauthorize handles its own auth flow, skip the normal check
  if (name === 'reauthorize') {
    console.error(`[MCP] Tool call: ${name}`);
    const result = await handleTool(name, (args || {}) as Record<string, unknown>, toolContext);
    return { content: result.content, isError: result.isError };
  }

  // Check authentication - auto-trigger OAuth if needed
  let token = await getAccessToken();
  if (!token) {
    // If OAuth is already in progress, wait for it (with a reasonable timeout)
    if (isAuthInProgress) {
      console.error('[MCP] OAuth in progress, waiting...');
      const waitStart = Date.now();
      const maxWait = 120000; // 2 minutes max wait
      while (isAuthInProgress && Date.now() - waitStart < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      token = await getAccessToken();
      if (token) {
        console.error('[MCP] OAuth completed, proceeding with request');
      }
    }

    // Still no token? Start OAuth flow
    if (!token) {
      // Automatically start OAuth flow
      const authSuccess = await runAutoAuth();
      if (!authSuccess) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Authorization is in progress. Please complete the login in your browser, then try this request again.',
            },
          ],
          isError: true,
        };
      }
      token = await getAccessToken();
      if (!token) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Authentication completed but failed to retrieve access token. Please try again.',
            },
          ],
          isError: true,
        };
      }
    }
  }

  // Log tool call for debugging
  console.error(`[MCP] Tool call: ${name}`);
  console.error(`[MCP] Arguments: ${JSON.stringify(args, null, 2)}`);

  // Update tool context with organization slug for this request
  toolContext.organizationSlug = getOrganizationSlug();

  const result = await handleTool(name, (args || {}) as Record<string, unknown>, toolContext);

  // Log result status
  if (result.isError) {
    console.error(`[MCP] Tool error: ${result.content[0]?.text}`);
  } else {
    console.error(`[MCP] Tool success: ${name}`);
  }

  return {
    content: result.content,
    isError: result.isError,
  };
});

// Handle resource template listing
server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
  return {
    resourceTemplates,
  };
});

// Handle resource listing
// NOTE: Don't auto-auth here - just return empty if not authenticated
// Auth will happen when user actually calls a tool
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const token = await getAccessToken();
  if (!token) {
    return { resources: [] };
  }

  const resources = await listResources(resourceContext);
  return { resources };
});

// Handle resource reading
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  // Handle MCP App UI resources
  if (uri.startsWith('ui://mediagraph/')) {
    return handleAppResource(uri);
  }

  let token = await getAccessToken();
  if (!token) {
    const authSuccess = await runAutoAuth();
    if (!authSuccess) {
      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: 'Failed to authenticate with Mediagraph. Please try again.',
          },
        ],
      };
    }
    token = await getAccessToken();
  }
  if (!token) {
    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: 'Authentication completed but failed to retrieve access token.',
        },
      ],
    };
  }

  const content = await readResource(uri, resourceContext);
  return {
    contents: [content],
  };
});

/**
 * Handle MCP App UI resource requests
 * Serves the bundled React app for visual tools
 */
function handleAppResource(uri: string) {
  // Get the directory where this script is located
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  // The bundled app is in dist/app/index.html
  const appPath = join(__dirname, 'app', 'index.html');

  if (!existsSync(appPath)) {
    console.error(`[MCP] App resource not found at: ${appPath}`);
    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: 'MCP App UI not found. Please rebuild the project with npm run build.',
        },
      ],
    };
  }

  try {
    const html = readFileSync(appPath, 'utf-8');
    return {
      contents: [
        {
          uri,
          mimeType: 'text/html;profile=mcp-app',
          text: html,
          // CSP configuration to allow loading images from Mediagraph CDN
          _meta: {
            ui: {
              csp: {
                // Allow images from CloudFront CDN
                resourceDomains: ['https://*.cloudfront.net'],
                // Allow API calls to Mediagraph (for future use)
                connectDomains: ['https://api.mediagraph.io'],
              },
            },
          },
        },
      ],
    };
  } catch (error) {
    console.error('[MCP] Failed to read app resource:', error);
    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: 'Failed to load MCP App UI.',
        },
      ],
    };
  }
}

// CLI commands
async function runAuthorize(): Promise<void> {
  if (!config.clientId) {
    console.error('Error: MEDIAGRAPH_CLIENT_ID environment variable is required');
    console.error('');
    console.error('Get your client ID from your Mediagraph organization settings.');
    process.exit(1);
  }

  console.log('Starting Mediagraph OAuth authorization...');
  console.log('');

  const authUrl = oauthHandler.getAuthorizationUrl();

  // Start callback server first
  await oauthHandler.startCallbackServer();

  // Open browser automatically
  openBrowser(authUrl);

  console.log('Opening browser for authorization...');
  console.log('If the browser does not open, please visit:');
  console.log('');
  console.log(authUrl);
  console.log('');
  console.log('Waiting for authorization callback...');

  try {
    const { code } = await oauthHandler.waitForCallback();
    console.log('');
    console.log('Authorization code received. Exchanging for tokens...');

    const tokens = await oauthHandler.exchangeCode(code);
    console.log('Tokens received successfully.');

    // Get user info
    currentTokens = tokens;
    const whoami = await client.whoami();
    console.log('Whoami response:', JSON.stringify(whoami, null, 2));

    // Store tokens with user info (handle missing organization gracefully)
    // Note: organization.title is the display name, organization.name may be undefined
    const org = whoami.organization as { id?: number; name?: string; title?: string; slug?: string } | undefined;
    const storedData: StoredTokens = {
      tokens,
      organizationId: org?.id,
      organizationName: org?.title || org?.name,
      organizationSlug: org?.slug,
      userId: whoami.user?.id,
      userEmail: whoami.user?.email,
    };
    tokenStore.save(storedData);

    console.log('');
    console.log('Successfully authorized!');
    if (org) {
      console.log(`Organization: ${org.title || org.name} (${org.slug})`);
    }
    if (whoami.user) {
      console.log(`User: ${whoami.user.full_name || whoami.user.email} (${whoami.user.email})`);
    }
    console.log('');
    console.log('You can now use the Mediagraph MCP server.');
  } catch (error) {
    console.error('Authorization failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function runLogout(): Promise<void> {
  const stored = tokenStore.load();
  if (stored?.tokens?.access_token) {
    try {
      await oauthHandler.revokeToken(stored.tokens.access_token);
      console.log('Token revoked successfully.');
    } catch (error) {
      console.error('Warning: Failed to revoke token:', error);
    }
  }

  tokenStore.clear();
  console.log('Logged out. Stored tokens have been cleared.');
}

async function runStatus(): Promise<void> {
  const stored = tokenStore.load();

  if (!stored?.tokens) {
    console.log('Status: Not authenticated');
    console.log('');
    console.log('Run: npx @mediagraph/mcp authorize');
    return;
  }

  const isExpired = Date.now() >= stored.tokens.expires_at;
  const expiresIn = Math.round((stored.tokens.expires_at - Date.now()) / 1000 / 60);

  console.log('Status: Authenticated');
  console.log(`Organization: ${stored.organizationName || 'Unknown'}`);
  console.log(`User: ${stored.userEmail || 'Unknown'}`);
  console.log(`Token Status: ${isExpired ? 'Expired' : `Valid (expires in ${expiresIn} minutes)`}`);
  console.log(`Refresh Token: ${stored.tokens.refresh_token ? 'Available' : 'Not available'}`);
}

async function runServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Mediagraph MCP server started');
}

// Main entry point
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'authorize':
    case 'auth':
    case 'login':
      await runAuthorize();
      break;

    case 'logout':
    case 'revoke':
      await runLogout();
      break;

    case 'status':
    case 'whoami':
      await runStatus();
      break;

    case 'help':
    case '--help':
    case '-h':
      console.log(`
Mediagraph MCP Server

Usage: npx @mediagraph/mcp [command]

Commands:
  (no command)  Start the MCP server (for Claude Desktop)
  authorize     Authorize with Mediagraph via OAuth
  logout        Log out and revoke tokens
  status        Show current authentication status
  help          Show this help message

Environment Variables (all optional):
  MEDIAGRAPH_CLIENT_ID       Override default OAuth client ID
  MEDIAGRAPH_CLIENT_SECRET   OAuth client secret (for confidential clients)
  MEDIAGRAPH_API_URL         API URL (default: https://api.mediagraph.io)
  MEDIAGRAPH_OAUTH_URL       OAuth URL (default: https://mediagraph.io)
  MEDIAGRAPH_REDIRECT_PORT   Local callback port (default: 52584)

Example:
  # First, authorize with Mediagraph
  npx @mediagraph/mcp authorize

  # Then configure Claude Desktop to use the MCP server
  # See README for configuration details
`);
      break;

    default:
      // No command = run the server
      await runServer();
      break;
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
