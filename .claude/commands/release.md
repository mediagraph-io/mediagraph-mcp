---
allowed-tools:
  - Bash(./scripts/release.sh:*)
  - Bash(gh run watch --repo:*)
---

# /release

Release a new version of the package to npm and GitHub.

## Usage

```
/release <otp>
/release <version> <otp>
```

- `otp`: **Required** - npm one-time password for publishing
- `version`: The version to release (e.g., `patch`, `minor`, `major`)
  - If not provided, defaults to `patch`

Examples:
- `/release 123456` - patch release with OTP
- `/release minor 123456` - minor release with OTP

## Steps

1. Run the release script with the provided arguments:
   ```bash
   ./scripts/release.sh [version] <otp>
   ```

2. Wait for GitHub Actions to build the .mcpb and create the release:
   ```bash
   gh run watch --repo mediagraph-io/mediagraph-mcp
   ```

3. Report the release URLs:
   - npm: https://www.npmjs.com/package/@mediagraph/mcp
   - GitHub Release: https://github.com/mediagraph-io/mediagraph-mcp/releases
   - URL of the MCPB download: https://github.com/mediagraph-io/mediagraph-mcp/releases/download/v<version>/mediagraph-mcp.mcpb
