/**
 * Secure Token Storage for Mediagraph MCP Server
 * Stores tokens encrypted in a local file
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import type { TokenData } from './oauth.js';

export interface StoredTokens {
  tokens: TokenData;
  organizationId?: number;
  organizationName?: string;
  userId?: number;
  userEmail?: string;
}

const ALGORITHM = 'aes-256-gcm';
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export class TokenStore {
  private filePath: string;
  private encryptionKey: Buffer | null = null;

  constructor(filePath?: string) {
    this.filePath = filePath || join(homedir(), '.mediagraph', 'tokens.enc');
  }

  /**
   * Derive encryption key from a passphrase
   * In production, this should use system keychain or secure enclave
   */
  private getEncryptionKey(): Buffer {
    if (this.encryptionKey) {
      return this.encryptionKey;
    }

    // Use a machine-specific key derived from hostname and user
    const machineId = `${homedir()}-mediagraph-mcp`;
    this.encryptionKey = scryptSync(machineId, 'mediagraph-mcp-salt', 32);
    return this.encryptionKey;
  }

  /**
   * Encrypt data
   */
  private encrypt(data: string): Buffer {
    const key = this.getEncryptionKey();
    const iv = randomBytes(IV_LENGTH);
    const salt = randomBytes(SALT_LENGTH);

    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Format: salt (16) + iv (12) + tag (16) + encrypted data
    return Buffer.concat([salt, iv, tag, encrypted]);
  }

  /**
   * Decrypt data
   */
  private decrypt(encryptedBuffer: Buffer): string {
    const key = this.getEncryptionKey();

    const salt = encryptedBuffer.subarray(0, SALT_LENGTH);
    const iv = encryptedBuffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = encryptedBuffer.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = encryptedBuffer.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    return decipher.update(encrypted) + decipher.final('utf8');
  }

  /**
   * Save tokens to encrypted file
   */
  save(data: StoredTokens): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    const encrypted = this.encrypt(JSON.stringify(data));
    writeFileSync(this.filePath, encrypted, { mode: 0o600 });
  }

  /**
   * Load tokens from encrypted file
   */
  load(): StoredTokens | null {
    if (!existsSync(this.filePath)) {
      return null;
    }

    try {
      const encrypted = readFileSync(this.filePath);
      const decrypted = this.decrypt(encrypted);
      return JSON.parse(decrypted) as StoredTokens;
    } catch (error) {
      // If decryption fails, the file might be corrupted
      console.error('Failed to load tokens:', error);
      return null;
    }
  }

  /**
   * Delete stored tokens
   */
  clear(): void {
    if (existsSync(this.filePath)) {
      writeFileSync(this.filePath, '', { mode: 0o600 });
    }
  }

  /**
   * Check if tokens exist
   */
  hasTokens(): boolean {
    return existsSync(this.filePath) && this.load() !== null;
  }

  /**
   * Check if access token is expired or about to expire
   */
  isTokenExpired(bufferSeconds = 300): boolean {
    const data = this.load();
    if (!data || !data.tokens) {
      return true;
    }

    // Check if token expires within buffer time
    return Date.now() >= data.tokens.expires_at - bufferSeconds * 1000;
  }

  /**
   * Get access token, returning null if expired
   */
  getAccessToken(): string | null {
    const data = this.load();
    if (!data || !data.tokens) {
      return null;
    }

    // Return null if expired
    if (this.isTokenExpired()) {
      return null;
    }

    return data.tokens.access_token;
  }

  /**
   * Get refresh token
   */
  getRefreshToken(): string | null {
    const data = this.load();
    return data?.tokens?.refresh_token || null;
  }
}
