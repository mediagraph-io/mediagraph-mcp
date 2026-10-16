import {afterEach, describe, expect, it, vi} from 'vitest';
import {MediagraphClient} from '../api/client.js';
import {Runtime} from '../core/runtime.js';
import {toolDefinitions} from '../tools/index.js';

const response = () => ({ok: true, status: 200, headers: {get: (name: string) => name.toLowerCase() === 'content-type' ? 'application/json' : null}, json: async () => ({}), text: async () => '{}'});
afterEach(() => { vi.unstubAllGlobals(); });

describe('request source provenance', () => {
  for (const source of ['mcp', 'cli'] as const) {
    for (const mode of ['bearer', 'basic'] as const) {
      it(`labels authenticated ${mode} API and signer calls as ${source}`, async () => {
        const fetch = vi.fn().mockImplementation(async () => response());
        vi.stubGlobal('fetch', fetch);
        const client = new MediagraphClient({requestSource: source, getAuth: async () => mode === 'bearer'
          ? {mode, token: 'test-token'} : {mode, pat: 'test-pat', organizationId: 1}});
        await client.whoami();
        await client.signAwsRequest('test-signature-input', '20261016');
        for (const [, options] of fetch.mock.calls) {
          expect(options.headers['X-Mediagraph-Source']).toBe(source);
          expect(options.headers.Authorization).toContain(mode === 'bearer' ? 'Bearer ' : 'Basic ');
        }
      });
    }
  }

  it('configures runtime clients independently of tool arguments', async () => {
    const fetch = vi.fn().mockImplementation(async () => response());
    vi.stubGlobal('fetch', fetch);
    const config = {clientId: 'test-client', apiUrl: 'https://api.example.test', oauthUrl: 'https://example.test', redirectPort: 12345};
    const cli = new Runtime(config);
    const mcp = new Runtime(config, 'mcp');
    vi.spyOn(cli, 'getAuth').mockResolvedValue({mode: 'bearer', token: 'test-token'});
    vi.spyOn(mcp, 'getAuth').mockResolvedValue({mode: 'bearer', token: 'test-token'});
    await cli.client.whoami();
    await mcp.client.whoami();
    expect(fetch.mock.calls.map(([, options]) => options.headers['X-Mediagraph-Source'])).toEqual(['cli', 'mcp']);
  });

  it('does not send provenance or credentials to a signed S3 upload URL', async () => {
    const fetch = vi.fn().mockImplementation(async () => response());
    vi.stubGlobal('fetch', fetch);
    const client = new MediagraphClient({requestSource: 'mcp', getAccessToken: async () => 'test-token'});
    await client.uploadToSignedUrl('https://bucket.example.test/signed-upload', Buffer.from('test'), 'image/jpeg');
    const [, options] = fetch.mock.calls[0];
    expect(options.headers['X-Mediagraph-Source']).toBeUndefined();
    expect(options.headers.Authorization).toBeUndefined();
  });

  it('exposes history source filtering and sends it as a query parameter', async () => {
    const fetch = vi.fn().mockImplementation(async () => response());
    vi.stubGlobal('fetch', fetch);
    const client = new MediagraphClient({requestSource: 'mcp', getAccessToken: async () => 'test-token'});
    await client.getAssetEventLog(123, {request_source: 'agent', page: 2});
    expect(fetch.mock.calls[0][0]).toContain('request_source=agent');
    expect(fetch.mock.calls[0][0]).toContain('page=2');
    const definition = toolDefinitions.find(tool => tool.name === 'get_asset_event_log');
    expect(definition?.inputSchema.properties?.request_source).toMatchObject({enum: expect.arrayContaining(['cli', 'mcp', 'agent', 'unknown'])});
  });
});
