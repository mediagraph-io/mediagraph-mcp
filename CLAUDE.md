# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

Mediagraph MCP is a Model Context Protocol (MCP) server that provides AI assistants with access to the Mediagraph digital asset management API. It enables Claude and other MCP-compatible AI assistants to search, manage, and organize media assets.

**Tech Stack:**
- TypeScript with ESM modules
- Node.js 20+
- MCP SDK (`@modelcontextprotocol/sdk`)
- OAuth 2.0 with PKCE for authentication
- Vitest for testing
- tsup for bundling

## Common Commands

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode (watch)
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Type check without emitting
npm run typecheck

# Start the MCP server
npm start
```

## Project Structure

```
src/
├── index.ts              # MCP server entry point, CLI handling
├── api/
│   ├── client.ts         # Mediagraph API client (all HTTP methods)
│   ├── types.ts          # Re-exports from types/
│   └── types/            # Split type definitions by domain
│       ├── index.ts      # Re-exports all types
│       ├── assets.ts     # Asset, SearchParams, etc.
│       ├── groups.ts     # Collection, Lightbox, StorageFolder
│       ├── tags.ts       # Tag, Taxonomy, etc.
│       ├── users.ts      # User, Organization, Membership
│       └── ...           # Other domain types
├── auth/
│   ├── oauth.ts          # OAuth flow with PKCE support
│   └── token-store.ts    # Encrypted token storage
├── tools/                # MCP tool definitions and handlers
│   ├── index.ts          # Combines all tool modules
│   ├── shared.ts         # Common types and helpers
│   ├── assets.ts         # Asset tools (search, get, update, etc.)
│   ├── groups.ts         # Collection, Lightbox, StorageFolder tools
│   ├── tags.ts           # Tag, Taxonomy tools
│   ├── admin.ts          # User groups, invites, uploads, etc.
│   └── ...               # Other tool modules
├── resources/            # MCP resource providers
│   └── index.ts          # mediagraph:// URI handlers
└── __tests__/            # Test files
    ├── tools.test.ts
    ├── types.test.ts
    └── client.test.ts
```

## Architecture Patterns

### Tool Module Pattern

Each tool module in `src/tools/` exports a `ToolModule` with:
- `definitions`: Array of MCP tool definitions with JSON Schema
- `handlers`: Object mapping tool names to async handler functions

```typescript
export const exampleTools: ToolModule = {
  definitions: [
    {
      name: 'tool_name',
      description: 'What this tool does',
      inputSchema: { type: 'object', properties: {...}, required: [...] },
    },
  ],
  handlers: {
    async tool_name(args, { client }) {
      return successResult(await client.someMethod(args));
    },
  },
};
```

### API Client Pattern

The `MediagraphClient` class:
- Takes a `getAccessToken` function (not a static token) for dynamic token retrieval
- Includes retry logic with exponential backoff
- Handles rate limiting and token refresh
- All methods are async and return typed responses

### Result Helpers

Use these in tool handlers:
- `successResult(data)` - Wraps successful responses
- `errorResult(message)` - Wraps error responses with `isError: true`

## Adding New API Endpoints

1. **Add types** in appropriate file under `src/api/types/`
2. **Add client method** in `src/api/client.ts`
3. **Add tool definition and handler** in appropriate `src/tools/*.ts` file
4. **Test** - Run `npm test` and `npm run build`

## Testing

- Tests use Vitest with mocked fetch
- Mock responses need proper `headers.get()` function for Content-Type
- Client tests must handle retry logic (mock all retry attempts)

```typescript
// Helper for mocking responses
function createMockResponse(data: unknown, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    headers: { get: (name) => name === 'Content-Type' ? 'application/json' : null },
    json: () => Promise.resolve(data),
  };
}
```

## Mediagraph API Reference

- API Documentation: https://docs.mediagraph.io
- The API uses OAuth 2.0 with PKCE for public clients
- Organization context is sent via `OrganizationId` header
- Search supports advanced query syntax (AND, OR, NOT, field:value, wildcards)

## Search Query Syntax

The `search_assets` tool accepts advanced search queries:

```
dog                      # Basic search
NOT dog                  # Exclude term
dog AND cat              # Both terms
dog OR cat               # Either term
tag_text:nature          # Field-specific search
filename.keyword:IMG.jpg # Exact filename match
tag_text:part*           # Wildcard (starts with)
tag_text:*ial            # Wildcard (ends with)
NOT tag_text:**          # Assets without tags
(dog OR cat) AND ext:jpg # Complex grouping
```

## Git Workflow

- Do not commit without being asked
- Run tests before committing: `npm test`
- Build must pass: `npm run build`
