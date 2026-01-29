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
    // Wait for existing auth to complete
    while (isAuthInProgress) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return currentTokens !== null;
  }

  isAuthInProgress = true;

  try {
    // Generate the auth URL (this sets up PKCE internally)
    const authUrl = oauthHandler.getAuthorizationUrl();

    // Start the callback server FIRST and wait for it to be ready
    await oauthHandler.startCallbackServer();

    // NOW open the browser (server is ready to receive callback)
    openBrowser(authUrl);

    // Wait for the OAuth callback
    const { code } = await oauthHandler.waitForCallback();

    // Exchange code for tokens
    const tokens = await oauthHandler.exchangeCode(code);
    currentTokens = tokens;

    // Get user info and store tokens
    const whoami = await client.whoami();
    const storedData: StoredTokens = {
      tokens,
      organizationId: whoami.organization.id,
      organizationName: whoami.organization.name,
      userId: whoami.user.id,
      userEmail: whoami.user.email,
    };
    tokenStore.save(storedData);

    return true;
  } catch (error) {
    console.error('Auto-auth failed:', error);
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
const toolContext: ToolContext = { client };
const resourceContext: ResourceContext = { client };

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

  // Check authentication - auto-trigger OAuth if needed
  let token = await getAccessToken();
  if (!token) {
    // Automatically start OAuth flow
    const authSuccess = await runAutoAuth();
    if (!authSuccess) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Failed to authenticate with Mediagraph. Please try again or check your browser for the authorization window.',
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

  const result = await handleTool(name, (args || {}) as Record<string, unknown>, toolContext);
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
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  let token = await getAccessToken();
  if (!token) {
    const authSuccess = await runAutoAuth();
    if (!authSuccess) {
      return { resources: [] };
    }
    token = await getAccessToken();
  }
  if (!token) {
    return { resources: [] };
  }

  const resources = await listResources(resourceContext);
  return { resources };
});

// Handle resource reading
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

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

    // Store tokens with user info
    const storedData: StoredTokens = {
      tokens,
      organizationId: whoami.organization.id,
      organizationName: whoami.organization.name,
      userId: whoami.user.id,
      userEmail: whoami.user.email,
    };
    tokenStore.save(storedData);

    console.log('');
    console.log('Successfully authorized!');
    console.log(`Organization: ${whoami.organization.name}`);
    console.log(`User: ${whoami.user.full_name} (${whoami.user.email})`);
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
