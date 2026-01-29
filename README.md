# Mediagraph MCP Server

An MCP (Model Context Protocol) server that provides AI assistants with access to the [Mediagraph](https://mediagraph.io) digital asset management platform.

## Features

- **OAuth Authentication**: Secure authorization with PKCE support
- **Asset Management**: Search, view, and update digital assets
- **Organization Tools**: Work with collections, lightboxes, and folders
- **Tagging**: Add and manage asset tags
- **Sharing**: Create share links for assets and collections
- **Bulk Operations**: Perform batch updates on multiple assets

## Installation

```bash
npm install -g @mediagraph/mcp
```

Or run directly with npx:

```bash
npx @mediagraph/mcp
```

## Quick Start

### 1. Get OAuth Credentials

1. Log into your Mediagraph organization
2. Go to **Settings > API & Integrations**
3. Create a new OAuth application
4. Copy the Client ID (and Client Secret if using a confidential client)

### 2. Authorize

```bash
MEDIAGRAPH_CLIENT_ID=your-client-id npx @mediagraph/mcp authorize
```

This will open a browser window for you to authorize the MCP server with your Mediagraph account.

### 3. Configure Claude Desktop

Add the following to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mediagraph": {
      "command": "npx",
      "args": ["@mediagraph/mcp"],
      "env": {
        "MEDIAGRAPH_CLIENT_ID": "your-client-id"
      }
    }
  }
}
```

### 4. Start Using

Restart Claude Desktop and you can now ask Claude to:

- "Search for images tagged 'sunset'"
- "Show me the details of asset ABC123"
- "Add tags 'nature' and 'landscape' to this asset"
- "Create a new collection called 'Project Photos'"
- "Find all videos uploaded this week"

## Available Tools

| Tool | Description |
|------|-------------|
| `whoami` | Get current user and organization info |
| `search_assets` | Search assets with filters (tags, dates, ratings, etc.) |
| `get_asset` | Get detailed asset information |
| `update_asset` | Update asset metadata (title, description, etc.) |
| `add_tags` | Add tags to an asset |
| `download_asset` | Get a download URL for an asset |
| `list_collections` | List all collections |
| `get_collection` | Get collection details |
| `create_collection` | Create a new collection |
| `add_to_collection` | Add an asset to a collection |
| `list_lightboxes` | List all lightboxes |
| `get_lightbox` | Get lightbox details |
| `create_lightbox` | Create a new lightbox |
| `add_to_lightbox` | Add an asset to a lightbox |
| `list_storage_folders` | List storage folders |
| `list_tags` | List available tags |
| `create_share_link` | Create a share link |
| `bulk_update` | Bulk operations on multiple assets |

## Available Resources

The server provides MCP resources for direct access to Mediagraph data:

- `mediagraph://asset/{id}` - Asset details
- `mediagraph://collection/{id}` - Collection with assets
- `mediagraph://lightbox/{id}` - Lightbox with assets
- `mediagraph://search?q={query}` - Search results

## CLI Commands

```bash
# Authorize with Mediagraph
npx @mediagraph/mcp authorize

# Check authentication status
npx @mediagraph/mcp status

# Log out and revoke tokens
npx @mediagraph/mcp logout

# Show help
npx @mediagraph/mcp help
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MEDIAGRAPH_CLIENT_ID` | Yes | - | OAuth client ID |
| `MEDIAGRAPH_CLIENT_SECRET` | No | - | OAuth client secret (for confidential clients) |
| `MEDIAGRAPH_API_URL` | No | `https://api.mediagraph.io` | API base URL |
| `MEDIAGRAPH_OAUTH_URL` | No | `https://mediagraph.io` | OAuth server URL |
| `MEDIAGRAPH_REDIRECT_PORT` | No | `3000` | Local callback port for OAuth |

## Security

- Tokens are stored encrypted in `~/.mediagraph/tokens.enc`
- PKCE is used for OAuth to prevent authorization code interception
- Access tokens are automatically refreshed before expiration
- No sensitive data is logged or exposed

## Development

```bash
# Clone the repository
git clone https://github.com/mediagraph/mediagraph-mcp.git
cd mediagraph-mcp

# Install dependencies
npm install

# Build
npm run build

# Run in development mode
npm run dev
```

## Testing with MCP Inspector

```bash
# Build the project
npm run build

# Run with inspector
npx @modelcontextprotocol/inspector node dist/index.js
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

- [API Documentation](https://docs.mediagraph.io)
- [GitHub Issues](https://github.com/mediagraph/mediagraph-mcp/issues)
