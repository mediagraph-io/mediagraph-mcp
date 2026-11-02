import { afterEach, describe, expect, it, vi } from 'vitest';
import { MediagraphClient } from '../api/client.js';
import { adminFolderDuplicationTools } from '../tools/admin_folder_duplications.js';
import { validateWaitArguments, waitForTerminal } from '../cli/wait.js';
import { runWatchCli } from '../cli/watch.js';
import type { Runtime } from '../core/runtime.js';
import type { ToolContext } from '../tools/shared.js';

const definition = adminFolderDuplicationTools.definitions[0];
const invoke = adminFolderDuplicationTools.handlers.duplicate_storage_folder_to_collection;
const key = 'admin_request_example_01';
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('dedicated folder duplication', () => {
  it('previews by default and sends only the allowlisted request', async () => {
    const call = vi.fn().mockResolvedValue({ preview: true });
    const context = { client: { duplicateStorageFolderToCollection: call } } as unknown as ToolContext;
    await invoke({ source: 12, destination: 34 }, context);
    expect(call).toHaveBeenCalledWith({ source: 12, destination: 34, execute: false });
  });

  it('requires explicit execute and a stable key, rejecting raw queue/actor parameters', async () => {
    const call = vi.fn().mockResolvedValue({ guid: 'g1' });
    const context = { client: { duplicateStorageFolderToCollection: call } } as unknown as ToolContext;
    await expect(invoke({ source: 12, destination: 34, execute: true }, context)).rejects.toMatchObject({code: 'BAD_ARGS'});
    await expect(invoke({ source: 12, destination: 34, execute: true, preview: true, idempotency_key: key }, context)).rejects.toMatchObject({code: 'BAD_ARGS'});
    await expect(invoke({ source: 12, destination: 34, processing_queue: 'default' }, context)).rejects.toMatchObject({code: 'BAD_ARGS'});
    expect(call).not.toHaveBeenCalled();
    await invoke({ source: 12, destination: 34, execute: true, execution: 'dedicated', idempotency_key: key }, context);
    expect(call).toHaveBeenCalledWith({source: 12, destination: 34, execute: true, idempotency_key: key});
  });

  it('posts through the authenticated API client and preserves server readiness data', async () => {
    const response = {preview: true, execution: {mode: 'dedicated', status: 'worker_unavailable'}};
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), {status: 200, headers: {'Content-Type': 'application/json'}}));
    vi.stubGlobal('fetch', fetch);
    const client = new MediagraphClient({ getAccessToken: async () => 'test-token' });
    expect(await client.duplicateStorageFolderToCollection({source: 12, destination: 34, execute: false})).toEqual(response);
    const [url, request] = fetch.mock.calls[0];
    expect(url).toContain('/api/admin_folder_duplications');
    expect(JSON.parse(request.body)).toEqual({source: 12, destination: 34, execute: false});
  });

  it('rejects waiting for preview before an invocation can create or query a job', () => {
    expect(() => validateWaitArguments(definition, {})).toThrow(/requires --execute/);
    expect(() => validateWaitArguments(definition, {execute: true, preview: true})).toThrow(/requires --execute/);
    expect(() => validateWaitArguments(definition, {execute: true})).not.toThrow();
  });

  it('polls with the GUID as id and continues through retryable errors', async () => {
    vi.useFakeTimers();
    const poll = vi.fn()
      .mockResolvedValueOnce({content: [{type: 'text', text: JSON.stringify({guid: 'g1', aasm_state: 'errored'})}]})
      .mockResolvedValueOnce({content: [{type: 'text', text: JSON.stringify({guid: 'g1', aasm_state: 'processed', error: 'destination changed'})}]});
    const promise = waitForTerminal(definition, {guid: 'g1'}, poll, {} as ToolContext, {timeoutMs: 10000, pollMs: 10});
    await vi.advanceTimersByTimeAsync(25);
    expect(await promise).toMatchObject({aasm_state: 'processed', error: 'destination changed'});
    expect(poll).toHaveBeenCalledTimes(2);
    expect(poll).toHaveBeenCalledWith('get_bulk_job', {id: 'g1'});
  });

  it('watch follows retrying jobs until failed rather than exiting on errored', async () => {
    vi.useFakeTimers();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const poll = vi.fn().mockResolvedValueOnce({guid: 'g1', aasm_state: 'errored'})
      .mockResolvedValueOnce({guid: 'g1', aasm_state: 'failed', error: 'retries exhausted'});
    const runtime = {client: {refreshJwt: vi.fn().mockRejectedValue(new Error('poll instead')), getBulkJob: poll},
      config: {patOrganizationId: 53}, tokenStore: {load: () => ({organizationId: 53})},
      getAuth: async () => ({mode: 'bearer', token: 'test-token'})} as unknown as Runtime;
    const promise = runWatchCli(['bulk_job', 'g1', '--poll-interval', '1', '--timeout', '5'], runtime);
    await vi.advanceTimersByTimeAsync(1100);
    await promise;
    expect(poll).toHaveBeenCalledTimes(2);
  });
});
