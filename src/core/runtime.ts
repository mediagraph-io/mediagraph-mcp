/**
 * Shared runtime for MCP server and CLI.
 *
 * Owns OAuth state, token persistence, browser launching, and the
 * authorize/logout/status flows. Both `serve` (MCP) and CLI tool dispatch
 * import from here so credentials and behavior stay in lockstep.
 */

import { exec } from 'node:child_process';
import { platform } from 'node:os';

import { MediagraphClient, type AuthCredentials } from '../api/client.js';
import { OAuthHandler, type TokenData } from '../auth/oauth.js';
import { TokenStore, type StoredTokens } from '../auth/token-store.js';
import type { ToolContext } from '../tools/shared.js';

const DEFAULT_CLIENT_ID = '7Y8rlAetr9IK2N91X4wCvVlo2hQLX6nJvFY1N8CY0GI';

export interface RuntimeConfig {
  clientId: string;
  clientSecret?: string;
  apiUrl: string;
  oauthUrl: string;
  redirectPort: number;
  /** Personal Access Token for headless auth. Takes precedence over OAuth tokens. */
  pat?: string;
  /** Required when `pat` is set. */
  patOrganizationId?: number;
}

export function loadConfig(): RuntimeConfig {
  const patOrgRaw = process.env.MEDIAGRAPH_ORGANIZATION_ID;
  const patOrg = patOrgRaw ? parseInt(patOrgRaw, 10) : undefined;
  return {
    clientId: process.env.MEDIAGRAPH_CLIENT_ID || DEFAULT_CLIENT_ID,
    clientSecret: process.env.MEDIAGRAPH_CLIENT_SECRET,
    apiUrl: process.env.MEDIAGRAPH_API_URL || 'https://api.mediagraph.io',
    oauthUrl: process.env.MEDIAGRAPH_OAUTH_URL || 'https://mediagraph.io',
    redirectPort: parseInt(process.env.MEDIAGRAPH_REDIRECT_PORT || '52584', 10),
    pat: process.env.MEDIAGRAPH_PAT,
    patOrganizationId: Number.isFinite(patOrg) ? patOrg : undefined,
  };
}

export function openBrowser(url: string): void {
  const command = platform() === 'darwin'
    ? `open "${url}"`
    : platform() === 'win32'
      ? `start "" "${url}"`
      : `xdg-open "${url}"`;
  exec(command, (error) => {
    if (error) console.error('Failed to open browser:', error);
  });
}

export class Runtime {
  readonly config: RuntimeConfig;
  readonly tokenStore: TokenStore;
  readonly oauth: OAuthHandler;
  readonly client: MediagraphClient;

  private currentTokens: TokenData | null = null;
  private authInProgress = false;

  constructor(config: RuntimeConfig = loadConfig()) {
    this.config = config;
    this.tokenStore = new TokenStore();
    this.oauth = new OAuthHandler({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      oauthUrl: config.oauthUrl,
      redirectPort: config.redirectPort,
    });
    this.client = new MediagraphClient({
      apiUrl: config.apiUrl,
      getAuth: () => this.getAuth(),
    });
  }

  /**
   * Resolve auth: PAT (env or stored) takes precedence; otherwise OAuth bearer.
   * PAT mode requires MEDIAGRAPH_ORGANIZATION_ID since the server can't infer it.
   */
  async getAuth(): Promise<AuthCredentials | null> {
    if (this.config.pat) {
      if (!this.config.patOrganizationId) {
        throw new Error('MEDIAGRAPH_PAT is set but MEDIAGRAPH_ORGANIZATION_ID is missing. Both are required for PAT auth.');
      }
      return { mode: 'basic', pat: this.config.pat, organizationId: this.config.patOrganizationId };
    }
    const token = await this.getAccessToken();
    if (!token) return null;
    return { mode: 'bearer', token };
  }

  isPatMode(): boolean {
    return !!this.config.pat;
  }

  /** Resolve a usable access token, refreshing if needed. Returns null if unauthenticated. */
  async getAccessToken(): Promise<string | null> {
    if (this.currentTokens && Date.now() < this.currentTokens.expires_at - 300000) {
      return this.currentTokens.access_token;
    }
    const stored = this.tokenStore.load();
    if (!stored?.tokens) return null;

    if (Date.now() < stored.tokens.expires_at - 300000) {
      this.currentTokens = stored.tokens;
      return this.currentTokens.access_token;
    }

    if (stored.tokens.refresh_token) {
      try {
        const refreshed = await this.oauth.refreshToken(stored.tokens.refresh_token);
        this.currentTokens = refreshed;
        this.tokenStore.save({ ...stored, tokens: refreshed });
        return refreshed.access_token;
      } catch (error) {
        console.error('Failed to refresh token:', error);
      }
    }
    return null;
  }

  /** Run the full OAuth handshake, persist tokens, and return success. */
  async runAutoAuth(): Promise<boolean> {
    if (this.authInProgress) {
      const start = Date.now();
      while (this.authInProgress && Date.now() - start < 120000) {
        await new Promise(r => setTimeout(r, 500));
      }
      return this.currentTokens !== null;
    }

    this.authInProgress = true;
    try {
      const authUrl = this.oauth.getAuthorizationUrl();
      await this.oauth.startCallbackServer();
      openBrowser(authUrl);
      const { code } = await this.oauth.waitForCallback();
      const tokens = await this.oauth.exchangeCode(code);
      this.currentTokens = tokens;

      let stored: StoredTokens = { tokens };
      this.tokenStore.save(stored);
      try {
        const whoami = await this.client.whoami();
        const org = whoami?.organization as { id?: number; name?: string; title?: string; slug?: string } | undefined;
        if (org?.id) {
          stored = {
            tokens,
            organizationId: org.id,
            organizationName: org.title || org.name,
            organizationSlug: org.slug,
            userId: whoami.user?.id,
            userEmail: whoami.user?.email,
          };
          this.tokenStore.save(stored);
        }
      } catch {
        // tokens already saved; whoami enrichment is best-effort
      }
      return true;
    } catch (error) {
      console.error('Auto-auth failed:', error);
      this.oauth.stopCallbackServer();
      return false;
    } finally {
      this.authInProgress = false;
    }
  }

  /** Build a ToolContext bound to this runtime, with reauthorize wired up. */
  toolContext(): ToolContext {
    return {
      client: this.client,
      organizationSlug: this.tokenStore.load()?.organizationSlug,
      reauthorize: async () => {
        this.currentTokens = null;
        this.tokenStore.clear();
        const ok = await this.runAutoAuth();
        if (!ok) return { success: false };
        const stored = this.tokenStore.load();
        return {
          success: true,
          organizationName: stored?.organizationName,
          userEmail: stored?.userEmail,
        };
      },
    };
  }

  /** True if a tool-call attempt should kick off OAuth automatically. */
  authIsInProgress(): boolean {
    return this.authInProgress;
  }

  setCurrentTokens(tokens: TokenData | null): void {
    this.currentTokens = tokens;
  }
}

export interface AuthStatus {
  authenticated: boolean;
  organization?: { name?: string; slug?: string; id?: number };
  user?: { email?: string; id?: number };
  token?: { expired: boolean; expiresInMinutes: number; hasRefresh: boolean };
}

export function getAuthStatus(runtime: Runtime): AuthStatus & { mode?: 'oauth' | 'pat' } {
  if (runtime.isPatMode()) {
    return {
      authenticated: true,
      mode: 'pat',
      organization: { id: runtime.config.patOrganizationId },
    };
  }
  const stored = runtime.tokenStore.load();
  if (!stored?.tokens) return { authenticated: false };
  const expiresInMinutes = Math.round((stored.tokens.expires_at - Date.now()) / 60000);
  return {
    authenticated: true,
    mode: 'oauth',
    organization: {
      name: stored.organizationName,
      slug: stored.organizationSlug,
      id: stored.organizationId,
    },
    user: { email: stored.userEmail, id: stored.userId },
    token: {
      expired: Date.now() >= stored.tokens.expires_at,
      expiresInMinutes,
      hasRefresh: !!stored.tokens.refresh_token,
    },
  };
}

export async function runLogout(runtime: Runtime): Promise<{ revoked: boolean; error?: string }> {
  const stored = runtime.tokenStore.load();
  let revoked = false;
  let error: string | undefined;
  if (stored?.tokens?.access_token) {
    try {
      await runtime.oauth.revokeToken(stored.tokens.access_token);
      revoked = true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  runtime.tokenStore.clear();
  runtime.setCurrentTokens(null);
  return { revoked, error };
}
