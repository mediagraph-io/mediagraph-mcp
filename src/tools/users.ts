/**
 * User and organization tools
 */

import { idParam, paginationParams, successResult, errorResult, type ToolModule } from './shared.js';

export const userTools: ToolModule = {
  definitions: [
    {
      name: 'whoami',
      description: 'Get information about the currently authenticated user and organization',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'get_organization',
      description: 'Get details about an organization by ID',
      inputSchema: {
        type: 'object',
        properties: { id: idParam },
        required: ['id'],
      },
    },
    {
      name: 'find_organization',
      description: 'Find an organization by slug. Useful when you have a custom-domain URL or know the slug but not the id.',
      inputSchema: {
        type: 'object',
        properties: { slug: { type: 'string' } },
        required: ['slug'],
      },
    },
    {
      name: 'get_organization_abilities',
      description: 'Get the current user\'s role-derived abilities (manage Asset, view_details Tag, etc.) in an organization. Pair with INSUFFICIENT_SCOPE errors so you can distinguish role denial from missing token scope.',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },

    // ── Profile (current user's cross-org state) ─────────────────────────
    {
      name: 'list_my_organizations',
      description: 'List every organization the current user belongs to (across orgs). Useful for multi-tenant agents picking which org to operate in.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'list_my_invites',
      description: 'List pending org invitations addressed to the current user.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'accept_my_invite',
      description: 'Accept a pending org invitation by id.',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'get_my_otp_uri',
      description: 'Get the otpauth:// URI for setting up TOTP 2FA on the current user account (encode in a QR code).',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'enable_my_otp',
      description: 'Enable TOTP 2FA on the current user account by confirming a 6-digit code.',
      inputSchema: {
        type: 'object',
        properties: { otp_attempt: { type: 'string', description: '6-digit TOTP code from the authenticator app' } },
        required: ['otp_attempt'],
      },
    },
    {
      name: 'disable_my_otp',
      description: 'Disable TOTP 2FA on the current user account.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'list_memberships',
      description: 'List organization memberships',
      inputSchema: { type: 'object', properties: { ...paginationParams }, required: [] },
    },
    {
      name: 'get_membership',
      description: 'Get membership details by ID',
      inputSchema: { type: 'object', properties: { id: idParam }, required: ['id'] },
    },
    {
      name: 'update_membership',
      description: 'Update a membership',
      inputSchema: {
        type: 'object',
        properties: {
          id: idParam,
          role: { type: 'string', enum: ['admin', 'global_content', 'global_library', 'global_tagger', 'general', 'restricted'] },
        },
        required: ['id'],
      },
    },
    {
      name: 'reauthorize',
      description: 'Re-run the OAuth authorization flow. Use this to switch to a different Mediagraph organization or re-authenticate.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
  ],

  handlers: {
    async whoami(args, { client }) {
      return successResult(await client.whoami());
    },
    async get_organization(args, { client }) {
      return successResult(await client.getOrganization(args.id as number | string));
    },
    async find_organization(args, { client }) {
      return successResult(await client.findOrganization({ slug: args.slug as string }));
    },
    async get_organization_abilities(args, { client }) {
      return successResult(await client.getOrganizationAbilities(args.id as number | string));
    },
    async list_my_organizations(_args, { client }) {
      return successResult(await client.listMyOrganizations());
    },
    async list_my_invites(_args, { client }) {
      return successResult(await client.listMyInvites());
    },
    async accept_my_invite(args, { client }) {
      return successResult(await client.acceptMyInvite(args.id as number | string));
    },
    async get_my_otp_uri(_args, { client }) {
      return successResult(await client.getMyOtpUri());
    },
    async enable_my_otp(args, { client }) {
      return successResult(await client.enableMyOtp(args.otp_attempt as string));
    },
    async disable_my_otp(_args, { client }) {
      return successResult(await client.disableMyOtp());
    },
    async list_memberships(args, { client }) {
      return successResult(await client.listMemberships(args));
    },
    async get_membership(args, { client }) {
      return successResult(await client.getMembership(args.id as number | string));
    },
    async update_membership(args, { client }) {
      const { id, ...data } = args;
      return successResult(await client.updateMembership(id as number | string, data));
    },
    async reauthorize(_args, { reauthorize }) {
      if (!reauthorize) {
        return errorResult('Reauthorization is not available in this context.');
      }
      const result = await reauthorize();
      if (!result.success) {
        return errorResult('Re-authorization failed. Please complete the login in your browser and try again.');
      }
      return successResult(`Successfully re-authorized!\nOrganization: ${result.organizationName || 'Unknown'}\nUser: ${result.userEmail || 'Unknown'}`);
    },
  },
};
