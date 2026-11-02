import type { ToolModule } from './shared.js';
import { successResult } from './shared.js';
import { CliError } from '../cli/errors.js';

export const adminFolderDuplicationTools: ToolModule = {
  definitions: [{
    name: 'duplicate_storage_folder_to_collection',
    description: 'Super-admin: preview or submit a folder subtree duplication into a Collection using reserved admin worker capacity. Defaults to a server preview. Execute requires a stable idempotency key; never deletes destination content.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'integer', minimum: 1, description: 'Source StorageFolder ID in the selected organization' },
        destination: { type: 'integer', minimum: 1, description: 'Destination Collection ID in the selected organization' },
        execution: { type: 'string', enum: ['dedicated'], description: 'Dedicated admin worker execution (the only supported mode)' },
        preview: { type: 'boolean', description: 'Preview counts, conflicts, and capacity without creating a job (default)' },
        execute: { type: 'boolean', description: 'Explicitly submit the duplication; mutually exclusive with preview' },
        idempotency_key: { type: 'string', minLength: 16, maxLength: 128, pattern: '^[a-zA-Z0-9_-]+$', description: 'Stable request key for execute; reuse on retries' },
      },
      required: ['source', 'destination'],
    },
    _meta: { wait: {
      pollTool: 'get_bulk_job', idField: 'guid', pollIdParam: 'id', executeFlag: 'execute',
      statusField: 'aasm_state', terminal: ['processed', 'failed', 'canceled'],
    } },
  }],
  handlers: {
    async duplicate_storage_folder_to_collection(args, { client }) {
      const allowed = ['source', 'destination', 'execution', 'preview', 'execute', 'idempotency_key'];
      if (Object.keys(args).some(k => !allowed.includes(k)) ||
          !Number.isSafeInteger(args.source) || Number(args.source) < 1 ||
          !Number.isSafeInteger(args.destination) || Number(args.destination) < 1 ||
          (args.execution !== undefined && args.execution !== 'dedicated') ||
          (args.preview !== undefined && typeof args.preview !== 'boolean') ||
          (args.execute !== undefined && typeof args.execute !== 'boolean')) {
        throw new CliError('BAD_ARGS', 'Invalid duplication arguments.');
      }
      const execute = args.execute === true;
      if (execute && args.preview === true) throw new CliError('BAD_ARGS', 'Choose preview or execute.');
      if (execute && (typeof args.idempotency_key !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(args.idempotency_key))) {
        throw new CliError('BAD_ARGS', 'Execute requires an idempotency_key of 16–128 letters, digits, underscores, or hyphens.');
      }
      return successResult(await client.duplicateStorageFolderToCollection({
        source: args.source as number, destination: args.destination as number, execute,
        ...(execute ? { idempotency_key: args.idempotency_key as string } : {}),
      }));
    },
  },
};
