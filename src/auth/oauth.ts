/**
 * OAuth Authentication for Mediagraph MCP Server
 * Implements OAuth 2.0 with PKCE for public clients
 */

import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';

export interface OAuthConfig {
  clientId: string;
  clientSecret?: string;
  oauthUrl?: string;
  redirectPort?: number;
  scopes?: string[];
}

export interface TokenData {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
  scope?: string;
}

export interface OAuthCallbackResult {
  code: string;
  state: string;
}

export class OAuthHandler {
  private config: Required<Omit<OAuthConfig, 'clientSecret'>> & { clientSecret?: string };
  private codeVerifier: string | null = null;
  private state: string | null = null;
  private callbackServer: Server | null = null;

  constructor(config: OAuthConfig) {
    this.config = {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      oauthUrl: config.oauthUrl || 'https://mediagraph.io',
      redirectPort: config.redirectPort || 52584,
      scopes: config.scopes || ['read', 'write'],
    };
  }

  /**
   * Generate PKCE code verifier and challenge
   */
  private generatePKCE(): { verifier: string; challenge: string } {
    // Generate a random code verifier (43-128 characters)
    const verifier = randomBytes(32).toString('base64url');

    // Create SHA256 hash and base64url encode it
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    return { verifier, challenge };
  }

  /**
   * Generate a random state parameter
   */
  private generateState(): string {
    return randomBytes(16).toString('base64url');
  }

  /**
   * Get the redirect URI
   */
  getRedirectUri(): string {
    return `http://localhost:${this.config.redirectPort}/callback`;
  }

  /**
   * Build the authorization URL for OAuth flow
   */
  getAuthorizationUrl(): string {
    const { verifier, challenge } = this.generatePKCE();
    this.codeVerifier = verifier;
    this.state = this.generateState();

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.getRedirectUri(),
      scope: this.config.scopes.join(' '),
      state: this.state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    return `${this.config.oauthUrl}/oauth/authorize?${params.toString()}`;
  }

  private callbackPromise: {
    resolve: (result: OAuthCallbackResult) => void;
    reject: (error: Error) => void;
  } | null = null;

  /**
   * Start the callback server and wait for it to be ready
   */
  async startCallbackServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.callbackServer = createServer((req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url || '/', `http://localhost:${this.config.redirectPort}`);

        if (url.pathname === '/callback') {
          const code = url.searchParams.get('code');
          const state = url.searchParams.get('state');
          const error = url.searchParams.get('error');
          const errorDescription = url.searchParams.get('error_description');

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                  <h1 style="color: #dc3545;">Authorization Failed</h1>
                  <p>${errorDescription || error}</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            this.stopCallbackServer();
            this.callbackPromise?.reject(new Error(errorDescription || error));
            this.callbackPromise = null;
            return;
          }

          if (!code || !state) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                  <h1 style="color: #dc3545;">Invalid Callback</h1>
                  <p>Missing authorization code or state.</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            this.stopCallbackServer();
            this.callbackPromise?.reject(new Error('Missing authorization code or state'));
            this.callbackPromise = null;
            return;
          }

          if (state !== this.state) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                  <h1 style="color: #dc3545;">Security Error</h1>
                  <p>State parameter mismatch. This could indicate a CSRF attack.</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            this.stopCallbackServer();
            this.callbackPromise?.reject(new Error('State parameter mismatch'));
            this.callbackPromise = null;
            return;
          }

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: sans-serif; padding: 40px; text-align: center;">
                <h1 style="color: #28a745;">Authorization Successful</h1>
                <p>You have successfully connected to Mediagraph.</p>
                <p>You can close this window and return to your application.</p>
              </body>
            </html>
          `);

          this.stopCallbackServer();
          this.callbackPromise?.resolve({ code, state });
          this.callbackPromise = null;
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      this.callbackServer.on('error', (err) => {
        reject(err);
      });

      this.callbackServer.listen(this.config.redirectPort, () => {
        // Server is now listening and ready
        resolve();
      });
    });
  }

  /**
   * Wait for the OAuth callback (server must be started first)
   */
  async waitForCallback(): Promise<OAuthCallbackResult> {
    return new Promise((resolve, reject) => {
      this.callbackPromise = { resolve, reject };

      // Timeout after 5 minutes
      setTimeout(() => {
        if (this.callbackPromise) {
          this.stopCallbackServer();
          this.callbackPromise.reject(new Error('Authorization timed out'));
          this.callbackPromise = null;
        }
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Start server and wait for callback (convenience method for CLI)
   */
  async startAndWaitForCallback(): Promise<OAuthCallbackResult> {
    await this.startCallbackServer();
    return this.waitForCallback();
  }

  /**
   * Stop the callback server
   */
  stopCallbackServer(): void {
    if (this.callbackServer) {
      this.callbackServer.close();
      this.callbackServer = null;
    }
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(code: string): Promise<TokenData> {
    if (!this.codeVerifier) {
      throw new Error('No code verifier available. Start authorization flow first.');
    }

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.getRedirectUri(),
      client_id: this.config.clientId,
      code_verifier: this.codeVerifier,
    });

    if (this.config.clientSecret) {
      params.append('client_secret', this.config.clientSecret);
    }

    const response = await fetch(`${this.config.oauthUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({ error: 'unknown_error' }))) as {
        error?: string;
        error_description?: string;
      };
      throw new Error(`Token exchange failed: ${error.error_description || error.error}`);
    }

    const tokenData = (await response.json()) as Omit<TokenData, 'expires_at'>;

    // Clear the code verifier after successful exchange
    this.codeVerifier = null;
    this.state = null;

    return {
      ...tokenData,
      expires_at: Date.now() + tokenData.expires_in * 1000,
    };
  }

  /**
   * Refresh an access token using a refresh token
   */
  async refreshToken(refreshToken: string): Promise<TokenData> {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.config.clientId,
    });

    if (this.config.clientSecret) {
      params.append('client_secret', this.config.clientSecret);
    }

    const response = await fetch(`${this.config.oauthUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({ error: 'unknown_error' }))) as {
        error?: string;
        error_description?: string;
      };
      throw new Error(`Token refresh failed: ${error.error_description || error.error}`);
    }

    const tokenData = (await response.json()) as Omit<TokenData, 'expires_at'>;

    return {
      ...tokenData,
      expires_at: Date.now() + tokenData.expires_in * 1000,
    };
  }

  /**
   * Revoke a token
   */
  async revokeToken(token: string): Promise<void> {
    const params = new URLSearchParams({
      token,
      client_id: this.config.clientId,
    });

    if (this.config.clientSecret) {
      params.append('client_secret', this.config.clientSecret);
    }

    await fetch(`${this.config.oauthUrl}/oauth/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
  }
}
