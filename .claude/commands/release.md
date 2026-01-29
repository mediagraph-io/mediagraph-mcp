---
allowed-tools:
  - Bash(npm test)
  - Bash(npm run build)
  - Bash(npm version:*)
  - Bash(npm publish --access public:*)
  - Bash(git add:*)
  - Bash(git commit:*)
  - Bash(git push:*)
  - Bash(git tag:*)
  - Bash(git tag * && git push:*)
  - Bash(gh run:*)
  - Bash(gh run watch:*)
  - Bash(gh release:*)
  - Edit
  - Read
---

# /release

Release a new version of the package to npm and GitHub.

## Usage

```
/release [version]
```

- `version`: The version to release (e.g., `1.0.2`, `patch`, `minor`, `major`)
  - If not provided, prompts for version type

## Steps

1. **Bump version** in package.json and manifest.json
   - If version is `patch`, `minor`, or `major`, use `npm version <type> --no-git-tag-version`
   - If version is a specific semver, update package.json directly
   - **IMPORTANT**: Use the Edit tool to update the `"version"` field in manifest.json to match the new version
   - Verify both files have the same version before proceeding

2. **Run tests** to ensure everything passes
   ```bash
   npm test
   ```

3. **Build** the project
   ```bash
   npm run build
   ```

4. **Commit** the version bump
   ```bash
   git add package.json manifest.json
   git commit -m "Release v<version>"
   ```

5. **Push** the commit
   ```bash
   git push origin master
   ```

6. **Publish to npm** (requires OTP from user)
   ```bash
   npm publish --access public --otp=<otp>
   ```

7. **Create and push git tag**
   ```bash
   git tag v<version>
   git push origin v<version>
   ```

8. **Wait for GitHub Actions** to build the .mcpb and create the release

9. **Report** the release URLs:
   - npm: https://www.npmjs.com/package/@mediagraph/mcp
   - GitHub Release with .mcpb download link
