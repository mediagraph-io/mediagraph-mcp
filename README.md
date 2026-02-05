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

## Quick Start with Claude Desktop

The easiest way to get started is with [Claude Desktop](https://claude.ai/download).

### Option A: One-Click Install (Recommended)

1. Download the latest [`mediagraph-mcp.mcpb`](https://github.com/mediagraph-io/mediagraph-mcp/releases/latest/download/mediagraph-mcp.mcpb) bundle from [GitHub Releases](https://github.com/mediagraph-io/mediagraph-mcp/releases)
2. Open the file — it will automatically configure Claude Desktop
3. Authorize with your Mediagraph account when prompted

### Option B: Manual Configuration

#### 1. Authorize

```bash
npx @mediagraph/mcp authorize
```

This will open a browser window for you to log in and authorize the MCP server with your Mediagraph account.

#### 2. Configure Claude Desktop

Add the following to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mediagraph": {
      "command": "npx",
      "args": ["@mediagraph/mcp"]
    }
  }
}
```

#### 3. Restart Claude Desktop

### Start Using

Once configured, you can ask Claude to:

- "Search for images tagged 'sunset'"
- "Show me the details of asset ABC123"
- "Add tags 'nature' and 'landscape' to this asset"
- "Create a new collection called 'Project Photos'"
- "Find all videos uploaded this week"

## Visual Asset Browser

In Claude Desktop, you can ask Claude to visually search your assets using the `search_assets_visual` tool. This opens an interactive gallery directly in the chat with:

- **Thumbnail grid** — browse search results visually with hover previews
- **Asset detail panel** — click any asset to view a full preview with file info, EXIF/IPTC metadata, and tags
- **Inline editing** — edit title, description, alt text, caption, credit, and copyright without leaving Claude
- **Ratings** — rate assets with a star rating
- **Tagging** — add and remove tags from assets
- **Downloads** — download assets in multiple sizes (small, medium, full, original) with optional watermarking
- **Bulk downloads** — select multiple assets and download them at once
- **Pagination** — navigate through large result sets

Try asking Claude: *"Visually show me all images tagged 'landscape'"*

## Available Tools

| Tool | Description |
|------|-------------|
| `whoami` | Get current user and organization info |
| `search_assets` | Search assets with filters (tags, dates, ratings, etc.) |
| `search_assets_visual` | Search assets and display results in an interactive visual gallery |
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

All environment variables are optional. The default configuration works out of the box.

| Variable | Default | Description |
|----------|---------|-------------|
| `MEDIAGRAPH_CLIENT_ID` | *(built-in)* | OAuth client ID (override for custom apps) |
| `MEDIAGRAPH_CLIENT_SECRET` | - | OAuth client secret (for confidential clients) |
| `MEDIAGRAPH_API_URL` | `https://api.mediagraph.io` | API base URL |
| `MEDIAGRAPH_OAUTH_URL` | `https://mediagraph.io` | OAuth server URL |
| `MEDIAGRAPH_REDIRECT_PORT` | `52584` | Local callback port for OAuth |

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
