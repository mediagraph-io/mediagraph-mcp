/**
 * Mediagraph API Client - Complete API Coverage
 */

import type {
  Asset,
  AssetDataVersion,
  AssetCountsResponse,
  SearchParams,
  SearchResponse,
  Collection,
  Lightbox,
  StorageFolder,
  AssetGroupTree,
  Tag,
  AutoTag,
  Taxonomy,
  TaxonomyTag,
  Tagging,
  CreatorTag,
  RightsPackage,
  Permission,
  ShareLink,
  Share,
  CollectionShare,
  AccessRequest,
  Upload,
  Contribution,
  CanUploadResponse,
  BulkJob,
  BulkJobQueuePosition,
  CustomMetaField,
  Workflow,
  WorkflowStep,
  Comment,
  Notification,
  NotificationCount,
  DownloadResponse,
  Download,
  Webhook,
  WebhookLog,
  UserGroup,
  Invite,
  FilterGroup,
  SearchQuery,
  CropPreset,
  Ingestion,
  MetaImport,
  PersonalAccessToken,
  FaceTagging,
  Membership,
  WhoamiResponse,
  ApiError,
  PaginationParams,
} from './types.js';

export type AuthCredentials =
  | { mode: 'bearer'; token: string }
  | { mode: 'basic'; pat: string; organizationId: number };

export interface MediagraphClientConfig {
  apiUrl?: string;
  /** Preferred: full auth resolver. Returns Bearer (OAuth) or Basic+OrgId (PAT). */
  getAuth?: () => Promise<AuthCredentials | null>;
  /** Legacy: bearer-token-only resolver. Used if `getAuth` is not provided. */
  getAccessToken?: () => Promise<string | null>;
  /** When true, request() throws DryRunIntercept describing the call instead of executing it. */
  dryRun?: boolean;
}

/** 403 envelope when the server's scope check rejects a request. */
export interface InsufficientScopeBody extends ApiError {
  error: 'insufficient_scope';
  reason?: 'scope' | 'admin_required';
  required?: string;
}

export class MediagraphApiError extends Error {
  /** Retry-After value (ms) on 429/503 — callers honor this for backoff. */
  public retryAfterMs?: number;
  /** True when the server set X-PAT-Disabled (PAT was disabled by an admin). */
  public patDisabled?: boolean;
  /** Method + path of the blocked request, when known. */
  public method?: string;
  public path?: string;

  constructor(
    public statusCode: number,
    public errorBody: ApiError,
  ) {
    super(errorBody.message || errorBody.error || 'API Error');
    this.name = 'MediagraphApiError';
  }

  /** True when the 403 body is the structured insufficient_scope envelope. */
  get insufficientScope(): boolean {
    return this.statusCode === 403 && this.errorBody.error === 'insufficient_scope';
  }
  get requiredScope(): string | undefined {
    return this.insufficientScope ? (this.errorBody as InsufficientScopeBody).required : undefined;
  }
  get scopeReason(): 'scope' | 'admin_required' | undefined {
    if (!this.insufficientScope) return undefined;
    const r = (this.errorBody as InsufficientScopeBody).reason;
    return r === 'admin_required' || r === 'scope' ? r : undefined;
  }
}

/** Maximum time we'll honor Retry-After before giving up on retries. */
const MAX_RETRY_DELAY_MS = 60_000;

/** Is an S3 PUT failure worth retrying? Network errors are; auth errors aren't. */
function isRetryableUploadError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  if (/Failed to upload to S3: (5\d\d|429)/.test(message)) return true;
  if (/ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|fetch failed|socket hang up/i.test(message)) return true;
  return false;
}

/**
 * Parse a Retry-After header value. RFC 7231 allows either delta-seconds or
 * an HTTP-date. Returns the delay in milliseconds, or undefined if unparseable.
 */
function parseRetryAfter(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  // delta-seconds: a non-negative integer
  if (/^\d+$/.test(trimmed)) {
    return Math.max(0, parseInt(trimmed, 10) * 1000);
  }
  // HTTP-date
  const ts = Date.parse(trimmed);
  if (Number.isFinite(ts)) {
    return Math.max(0, ts - Date.now());
  }
  return undefined;
}

export interface DryRunDescriptor {
  method: string;
  path: string;
  url: string;
  params?: Record<string, unknown>;
  body?: unknown;
}

export class DryRunIntercept extends Error {
  constructor(public readonly call: DryRunDescriptor) {
    super(`[dry-run] ${call.method} ${call.path}`);
    this.name = 'DryRunIntercept';
  }
}

export class MediagraphClient {
  private apiUrl: string;
  private resolveAuth: () => Promise<AuthCredentials | null>;
  private maxRetries = 3;
  private retryDelay = 1000;
  /** When true, request() throws DryRunIntercept instead of executing. */
  public dryRun: boolean;

  constructor(config: MediagraphClientConfig) {
    this.apiUrl = config.apiUrl || 'https://api.mediagraph.io';
    this.dryRun = config.dryRun ?? false;
    if (config.getAuth) {
      this.resolveAuth = config.getAuth;
    } else if (config.getAccessToken) {
      const legacy = config.getAccessToken;
      this.resolveAuth = async () => {
        const token = await legacy();
        return token ? { mode: 'bearer', token } : null;
      };
    } else {
      throw new Error('MediagraphClient requires getAuth or getAccessToken');
    }
  }

  private async request<T>(
    method: string,
    path: string,
    options: {
      params?: Record<string, unknown>;
      body?: unknown;
    } = {},
  ): Promise<T> {
    let url = `${this.apiUrl}${path}`;

    if (this.dryRun) {
      throw new DryRunIntercept({
        method,
        path,
        url,
        params: options.params,
        body: options.body,
      });
    }

    const auth = await this.resolveAuth();
    if (!auth) {
      throw new Error('Not authenticated. Please authorize with Mediagraph first.');
    }

    // Add query params for GET requests
    if (options.params && method === 'GET') {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            value.forEach((v) => searchParams.append(`${key}[]`, String(v)));
          } else {
            searchParams.append(key, String(value));
          }
        }
      }
      const queryString = searchParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        };
        if (auth.mode === 'bearer') {
          headers.Authorization = `Bearer ${auth.token}`;
        } else {
          headers.Authorization = `Basic ${Buffer.from(`:${auth.pat}`).toString('base64')}`;
          headers.OrganizationId = String(auth.organizationId);
        }

        const fetchOptions: RequestInit = {
          method,
          headers,
        };

        if (options.body && method !== 'GET') {
          fetchOptions.body = JSON.stringify(options.body);
        } else if (options.params && method !== 'GET') {
          fetchOptions.body = JSON.stringify(options.params);
        }

        const response = await fetch(url, fetchOptions);

        if (response.status === 401) {
          throw new MediagraphApiError(401, {
            error: 'unauthorized',
            message: 'Access token expired or invalid. Please re-authorize.',
          });
        }

        if (response.status === 403) {
          // Preserve the body so insufficient_scope envelopes survive — the
          // class derives `requiredScope`/`scopeReason` from it.
          let body: ApiError;
          try {
            body = (await response.json()) as ApiError;
          } catch {
            body = { error: 'forbidden', message: 'You do not have permission to perform this action.' };
          }
          const err = new MediagraphApiError(403, body);
          err.method = method;
          err.path = path;
          throw err;
        }

        if (response.status === 404) {
          throw new MediagraphApiError(404, {
            error: 'not_found',
            message: 'The requested resource was not found.',
          });
        }

        // 429 Too Many Requests + 503 Service Unavailable: both may carry a
        // Retry-After header. Honor it within sane bounds; back off otherwise.
        if (response.status === 429 || response.status === 503) {
          const retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'));
          const exponential = this.retryDelay * Math.pow(2, attempt);
          const delay = Math.min(retryAfterMs ?? exponential, MAX_RETRY_DELAY_MS);
          const isFinalAttempt = attempt >= this.maxRetries - 1;
          // If the server asks us to wait longer than we're willing to, or
          // we've used all our attempts, surface a structured error so the
          // CLI can render a useful hint instead of looping.
          if (isFinalAttempt || (retryAfterMs !== undefined && retryAfterMs > MAX_RETRY_DELAY_MS)) {
            const err = new MediagraphApiError(response.status, {
              error: response.status === 429 ? 'rate_limited' : 'service_unavailable',
              message: response.status === 429
                ? 'Rate limit exceeded.'
                : 'Service temporarily unavailable.',
            });
            err.retryAfterMs = retryAfterMs;
            throw err;
          }
          await this.sleep(delay);
          continue;
        }

        // Disabled PAT: the server still returns the response but flags it.
        // Surface as auth error so callers don't silently treat it as success.
        if (response.headers.get('X-PAT-Disabled')) {
          const note = response.headers.get('X-PAT-Disabled-Note') || undefined;
          const err = new MediagraphApiError(401, {
            error: 'pat_disabled',
            message: note ? `Personal Access Token is disabled: ${note}` : 'Personal Access Token is disabled.',
          });
          err.patDisabled = true;
          throw err;
        }

        if (!response.ok) {
          let errorBody: ApiError;
          try {
            errorBody = (await response.json()) as ApiError;
          } catch {
            errorBody = { error: 'unknown_error', message: response.statusText };
          }
          throw new MediagraphApiError(response.status, errorBody);
        }

        const contentType = response.headers.get('Content-Type');
        if (!contentType?.includes('application/json')) {
          return {} as T;
        }

        // Some endpoints (merge_into, etc.) return 200 with an empty body but
        // an `application/json` content-type. Read text first so empty bodies
        // resolve to `{}` instead of crashing in JSON.parse.
        const text = await response.text();
        if (!text) return {} as T;
        return JSON.parse(text) as T;
      } catch (error) {
        lastError = error as Error;

        // Don't retry these — they're either deterministic (auth/missing) or
        // already represent an exhausted retry budget that the inner code
        // chose to surface (429/503 with Retry-After above cap, final attempt).
        if (error instanceof MediagraphApiError && [401, 403, 404, 429, 503].includes(error.statusCode)) {
          throw error;
        }

        if (attempt < this.maxRetries - 1) {
          await this.sleep(this.retryDelay * Math.pow(2, attempt));
          continue;
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============================================================================
  // User & Organization
  // ============================================================================

  async whoami(): Promise<WhoamiResponse> {
    return this.request<WhoamiResponse>('GET', '/api/whoami');
  }

  async getOrganization(id: number | string): Promise<{ organization: Record<string, unknown> }> {
    return this.request('GET', `/api/organizations/${id}`);
  }

  async findOrganization(params: { slug?: string }): Promise<{ organization: Record<string, unknown> }> {
    return this.request('GET', '/api/organizations/find', { params });
  }

  /**
   * Get the current user's role-derived abilities in an organization
   * (manage Asset, view_details Tag, etc.). Pair with INSUFFICIENT_SCOPE
   * errors so an agent can distinguish role denial from missing token scope.
   */
  async getOrganizationAbilities(id: number | string): Promise<unknown> {
    return this.request('GET', `/api/organizations/${id}/abilities`);
  }

  // ============================================================================
  // Profile (current user's cross-org state)
  // ============================================================================

  async listMyOrganizations(): Promise<unknown[]> {
    return this.request<unknown[]>('GET', '/api/profile/organizations');
  }

  async listMyInvites(): Promise<unknown[]> {
    return this.request<unknown[]>('GET', '/api/profile/invites');
  }

  async acceptMyInvite(id: number | string): Promise<unknown> {
    return this.request('POST', `/api/profile/invites/${id}/accept`);
  }

  async getMyOtpUri(): Promise<{ uri: string }> {
    return this.request<{ uri: string }>('GET', '/api/profile/otp_uri');
  }

  async enableMyOtp(otpAttempt: string): Promise<unknown> {
    return this.request('POST', '/api/profile/enable_otp', { body: { otp_attempt: otpAttempt } });
  }

  async disableMyOtp(): Promise<unknown> {
    return this.request('POST', '/api/profile/disable_otp');
  }

  // ============================================================================
  // Memberships
  // ============================================================================

  async listMemberships(params?: PaginationParams): Promise<Membership[]> {
    return this.request<Membership[]>('GET', '/api/memberships', { params });
  }

  async getMembership(id: number | string): Promise<Membership> {
    return this.request<Membership>('GET', `/api/memberships/${id}`);
  }

  async updateMembership(id: number | string, data: Partial<Membership>): Promise<Membership> {
    return this.request<Membership>('PUT', `/api/memberships/${id}`, { body: { membership: data } });
  }

  async updateMembershipStatus(id: number | string, status: string): Promise<Membership> {
    return this.request<Membership>('PUT', `/api/memberships/${id}/update_status`, { body: { status } });
  }

  async deleteMembership(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/memberships/${id}`);
  }

  /** Find a single membership by username or user_id. */
  async findMembership(params: { username?: string; user_id?: number | string }): Promise<Membership> {
    return this.request<Membership>('GET', '/api/memberships/find', { params });
  }

  /**
   * Search memberships scoped to a commentable (collection / lightbox) context —
   * used for assignee pickers in commenting flows. Plain `q` query supported.
   */
  async searchMemberships(params: {
    q?: string;
    commentable_type?: 'Collection' | 'Lightbox';
    commentable_id?: number | string;
  } & PaginationParams): Promise<Membership[]> {
    return this.request<Membership[]>('GET', '/api/memberships/search', { params });
  }

  // ============================================================================
  // Membership Requests
  // ============================================================================

  async listMembershipRequests(params?: PaginationParams): Promise<unknown[]> {
    return this.request<unknown[]>('GET', '/api/membership_requests', { params });
  }

  async getMembershipRequestsPendingCount(): Promise<{ count: number }> {
    return this.request<{ count: number }>('GET', '/api/membership_requests/pending_count');
  }

  // ============================================================================
  // Assets
  // ============================================================================

  async searchAssets(params: SearchParams = {}): Promise<SearchResponse> {
    const apiParams: Record<string, unknown> = {
      page: params.page || 1,
      per_page: params.per_page || 25,
    };

    // Copy all search params
    const searchKeys: (keyof SearchParams)[] = [
      'q', 'ids', 'guids', 'upload_id', 'upload_guid', 'storage_folder_id',
      'omit_child_storage_folders', 'collection_id', 'omit_child_collections',
      'lightbox_id', 'omit_child_lightboxes', 'lightbox_folder_id',
      'omit_child_lightbox_folders', 'tags', 'hide_tags', 'taxonomy',
      'hide_taxonomy', 'taxonomy_filter_mode', 'exts', 'rating', 'rights',
      'rights_code', 'aspect', 'has_people', 'has_alt_text', 'file_size_range',
      'gps', 'bounds', 'captured_at', 'missing_captured_at', 'created_at',
      'updated_at', 'snapshot_timestamp', 'proximity_field', 'proximity_word_1',
      'proximity_word_2', 'proximity_max_gaps', 'user_ids', 'creator_ids',
      'include_totals', 'as_filters', 'include_renditions', 'include_meta',
    ];

    for (const key of searchKeys) {
      if (params[key] !== undefined) {
        apiParams[key] = params[key];
      }
    }

    const response = await this.request<{ assets: Asset[]; total?: number; aggs?: Record<string, unknown> }>(
      'GET',
      '/api/assets/search',
      { params: apiParams },
    );

    return {
      assets: response.assets || [],
      total: response.total || response.assets?.length || 0,
      page: params.page || 1,
      per_page: params.per_page || 25,
      total_pages: Math.ceil((response.total || response.assets?.length || 0) / (params.per_page || 25)),
      aggs: response.aggs,
    };
  }

  async getAsset(id: number | string, options?: { include_renditions?: boolean; include_meta?: boolean; sync?: boolean }): Promise<Asset> {
    const params: Record<string, unknown> = {};
    if (options?.include_renditions) params.include_renditions = true;
    if (options?.include_meta) params.include_meta = true;
    if (options?.sync) params.sync = true;
    return this.request<Asset>('GET', `/api/assets/${id}`, { params });
  }

  async updateAsset(id: number | string, data: Partial<Asset>): Promise<Asset> {
    return this.request<Asset>('PUT', `/api/assets/${id}`, { body: { asset: data } });
  }

  async deleteAsset(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/assets/${id}`);
  }

  async getAssetCounts(params?: SearchParams): Promise<AssetCountsResponse> {
    return this.request<AssetCountsResponse>('GET', '/api/assets/counts', { params });
  }

  async getTrashedAssets(params?: PaginationParams): Promise<Asset[]> {
    return this.request<Asset[]>('GET', '/api/assets/trashed', { params });
  }

  async getPopularAssets(params?: PaginationParams): Promise<Asset[]> {
    return this.request<Asset[]>('GET', '/api/assets/popular', { params });
  }

  async getUpdatedAssetsSinceLastSync(params?: { since?: string }): Promise<Asset[]> {
    return this.request<Asset[]>('GET', '/api/assets/updated_since_last_sync', { params });
  }

  async addTagsToAsset(id: number | string, tags: string[]): Promise<Asset> {
    return this.request<Asset>('PUT', `/api/assets/${id}/tag`, { body: { asset: { add_tag_names: tags } } });
  }

  async getAssetAutoTags(id: number | string): Promise<AutoTag[]> {
    return this.request<AutoTag[]>('GET', `/api/assets/${id}/auto_tags`);
  }

  async getAssetFaceTaggings(id: number | string): Promise<FaceTagging[]> {
    return this.request<FaceTagging[]>('GET', `/api/assets/${id}/face_taggings`);
  }

  async tagVideoFace(id: number | string, data: { person_index: number; name?: string; tag_id?: number }): Promise<unknown> {
    return this.request('POST', `/api/assets/${id}/tag_video_face`, { body: data });
  }

  async detectVideoFaces(id: number | string): Promise<unknown> {
    return this.request('POST', `/api/assets/${id}/detect_video_faces`);
  }

  /**
   * Manually tag a detected face crop in an image asset. Pair with a tag_id
   * for taxonomy-based people, or pass `name` to create a new person tag
   * inline. Indexes the face into Rekognition for org-wide face matching.
   */
  async tagAssetFace(id: number | string, data: { face_id: string; tag_id?: number; name?: string }): Promise<unknown> {
    return this.request('POST', `/api/assets/${id}/tag_face`, { body: data });
  }

  /** Run face search on an indexed asset; matches against org's face index. */
  async searchAssetFaces(id: number | string): Promise<unknown> {
    return this.request('POST', `/api/assets/${id}/search_faces`);
  }

  /** Block a detected face crop on an asset (creates a 'Blocked Face' tag). */
  async blockAssetFace(id: number | string, faceId: string): Promise<unknown> {
    return this.request('POST', `/api/assets/${id}/block_face`, { body: { face_id: faceId } });
  }

  /** Toggle ignore on a detected face id (per-asset hide). */
  async ignoreAssetFaceToggle(id: number | string, faceId: string): Promise<unknown> {
    return this.request('POST', `/api/assets/${id}/ignore_face_toggle`, { body: { face_id: faceId } });
  }

  /** Hide all unidentified faces on the asset. */
  async ignoreAssetUnidentifiedFaces(id: number | string): Promise<unknown> {
    return this.request('POST', `/api/assets/${id}/ignore_unidentified_faces`);
  }

  /**
   * Update a custom meta field value on an asset.
   *
   * Three field shapes:
   *   - free: pass `value` (or `text`) — any string
   *   - select (single): pass `custom_meta_value_id` — predefined value id
   *   - multi: pass `custom_meta_value_ids` — array of predefined value ids
   *
   * Pass no values to clear the field. The asset is reindexed on success.
   */
  async setAssetCustomMeta(
    id: number | string,
    data: {
      custom_meta_field_id: number | string;
      value?: string;
      text?: string;
      custom_meta_value_id?: number | string;
      custom_meta_value_ids?: Array<number | string>;
    },
  ): Promise<unknown> {
    const { custom_meta_value_ids, ...rest } = data;
    const body: Record<string, unknown> = { ...rest };
    if (custom_meta_value_ids !== undefined) body.custom_meta_value_id = custom_meta_value_ids;
    return this.request('PUT', `/api/assets/${id}/update_custom_meta`, { body });
  }

  async explainAssetSearch(id: number | string, params?: { q?: string; text_q?: string }): Promise<unknown> {
    return this.request('GET', `/api/assets/${id}/search_explain`, { params });
  }

  async deletePublishedImage(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/published_images/${id}`);
  }

  // ============================================================================
  // Bulk asset operations (collection routes — operate on many assets at once)
  // ============================================================================

  async bulkEditAssets(data: { asset_ids: number[]; updates: Record<string, unknown> }): Promise<unknown> {
    return this.request('POST', '/api/assets/bulk_edit', { body: data });
  }

  async bulkAddTagsToAssets(assetIds: number[], tagNames: string[]): Promise<unknown> {
    return this.request('POST', '/api/assets/add_tags', { body: { asset_ids: assetIds, tag_names: tagNames } });
  }

  async bulkRemoveTagsFromAssets(assetIds: number[], tagNames: string[]): Promise<unknown> {
    return this.request('POST', '/api/assets/remove_tags', { body: { asset_ids: assetIds, tag_names: tagNames } });
  }

  async bulkSetAssetRightsPackage(assetIds: number[], rightsPackageId: number | null): Promise<unknown> {
    return this.request('POST', '/api/assets/set_rights_package', { body: { asset_ids: assetIds, rights_package_id: rightsPackageId } });
  }

  async bulkSetAssetCreatorTag(assetIds: number[], creatorTagId: number | null): Promise<unknown> {
    return this.request('POST', '/api/assets/set_creator_tag', { body: { asset_ids: assetIds, creator_tag_id: creatorTagId } });
  }

  async removeAssetsFromGroup(assetIds: number[], assetGroupId: number): Promise<unknown> {
    return this.request('POST', '/api/assets/remove_group', { body: { asset_ids: assetIds, asset_group_id: assetGroupId } });
  }

  // ============================================================================
  // Asset enrichment / AI / lifecycle
  // ============================================================================

  async autoTagAsset(id: number | string): Promise<unknown> {
    return this.request('POST', `/api/assets/${id}/auto_tag`);
  }

  async removeAssetAutoTag(id: number | string, autoTagId: number): Promise<unknown> {
    return this.request('DELETE', `/api/assets/${id}/remove_auto_tag`, { params: { auto_tag_id: autoTagId } });
  }

  async generateAssetAltText(id: number | string): Promise<unknown> {
    return this.request('POST', `/api/assets/${id}/generate_alt_text`);
  }

  async runAssetAi(id: number | string, customMetaFieldId: number): Promise<unknown> {
    return this.request('POST', `/api/assets/${id}/run_ai`, { body: { custom_meta_field_id: customMetaFieldId } });
  }

  async clearAssetNsfw(id: number | string): Promise<unknown> {
    return this.request('PUT', `/api/assets/${id}/clear_nsfw`);
  }

  async restoreAsset(id: number | string): Promise<unknown> {
    return this.request('POST', `/api/assets/${id}/restore`);
  }

  async getAssetMeta(id: number | string): Promise<unknown> {
    return this.request('GET', `/api/assets/${id}/meta`);
  }

  async getAssetContent(id: number | string): Promise<unknown> {
    return this.request('GET', `/api/assets/${id}/content`);
  }

  async getAssetOcrContent(id: number | string): Promise<unknown> {
    return this.request('GET', `/api/assets/${id}/ocr_content`);
  }

  async updateAssetDescription(id: number | string, description: string): Promise<unknown> {
    return this.request('PUT', `/api/assets/${id}/update_description`, { body: { description } });
  }

  async getAssetDownload(id: number | string, options?: {
    size?: string;
    watermarked?: boolean;
    version_number?: number;
    via?: string;
    skip_meta?: boolean;
  }): Promise<DownloadResponse> {
    // Use the Prepare Download flow to get a secure token
    // POST /api/downloads → { token, filename }
    // Then the client can open GET /api/downloads/{token} without exposing access_token
    const prepareResponse = await this.createDownload({
      asset_ids: [typeof id === 'string' ? parseInt(id, 10) : id],
      size: options?.size || 'original',
      watermarked: options?.watermarked,
      via: options?.via,
      skip_meta: options?.skip_meta,
    });

    // Build the download URL using the token
    const downloadUrl = `${this.apiUrl}/api/downloads/${prepareResponse.token}`;

    return {
      url: downloadUrl,
      filename: prepareResponse.filename || `asset-${id}`,
    };
  }

  async getBulkDownload(options: {
    asset_ids: number[];
    size?: string;
    watermarked?: boolean;
    via?: string;
    skip_meta?: boolean;
  }): Promise<DownloadResponse> {
    // Use the Prepare Download flow to get a secure token
    // For multiple assets, the download will be a ZIP file
    const prepareResponse = await this.createDownload({
      asset_ids: options.asset_ids,
      size: options.size || 'original',
      watermarked: options.watermarked,
      via: options.via,
      skip_meta: options.skip_meta,
    });

    // Build the download URL using the token
    const downloadUrl = `${this.apiUrl}/api/downloads/${prepareResponse.token}`;

    return {
      url: downloadUrl,
      filename: prepareResponse.filename || `mediagraph-download-${options.asset_ids.length}-assets.zip`,
    };
  }

  async addAssetVersion(id: number | string, data: { filename: string; content_type: string; file_size: number }): Promise<{ signed_upload_url: string; asset_data_version: AssetDataVersion }> {
    return this.request('POST', `/api/assets/${id}/add_version`, { body: data });
  }

  // ── Video editing (slice clips out of an existing video asset) ──────
  async sliceNewAssetVersion(id: number | string, startSeconds: number, endSeconds: number): Promise<unknown> {
    return this.request('POST', `/api/assets/${id}/slice_new_version`, { body: { start: startSeconds, end: endSeconds } });
  }

  async sliceNewAsset(id: number | string, data: { start: number; end: number; lightbox_id?: number }): Promise<unknown> {
    return this.request('POST', `/api/assets/${id}/slice_new_asset`, { body: data });
  }

  async setAssetPreviewImageFromTime(id: number | string, seconds: number): Promise<Asset> {
    return this.request<Asset>('PUT', `/api/assets/${id}/set_preview_image_from_time`, { body: { seconds } });
  }

  async uploadAssetTranscript(id: number | string, transcript: string): Promise<unknown> {
    return this.request('PUT', `/api/assets/${id}/upload_transcript`, { body: { transcript } });
  }

  // ── Search-adjacent asset reads ─────────────────────────────────────
  async getSelectedAssets(params: { ids: number[] } & Record<string, unknown>): Promise<unknown> {
    // POST /api/assets/selected — like search but for an explicit ID set.
    return this.request('POST', '/api/assets/selected', { body: params });
  }

  async getAssetsUpdatedSinceLastSync(params?: {
    last_sync_at?: string | number;
    any_user?: boolean;
    created_via?: string;
  }): Promise<number[]> {
    return this.request<number[]>('GET', '/api/assets/updated_since_last_sync', { params });
  }

  async getAssetEventLog(id: number | string, params?: PaginationParams): Promise<unknown> {
    return this.request('GET', `/api/assets/${id}/log`, { params });
  }

  async getAssetAddedBy(id: number | string, assetGroupId: number): Promise<unknown> {
    return this.request('GET', `/api/assets/${id}/added_by`, { params: { asset_group_id: assetGroupId } });
  }

  async revertAsset(id: number | string, version: number): Promise<Asset> {
    return this.request<Asset>('POST', `/api/assets/${id}/revert`, { body: { version } });
  }

  async requestAssetOptimization(id: number | string): Promise<Asset> {
    return this.request<Asset>('POST', `/api/assets/${id}/request_optimization`);
  }

  async completeAssetOptimization(id: number | string): Promise<Asset> {
    return this.request<Asset>('POST', `/api/assets/${id}/complete_optimization`);
  }

  async removeAssetOptimizationRequest(id: number | string): Promise<Asset> {
    return this.request<Asset>('POST', `/api/assets/${id}/remove_optimization_request`);
  }

  async updateAssetCollectiveWork(id: number | string, data: Record<string, unknown>): Promise<Asset> {
    return this.request<Asset>('PUT', `/api/assets/${id}/update_collective_work`, { body: data });
  }

  async addAssetsToGroup(assetIds: number[], groupId: number): Promise<void> {
    await this.request<void>('POST', '/api/assets/add_group', {
      body: {
        ids: assetIds,
        asset_group_id: groupId,
      },
    });
  }

  // ============================================================================
  // Asset Data Versions
  // ============================================================================

  async getAssetDataVersions(assetId: number | string): Promise<AssetDataVersion[]> {
    return this.request<AssetDataVersion[]>('GET', `/api/assets/${assetId}/asset_data_versions`);
  }

  async getAssetDataVersion(assetId: number | string, versionNumber: number): Promise<AssetDataVersion> {
    return this.request<AssetDataVersion>('GET', `/api/assets/${assetId}/asset_data_versions/${versionNumber}`);
  }

  // ============================================================================
  // Collections
  // ============================================================================

  async listCollections(params?: PaginationParams & { parent_id?: number }): Promise<Collection[]> {
    return this.request<Collection[]>('GET', '/api/collections', { params });
  }

  async getCollection(id: number | string): Promise<Collection> {
    return this.request<Collection>('GET', `/api/collections/${id}`);
  }

  async createCollection(data: { name: string; description?: string; parent_id?: number }): Promise<Collection> {
    return this.request<Collection>('POST', '/api/collections', { body: { collection: data } });
  }

  async updateCollection(id: number | string, data: Partial<Collection>): Promise<Collection> {
    return this.request<Collection>('PUT', `/api/collections/${id}`, { body: { collection: data } });
  }

  async deleteCollection(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/collections/${id}`);
  }

  async findCollection(params: { slug?: string; path?: string }): Promise<Collection> {
    return this.request<Collection>('GET', '/api/collections/find', { params });
  }

  async getCollectionsTree(): Promise<AssetGroupTree[]> {
    return this.request<AssetGroupTree[]>('GET', '/api/collections/tree');
  }

  async getCollectionVisibleAssetCounts(ids: number[]): Promise<Record<number, number>> {
    return this.request<Record<number, number>>('POST', '/api/collections/visible_asset_counts', {
      body: { asset_groups: ids.map(id => ({ id })) },
    });
  }

  async addAssetToCollection(collectionId: number | string, assetId: number | string): Promise<void> {
    await this.request<void>('POST', `/api/collections/${collectionId}/add_asset`, { body: { asset_id: assetId } });
  }

  // ============================================================================
  // Lightboxes
  // ============================================================================

  async listLightboxes(params?: PaginationParams & { parent_id?: number }): Promise<Lightbox[]> {
    return this.request<Lightbox[]>('GET', '/api/lightboxes', { params });
  }

  async getLightbox(id: number | string): Promise<Lightbox> {
    return this.request<Lightbox>('GET', `/api/lightboxes/${id}`);
  }

  async createLightbox(data: { name: string; description?: string; parent_id?: number }): Promise<Lightbox> {
    return this.request<Lightbox>('POST', '/api/lightboxes', { body: { lightbox: data } });
  }

  async updateLightbox(id: number | string, data: Partial<Lightbox>): Promise<Lightbox> {
    return this.request<Lightbox>('PUT', `/api/lightboxes/${id}`, { body: { lightbox: data } });
  }

  async deleteLightbox(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/lightboxes/${id}`);
  }

  async getLightboxesTree(): Promise<AssetGroupTree[]> {
    return this.request<AssetGroupTree[]>('GET', '/api/lightboxes/tree');
  }

  async transferLightboxOwnership(id: number | string, userId: number): Promise<Lightbox> {
    return this.request<Lightbox>('POST', `/api/lightboxes/${id}/transfer_ownership`, { body: { user_id: userId } });
  }

  /**
   * Apply a lightbox membership's pinned-assets snapshot to all members
   * (creates per-user copies). Used for sharing curated picks.
   */
  async applyLightboxMembershipAssets(membershipId: number, assetIds: number[]): Promise<unknown> {
    return this.request('POST', '/api/lightboxes/apply_asset_group_membership_assets', {
      body: { asset_group_membership_id: membershipId, asset_ids: assetIds },
    });
  }

  async removeLightboxMembershipAssets(membershipId: number, assetIds: number[]): Promise<unknown> {
    return this.request('POST', '/api/lightboxes/remove_asset_group_membership_assets', {
      body: { asset_group_membership_id: membershipId, asset_ids: assetIds },
    });
  }

  async addAssetToLightbox(lightboxId: number | string, assetId: number | string): Promise<void> {
    // Lightboxes don't have a direct add_asset endpoint - use the assets/add_group endpoint
    await this.addAssetsToGroup([Number(assetId)], Number(lightboxId));
  }

  // ============================================================================
  // Storage Folders
  // ============================================================================

  async listStorageFolders(params?: PaginationParams & { parent_id?: number }): Promise<StorageFolder[]> {
    return this.request<StorageFolder[]>('GET', '/api/storage_folders', { params });
  }

  async getStorageFolder(id: number | string): Promise<StorageFolder> {
    return this.request<StorageFolder>('GET', `/api/storage_folders/${id}`);
  }

  async createStorageFolder(data: { name: string; description?: string; parent_id?: number }): Promise<StorageFolder> {
    return this.request<StorageFolder>('POST', '/api/storage_folders', { body: { storage_folder: data } });
  }

  async updateStorageFolder(id: number | string, data: Partial<StorageFolder>): Promise<StorageFolder> {
    return this.request<StorageFolder>('PUT', `/api/storage_folders/${id}`, { body: { storage_folder: data } });
  }

  async deleteStorageFolder(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/storage_folders/${id}`);
  }

  async getStorageFoldersTree(): Promise<AssetGroupTree[]> {
    return this.request<AssetGroupTree[]>('GET', '/api/storage_folders/tree');
  }

  async getStorageFolderAssetIds(id: number | string): Promise<number[]> {
    return this.request<number[]>('GET', `/api/storage_folders/${id}/asset_ids`);
  }

  // ============================================================================
  // Tags
  // ============================================================================

  async listTags(params?: PaginationParams & { q?: string; tag_import_id?: number }): Promise<Tag[]> {
    return this.request<Tag[]>('GET', '/api/tags', { params });
  }

  async checkTagName(name: string): Promise<{ exists: boolean }> {
    return this.request<{ exists: boolean }>('GET', '/api/tags/check_name', { params: { name } });
  }

  async getTag(id: number | string): Promise<Tag> {
    return this.request<Tag>('GET', `/api/tags/${id}`);
  }

  async createTag(data: Partial<Tag> & { name: string; parent_id?: number }): Promise<Tag> {
    return this.request<Tag>('POST', '/api/tags', { body: { tag: data } });
  }

  async updateTag(id: number | string, data: Partial<Tag>): Promise<Tag> {
    return this.request<Tag>('PUT', `/api/tags/${id}`, { body: { tag: data } });
  }

  async deleteTag(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/tags/${id}`);
  }

  async bulkFindTags(names: string[]): Promise<Tag[]> {
    return this.request<Tag[]>('POST', '/api/tags/bulk_find', { body: { names } });
  }

  async addTagToTaxonomy(id: number | string, taxonomyId: number): Promise<Tag> {
    return this.request<Tag>('PUT', `/api/tags/${id}/add_taxonomy`, { body: { taxonomy_id: taxonomyId } });
  }

  /**
   * Merge `id` into `targetTagId`. When `setSynonym` is true, the source tag
   * is preserved as a synonym pointing at the target instead of being
   * deleted — taggings still move to the target.
   */
  async mergeTagInto(id: number | string, targetTagId: number, setSynonym?: boolean): Promise<void> {
    const body: Record<string, unknown> = { tag_2_id: targetTagId };
    if (setSynonym) body.set_synonym = true;
    await this.request<void>('POST', `/api/tags/${id}/merge_into`, { body });
  }

  /** Clear face-tagging state on a person tag and re-enqueue indexing. */
  async resetTagFace(id: number | string): Promise<void> {
    await this.request<void>('POST', `/api/tags/${id}/reset_face`);
  }

  async getTagEvents(params?: PaginationParams): Promise<unknown[]> {
    return this.request<unknown[]>('GET', '/api/tags/events', { params });
  }

  async getRecentTagEvents(): Promise<unknown[]> {
    return this.request<unknown[]>('GET', '/api/tags/recent_events');
  }

  /** POST /api/tags/:id/remove_taxonomies — detach tag from all taxonomies. */
  async removeTagTaxonomies(id: number | string): Promise<unknown> {
    return this.request('POST', `/api/tags/${id}/remove_taxonomies`);
  }

  /** Bulk operation across many tags (set list, add/remove taxonomy, etc.). */
  async bulkUpdateTags(data: {
    tag_ids: number[];
    list?: 'searchable' | 'visible' | 'blocked';
    add_taxonomy?: boolean;
    remove_taxonomy?: boolean;
  }): Promise<unknown> {
    return this.request('POST', '/api/tags/bulk', { body: data });
  }

  async bulkDestroyTags(ids: number[]): Promise<unknown> {
    return this.request('DELETE', '/api/tags/bulk_destroy', { body: { ids } });
  }

  // ── Tag → face linkage (associate person tags with users / creators) ──
  async getTagAssociatedFaces(id: number | string): Promise<unknown> {
    return this.request('GET', `/api/tags/${id}/associated_faces`);
  }
  async setTagFaceMembership(id: number | string, email: string): Promise<unknown> {
    return this.request('POST', `/api/tags/${id}/set_face_membership`, { body: { email } });
  }
  async removeTagFaceMembership(id: number | string): Promise<unknown> {
    return this.request('POST', `/api/tags/${id}/remove_face_membership`);
  }
  async setTagFaceCreatorTag(id: number | string, name: string): Promise<unknown> {
    return this.request('POST', `/api/tags/${id}/set_face_creator_tag`, { body: { name } });
  }
  async removeTagFaceCreatorTag(id: number | string): Promise<unknown> {
    return this.request('POST', `/api/tags/${id}/remove_face_creator_tag`);
  }

  // ============================================================================
  // Auto Tags
  // ============================================================================

  async listAutoTags(params?: PaginationParams & { q?: string }): Promise<AutoTag[]> {
    return this.request<AutoTag[]>('GET', '/api/auto_tags', { params });
  }

  async getAutoTag(id: number | string): Promise<AutoTag> {
    return this.request<AutoTag>('GET', `/api/auto_tags/${id}`);
  }

  async bulkFindAutoTags(tagNames: string[]): Promise<AutoTag[]> {
    return this.request<AutoTag[]>('POST', '/api/auto_tags/bulk_find', { body: { tag_names: tagNames } });
  }

  async deleteAutoTag(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/auto_tags/${id}`);
  }

  // ============================================================================
  // Taggings
  // ============================================================================

  async getTagging(id: number | string): Promise<Tagging> {
    return this.request<Tagging>('GET', `/api/taggings/${id}`);
  }

  async deleteTagging(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/taggings/${id}`);
  }

  /** Promote a tagging to the canonical face for its tag (used in face-recognition flows). */
  async setMainFaceForTagging(id: number | string): Promise<unknown> {
    return this.request('POST', `/api/taggings/${id}/set_main_face`);
  }

  /** Associate a tagging with a Rekognition face id (link an existing tagging to a detected face). */
  async associateTaggingWithFace(id: number | string, faceId: string): Promise<unknown> {
    return this.request('POST', `/api/taggings/${id}/associate_with_face`, { body: { face_id: faceId } });
  }

  async disassociateTaggingWithFace(id: number | string): Promise<unknown> {
    return this.request('POST', `/api/taggings/${id}/disassociate_with_face`);
  }

  // ============================================================================
  // Taxonomies
  // ============================================================================

  async listTaxonomies(params?: PaginationParams): Promise<Taxonomy[]> {
    return this.request<Taxonomy[]>('GET', '/api/taxonomies', { params });
  }

  async getTaxonomy(id: number | string): Promise<Taxonomy> {
    return this.request<Taxonomy>('GET', `/api/taxonomies/${id}`);
  }

  async createTaxonomy(data: { name: string; description?: string }): Promise<Taxonomy> {
    return this.request<Taxonomy>('POST', '/api/taxonomies', { body: { taxonomy: data } });
  }

  async updateTaxonomy(id: number | string, data: Partial<Taxonomy>): Promise<Taxonomy> {
    return this.request<Taxonomy>('PUT', `/api/taxonomies/${id}`, { body: { taxonomy: data } });
  }

  async deleteTaxonomy(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/taxonomies/${id}`);
  }

  // ============================================================================
  // Taxonomy Tags
  // ============================================================================

  async listTaxonomyTags(taxonomyId: number | string, params?: PaginationParams & { parent_id?: number }): Promise<TaxonomyTag[]> {
    return this.request<TaxonomyTag[]>('GET', `/api/taxonomies/${taxonomyId}/taxonomy_tags`, { params });
  }

  async getTaxonomyTag(taxonomyId: number | string, id: number | string): Promise<TaxonomyTag> {
    return this.request<TaxonomyTag>('GET', `/api/taxonomies/${taxonomyId}/taxonomy_tags/${id}`);
  }

  async createTaxonomyTag(taxonomyId: number | string, data: { name: string; parent_id?: number }): Promise<TaxonomyTag> {
    return this.request<TaxonomyTag>('POST', `/api/taxonomies/${taxonomyId}/taxonomy_tags`, { body: { taxonomy_tag: data } });
  }

  async updateTaxonomyTag(taxonomyId: number | string, id: number | string, data: Partial<TaxonomyTag>): Promise<TaxonomyTag> {
    return this.request<TaxonomyTag>('PUT', `/api/taxonomies/${taxonomyId}/taxonomy_tags/${id}`, { body: { taxonomy_tag: data } });
  }

  async deleteTaxonomyTag(taxonomyId: number | string, id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/taxonomies/${taxonomyId}/taxonomy_tags/${id}`);
  }

  async getTaxonomyTagsTree(taxonomyId: number | string): Promise<AssetGroupTree[]> {
    return this.request<AssetGroupTree[]>('GET', `/api/taxonomies/${taxonomyId}/taxonomy_tags/tree`);
  }

  async getTaxonomyTagsVisibleAssetCounts(taxonomyId: number | string, taxonomyTagIds: number[]): Promise<unknown> {
    return this.request('POST', `/api/taxonomies/${taxonomyId}/taxonomy_tags/visible_asset_counts`, { body: { ids: taxonomyTagIds } });
  }

  async bulkFindTaxonomyTags(names: string[]): Promise<TaxonomyTag[]> {
    return this.request<TaxonomyTag[]>('POST', '/api/taxonomy_tags/bulk_find', { body: { names } });
  }

  // ============================================================================
  // Creator Tags
  // ============================================================================

  async listCreatorTags(params?: PaginationParams & { q?: string }): Promise<CreatorTag[]> {
    return this.request<CreatorTag[]>('GET', '/api/creator_tags', { params });
  }

  async getCreatorTag(id: number | string): Promise<CreatorTag> {
    return this.request<CreatorTag>('GET', `/api/creator_tags/${id}`);
  }

  async createCreatorTag(data: { name: string }): Promise<CreatorTag> {
    return this.request<CreatorTag>('POST', '/api/creator_tags', { body: { creator_tag: data } });
  }

  async updateCreatorTag(id: number | string, data: Partial<CreatorTag>): Promise<CreatorTag> {
    return this.request<CreatorTag>('PUT', `/api/creator_tags/${id}`, { body: { creator_tag: data } });
  }

  async deleteCreatorTag(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/creator_tags/${id}`);
  }

  async findCreatorTag(params: { name?: string }): Promise<CreatorTag> {
    return this.request<CreatorTag>('GET', '/api/creator_tags/find', { params });
  }

  // ============================================================================
  // Rights Packages
  // ============================================================================

  async listRightsPackages(params?: PaginationParams): Promise<RightsPackage[]> {
    return this.request<RightsPackage[]>('GET', '/api/rights_packages', { params });
  }

  async getRightsPackage(id: number | string): Promise<RightsPackage> {
    return this.request<RightsPackage>('GET', `/api/rights_packages/${id}`);
  }

  async createRightsPackage(data: Partial<RightsPackage>): Promise<RightsPackage> {
    return this.request<RightsPackage>('POST', '/api/rights_packages', { body: { rights_package: data } });
  }

  async updateRightsPackage(id: number | string, data: Partial<RightsPackage>): Promise<RightsPackage> {
    return this.request<RightsPackage>('PUT', `/api/rights_packages/${id}`, { body: { rights_package: data } });
  }

  async deleteRightsPackage(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/rights_packages/${id}`);
  }

  async bulkFindRightsPackages(ids: number[]): Promise<RightsPackage[]> {
    return this.request<RightsPackage[]>('POST', '/api/rights_packages/bulk_find', { body: { ids } });
  }

  // ============================================================================
  // Permissions
  // ============================================================================

  async listPermissions(params?: PaginationParams): Promise<Permission[]> {
    return this.request<Permission[]>('GET', '/api/permissions', { params });
  }

  async getPermission(id: number | string): Promise<Permission> {
    return this.request<Permission>('GET', `/api/permissions/${id}`);
  }

  async createPermission(data: Partial<Permission>): Promise<Permission> {
    return this.request<Permission>('POST', '/api/permissions', { body: { permission: data } });
  }

  async updatePermission(id: number | string, data: Partial<Permission>): Promise<Permission> {
    return this.request<Permission>('PUT', `/api/permissions/${id}`, { body: { permission: data } });
  }

  async deletePermission(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/permissions/${id}`);
  }

  // ============================================================================
  // Share Links
  // ============================================================================

  async listShareLinks(params?: PaginationParams): Promise<ShareLink[]> {
    return this.request<ShareLink[]>('GET', '/api/share_links', { params });
  }

  async getShareLink(id: number | string): Promise<ShareLink> {
    return this.request<ShareLink>('GET', `/api/share_links/${id}`);
  }

  async createShareLink(assetGroupId: number | string, data?: {
    enabled?: boolean;
    image_and_video_permission?: string;
    other_permission?: string;
    watermark_all?: boolean;
    note?: string;
    expires?: boolean;
    expires_at?: string;
  }): Promise<ShareLink> {
    return this.request<ShareLink>('POST', `/api/asset_groups/${assetGroupId}/share_links`, {
      body: data ? { share_link: data } : undefined,
    });
  }

  async updateShareLink(id: number | string, data: Partial<ShareLink>): Promise<ShareLink> {
    return this.request<ShareLink>('PUT', `/api/share_links/${id}`, { body: { share_link: data } });
  }

  async deleteShareLink(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/share_links/${id}`);
  }

  async getAssetGroupShareLinks(assetGroupId: number | string): Promise<ShareLink[]> {
    return this.request<ShareLink[]>('GET', `/api/asset_groups/${assetGroupId}/share_links`);
  }

  // ============================================================================
  // Shares
  // ============================================================================

  async listShares(params?: PaginationParams): Promise<Share[]> {
    return this.request<Share[]>('GET', '/api/shares', { params });
  }

  async getShare(id: number | string): Promise<Share> {
    return this.request<Share>('GET', `/api/shares/${id}`);
  }

  async createShare(data: Partial<Share>): Promise<Share> {
    return this.request<Share>('POST', '/api/shares', { body: { share: data } });
  }

  async deleteShare(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/shares/${id}`);
  }

  async getShareStatus(id: number | string): Promise<{ aasm_state: string; progress?: number; code?: string; url?: string; direct_link?: string }> {
    return this.request('GET', `/api/shares/${id}/status`);
  }

  async getShareHtml(id: number | string): Promise<unknown> {
    return this.request('GET', `/api/shares/${id}/html`);
  }

  async getShareAssets(id: number | string, params?: PaginationParams): Promise<unknown> {
    return this.request('GET', `/api/shares/${id}/assets`, { params });
  }

  // ============================================================================
  // Collection Shares
  // ============================================================================

  async listCollectionShares(params?: PaginationParams): Promise<CollectionShare[]> {
    return this.request<CollectionShare[]>('GET', '/api/collection_shares', { params });
  }

  async getCollectionShare(id: number | string): Promise<CollectionShare> {
    return this.request<CollectionShare>('GET', `/api/collection_shares/${id}`);
  }

  async createCollectionShare(data: Partial<CollectionShare>): Promise<CollectionShare> {
    return this.request<CollectionShare>('POST', '/api/collection_shares', { body: { collection_share: data } });
  }

  async deleteCollectionShare(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/collection_shares/${id}`);
  }

  async getCollectionSharesTree(): Promise<AssetGroupTree[]> {
    return this.request<AssetGroupTree[]>('GET', '/api/collection_shares/tree');
  }

  // ============================================================================
  // Access Requests
  // ============================================================================

  async listAccessRequests(params?: PaginationParams & { type?: 'grant' | 'request'; aasm_state?: string; submitted?: string }): Promise<AccessRequest[]> {
    return this.request<AccessRequest[]>('GET', '/api/access_requests', { params });
  }

  async getAccessRequest(id: number | string): Promise<AccessRequest> {
    return this.request<AccessRequest>('GET', `/api/access_requests/${id}`);
  }

  async createAccessRequest(data: Partial<AccessRequest>): Promise<AccessRequest> {
    return this.request<AccessRequest>('POST', '/api/access_requests', { body: { access_request: data } });
  }

  async updateAccessRequest(id: number | string, data: Partial<AccessRequest>): Promise<AccessRequest> {
    return this.request<AccessRequest>('PUT', `/api/access_requests/${id}`, { body: { access_request: data } });
  }

  async deleteAccessRequest(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/access_requests/${id}`);
  }

  async submitAccessRequest(id: number | string): Promise<AccessRequest> {
    return this.request<AccessRequest>('POST', `/api/access_requests/${id}/submit`);
  }

  async findAccessRequest(params: { guid?: string }): Promise<AccessRequest> {
    return this.request<AccessRequest>('GET', '/api/access_requests/find', { params });
  }

  async getAccessRequestsTree(): Promise<AssetGroupTree[]> {
    return this.request<AssetGroupTree[]>('GET', '/api/access_requests/tree');
  }

  /** Admin: finalize a submitted access request (approves and grants access). */
  async finalizeAccessRequest(id: number | string): Promise<AccessRequest> {
    return this.request<AccessRequest>('POST', `/api/access_requests/${id}/finalize`);
  }

  /** Admin: revoke a previously granted access request. */
  async revokeAccessRequest(id: number | string): Promise<AccessRequest> {
    return this.request<AccessRequest>('POST', `/api/access_requests/${id}/revoke`);
  }

  /** Guest: record agreement to terms / NDA on an access request. */
  async agreeToAccessRequest(id: number | string): Promise<AccessRequest> {
    return this.request<AccessRequest>('POST', `/api/access_requests/${id}/agree`);
  }

  /** Set a custom meta value on an access request (mirrors the asset endpoint). */
  async setAccessRequestCustomMeta(
    id: number | string,
    data: {
      custom_meta_field_id: number | string;
      value?: string;
      text?: string;
      custom_meta_value_id?: number | string;
      custom_meta_value_ids?: Array<number | string>;
    },
  ): Promise<unknown> {
    const { custom_meta_value_ids, ...rest } = data;
    const body: Record<string, unknown> = { ...rest };
    if (custom_meta_value_ids !== undefined) body.custom_meta_value_id = custom_meta_value_ids;
    return this.request('PUT', `/api/access_requests/${id}/update_custom_meta`, { body });
  }

  // ============================================================================
  // Access Grants
  // ============================================================================

  async listAccessGrants(params?: PaginationParams): Promise<unknown[]> {
    return this.request<unknown[]>('GET', '/api/access_grants', { params });
  }

  async deleteAccessGrant(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/access_grants/${id}`);
  }

  // ============================================================================
  // Uploads
  // ============================================================================

  async listUploads(params?: PaginationParams): Promise<Upload[]> {
    return this.request<Upload[]>('GET', '/api/uploads', { params });
  }

  async getUpload(guidOrId: string | number): Promise<Upload> {
    return this.request<Upload>('GET', `/api/uploads/${guidOrId}`);
  }

  async createUpload(data?: { name?: string; note?: string; default_rights_package_id?: number }): Promise<Upload> {
    return this.request<Upload>('POST', '/api/uploads', data ? { body: { upload: data } } : undefined);
  }

  /**
   * Create upload session from a contribution - assets will go to the contribution's configured destination
   */
  async createUploadFromContribution(
    contributionId: number | string,
    data?: { name?: string; note?: string; default_rights_package_id?: number },
  ): Promise<Upload> {
    return this.request<Upload>('POST', `/api/contributions/${contributionId}/uploads`, data ? { body: { upload: data } } : undefined);
  }

  async getUploadAssets(guid: string, params?: PaginationParams): Promise<Asset[]> {
    return this.request<Asset[]>('GET', `/api/uploads/${guid}/assets`, { params });
  }

  async addAssetsToUpload(guid: string, assetIds: number[]): Promise<void> {
    await this.request<void>('POST', `/api/uploads/${guid}/assets`, { body: { asset_ids: assetIds } });
  }

  /**
   * Prepare an asset for upload - returns a signed URL for direct S3 upload
   */
  async prepareAssetUpload(
    uploadGuid: string,
    data: {
      filename: string;
      file_size: number;
      path?: string;
      created_via?: string;
      created_via_id?: string;
    },
  ): Promise<Asset & { signed_upload_url: string }> {
    return this.request<Asset & { signed_upload_url: string }>('POST', `/api/uploads/${uploadGuid}/assets`, {
      body: { asset: data },
    });
  }

  /**
   * Mark an asset as uploaded (triggers processing)
   */
  async setAssetUploaded(assetGuid: string, skipMeta?: boolean): Promise<Asset> {
    const params = skipMeta ? { skip_meta: 'true' } : undefined;
    return this.request<Asset>('GET', `/api/assets/${assetGuid}/set_uploaded`, { params });
  }

  /**
   * Upload an in-memory buffer directly to a signed S3 URL.
   *
   * Use {@link uploadFileToSignedUrl} for files on disk — it streams from
   * disk so you don't need to load the whole file into RAM. For files over
   * the multipart threshold, prefer {@link uploadAssetFile}.
   */
  async uploadToSignedUrl(signedUrl: string, fileData: Buffer | Uint8Array, contentType: string): Promise<void> {
    await this.putToSignedUrl(signedUrl, fileData, contentType, fileData.byteLength);
  }

  /**
   * SigV4 remote signer: posts a string-to-sign to /api/assets/sign and
   * returns the hex signature. The Mediagraph server holds the AWS secret
   * key; we never see it. Same endpoint Evaporate.js uses in the browser.
   */
  async signAwsRequest(toSign: string, datetime: string): Promise<string> {
    // The sign endpoint accepts form params; use URL params on a POST.
    const auth = await this.resolveAuth();
    if (!auth) throw new Error('Not authenticated; cannot sign AWS request.');

    const headers: Record<string, string> = { Accept: 'text/plain' };
    if (auth.mode === 'bearer') headers.Authorization = `Bearer ${auth.token}`;
    else {
      headers.Authorization = `Basic ${Buffer.from(`:${auth.pat}`).toString('base64')}`;
      headers.OrganizationId = String(auth.organizationId);
    }
    // The server route is `GET /api/assets/sign` (resources :assets do; get :sign).
    // Evaporate.js sends GET; we mirror that.
    const url = `${this.apiUrl}/api/assets/sign?datetime=${encodeURIComponent(datetime)}&to_sign=${encodeURIComponent(toSign)}`;
    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Remote signer failed: ${response.status} ${response.statusText} ${detail.slice(0, 200)}`);
    }
    return (await response.text()).trim();
  }

  /**
   * Upload a file for a prepared asset, choosing single PUT or multipart S3
   * based on file size and whether bucket info is available.
   *
   * Mirrors the browser flow: Mediagraph hands us {bucket, aws_key, s3_upload_key},
   * we talk directly to S3 with SigV4 signatures from the server.
   *
   * Falls back to single PUT (5 GB cap) when:
   *   - file is below the multipart threshold (default 16 MiB), or
   *   - the upload session didn't return aws_key + bucket (older API), or
   *   - the asset response didn't include s3_upload_key.
   */
  async uploadAssetFile(
    asset: { signed_upload_url: string; s3_upload_key?: string },
    upload: { aws_key?: string; bucket?: string },
    filePath: string,
    contentType: string,
    options: {
      onProgress?: (sent: number, total: number) => void;
      multipartThreshold?: number;
      partSize?: number;
      concurrency?: number;
      region?: string;
      s3Acceleration?: boolean;
    } = {},
  ): Promise<void> {
    const { statSync } = await import('node:fs');
    const totalBytes = statSync(filePath).size;
    const threshold = options.multipartThreshold ?? 16 * 1024 * 1024;

    const canMultipart = !!(upload.aws_key && upload.bucket && asset.s3_upload_key);
    if (totalBytes < threshold || !canMultipart) {
      await this.uploadFileToSignedUrl(asset.signed_upload_url, filePath, contentType, {
        onProgress: options.onProgress,
      });
      return;
    }

    const { uploadFileMultipart } = await import('./multipart.js');
    await uploadFileMultipart(
      {
        awsKey: upload.aws_key!,
        bucket: upload.bucket!,
        region: options.region ?? process.env.MEDIAGRAPH_UPLOAD_REGION ?? 'us-east-1',
        s3Acceleration: options.s3Acceleration ?? true,
        remoteSigner: (toSign, datetime) => this.signAwsRequest(toSign, datetime),
      },
      asset.s3_upload_key!,
      filePath,
      contentType,
      {
        partSize: options.partSize,
        concurrency: options.concurrency,
        onProgress: options.onProgress,
      },
    );
  }

  /**
   * Stream a file from disk to a signed S3 PUT URL.
   *
   * - Reads in 8 MB chunks so memory use stays constant regardless of file size.
   * - Up to 5 GB (S3 single-PUT cap). Larger files require server-side
   *   multipart support, which Mediagraph does not currently expose.
   * - Retries idempotently on transient network failures (S3 PUT is safe).
   * - Optional progress callback fires after each chunk.
   *
   * NOTE on true multipart: S3 supports multipart upload (5 MB parts, up to
   * 10 000 parts, 5 TB total) but each part needs its own SigV4-signed URL.
   * The Mediagraph server currently returns a single presigned PUT, not a
   * multipart upload id. To support files >5 GB or resumable transfers, the
   * server would need to expose:
   *   POST   /api/uploads/:guid/assets/:asset_guid/multipart_init
   *          → { upload_id, parts_signed: [{ part_number, signed_url }, ...] }
   *   POST   /api/uploads/:guid/assets/:asset_guid/multipart_sign
   *          { upload_id, part_numbers: [n,n,n] }
   *          → { parts_signed: [...] }
   *   POST   /api/uploads/:guid/assets/:asset_guid/multipart_complete
   *          { upload_id, parts: [{ part_number, etag }, ...] }
   *   DELETE /api/uploads/:guid/assets/:asset_guid/multipart
   *          { upload_id }   # abort
   * Once those exist we can layer parallel-part upload on top of this client.
   */
  async uploadFileToSignedUrl(
    signedUrl: string,
    filePath: string,
    contentType: string,
    options: {
      onProgress?: (bytesSent: number, totalBytes: number) => void;
      maxRetries?: number;
    } = {},
  ): Promise<void> {
    const { statSync, createReadStream } = await import('node:fs');
    const stat = statSync(filePath);
    const totalBytes = stat.size;

    const FIVE_GB = 5 * 1024 * 1024 * 1024;
    if (totalBytes > FIVE_GB) {
      throw new Error(
        `File is ${(totalBytes / 1024 / 1024 / 1024).toFixed(2)} GB; the single-PUT S3 limit is 5 GB. ` +
        `Use uploadAssetFile() instead — it routes large files through S3 multipart automatically.`,
      );
    }

    const maxRetries = options.maxRetries ?? 3;
    let attempt = 0;
    while (true) {
      attempt += 1;
      let bytesSent = 0;
      const stream = createReadStream(filePath, { highWaterMark: 8 * 1024 * 1024 });
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          stream.on('data', chunk => {
            const buf = chunk as Buffer;
            bytesSent += buf.byteLength;
            controller.enqueue(new Uint8Array(buf));
            options.onProgress?.(bytesSent, totalBytes);
          });
          stream.on('end', () => controller.close());
          stream.on('error', err => controller.error(err));
        },
        cancel() { stream.destroy(); },
      });

      try {
        await this.putToSignedUrl(signedUrl, body, contentType, totalBytes);
        return;
      } catch (err) {
        if (attempt >= maxRetries || !isRetryableUploadError(err)) throw err;
        // Exponential backoff before retry. PUTs are idempotent so retry is safe.
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }

  /** Shared PUT execution. Body may be a Buffer/Uint8Array or a ReadableStream. */
  private async putToSignedUrl(
    signedUrl: string,
    body: Buffer | Uint8Array | ReadableStream<Uint8Array>,
    contentType: string,
    contentLength: number,
  ): Promise<void> {
    // `duplex: 'half'` is required by undici (Node's fetch) when sending a
    // streaming body — it tells the runtime not to wait for a response before
    // writing the request body.
    const init: RequestInit & { duplex?: 'half' } = {
      method: 'PUT',
      body: body as unknown as RequestInit['body'],
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(contentLength),
      },
    };
    if (body instanceof ReadableStream) init.duplex = 'half';

    const response = await fetch(signedUrl, init);
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Failed to upload to S3: ${response.status} ${response.statusText}${detail ? ` — ${detail.slice(0, 200)}` : ''}`);
    }
  }

  async setUploadDone(id: number | string): Promise<Upload> {
    return this.request<Upload>('PUT', `/api/uploads/${id}/set_done`);
  }

  async canUpload(): Promise<CanUploadResponse> {
    return this.request<CanUploadResponse>('GET', '/api/can_upload');
  }

  // ============================================================================
  // Contributions
  // ============================================================================

  async listContributions(params?: PaginationParams): Promise<Contribution[]> {
    return this.request<Contribution[]>('GET', '/api/contributions', { params });
  }

  async getContribution(id: number | string): Promise<Contribution> {
    return this.request<Contribution>('GET', `/api/contributions/${id}`);
  }

  async createContribution(data: Partial<Contribution>): Promise<Contribution> {
    return this.request<Contribution>('POST', '/api/contributions', { body: { contribution: data } });
  }

  async updateContribution(id: number | string, data: Partial<Contribution>): Promise<Contribution> {
    return this.request<Contribution>('PUT', `/api/contributions/${id}`, { body: { contribution: data } });
  }

  async deleteContribution(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/contributions/${id}`);
  }

  async findContribution(params: { slug?: string }): Promise<Contribution> {
    return this.request<Contribution>('GET', '/api/contributions/find', { params });
  }

  async getFeaturedContributions(): Promise<Contribution[]> {
    return this.request<Contribution[]>('GET', '/api/contributions/featured');
  }

  async getContributionUploads(contributionId: number | string, params?: PaginationParams): Promise<Upload[]> {
    return this.request<Upload[]>('GET', `/api/contributions/${contributionId}/uploads`, { params });
  }

  async getContributionGroup(): Promise<unknown> {
    return this.request('GET', '/api/contributions/group');
  }

  async getContributionLightbox(): Promise<unknown> {
    return this.request('GET', '/api/contributions/lightbox');
  }

  async getContributionLink(): Promise<unknown> {
    return this.request('GET', '/api/contributions/link');
  }

  // ============================================================================
  // Bulk Jobs
  // ============================================================================

  async listBulkJobs(params?: PaginationParams): Promise<BulkJob[]> {
    return this.request<BulkJob[]>('GET', '/api/bulk_jobs', { params });
  }

  async getBulkJob(id: number | string): Promise<BulkJob> {
    return this.request<BulkJob>('GET', `/api/bulk_jobs/${id}`);
  }

  async createBulkJob(data: {
    asset_ids: number[];
    tag_names?: string[];
    tag_mode?: string;
    description?: string;
    description_mode?: string;
    rights_package_id?: number;
    rights_status?: string;
    rating?: number;
    add_asset_group_id?: number;
    add_asset_group_type?: string;
    remove_asset_group_id?: number;
    remove_asset_group_type?: string;
    custom_meta?: Record<string, unknown>;
    run_custom_meta_field_ids?: number[];
    cmf_overwrite_mode?: string;
    destroy_all?: boolean;
    restore_all?: boolean;
    generate_alt_text?: boolean;
    alt_text_generation_prompt?: string;
    rename_preset_id?: number;
    rename_custom_text?: string;
    rename_custom_text_2?: string;
    rename_start_number?: number;
    rename_global_start?: number;
    rename_duplicate_resolution?: string;
    rerun_auto_tag?: boolean;
  }): Promise<BulkJob> {
    return this.request<BulkJob>('POST', '/api/bulk_jobs', { body: { bulk_job: data } });
  }

  async getBulkJobAssets(id: number | string, params?: PaginationParams): Promise<Asset[]> {
    return this.request<Asset[]>('GET', `/api/bulk_jobs/${id}/assets`, { params });
  }

  async cancelBulkJob(id: number | string): Promise<BulkJob> {
    return this.request<BulkJob>('POST', `/api/bulk_jobs/${id}/cancel`);
  }

  async getBulkJobQueuePosition(id: number | string): Promise<BulkJobQueuePosition> {
    return this.request<BulkJobQueuePosition>('GET', `/api/bulk_jobs/${id}/queue_position`);
  }

  async getProcessingBulkJobs(): Promise<BulkJob[]> {
    return this.request<BulkJob[]>('GET', '/api/bulk_jobs/processing');
  }

  async previewCaiBulkJob(data: { asset_ids: number[]; cmf_ids: number[] }): Promise<unknown> {
    return this.request('POST', '/api/bulk_jobs/cai_preview', { body: data });
  }

  async previewRenameBulkJob(data: {
    rename_preset_id: number;
    asset_ids: number[];
    custom_text?: string;
    custom_text_2?: string;
    start_number?: number;
    global_start?: number;
  }): Promise<unknown> {
    return this.request('POST', '/api/bulk_jobs/rename_preview', { body: data });
  }

  // ============================================================================
  // Custom Meta Fields
  // ============================================================================

  async listCustomMetaFields(params?: PaginationParams & { enable_rename?: boolean }): Promise<CustomMetaField[]> {
    return this.request<CustomMetaField[]>('GET', '/api/custom_meta_fields', { params });
  }

  async getCustomMetaField(id: number | string): Promise<CustomMetaField> {
    return this.request<CustomMetaField>('GET', `/api/custom_meta_fields/${id}`);
  }

  async createCustomMetaField(data: Partial<CustomMetaField>): Promise<CustomMetaField> {
    return this.request<CustomMetaField>('POST', '/api/custom_meta_fields', { body: { custom_meta_field: data } });
  }

  async updateCustomMetaField(id: number | string, data: Partial<CustomMetaField>): Promise<CustomMetaField> {
    return this.request<CustomMetaField>('PUT', `/api/custom_meta_fields/${id}`, { body: { custom_meta_field: data } });
  }

  async deleteCustomMetaField(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/custom_meta_fields/${id}`);
  }

  async exportCustomMetaField(id: number | string): Promise<unknown> {
    return this.request('GET', `/api/custom_meta_fields/${id}/export`);
  }

  async exportCustomMetaFields(ids: number[]): Promise<unknown> {
    return this.request('POST', '/api/custom_meta_fields/export', { body: { ids } });
  }

  async importCustomMetaFields(settings: string): Promise<unknown> {
    return this.request('POST', '/api/custom_meta_fields/import', { body: { settings } });
  }

  async getAccessRequestCustomMetaFields(): Promise<CustomMetaField[]> {
    return this.request<CustomMetaField[]>('GET', '/api/custom_meta_fields/access_requests');
  }

  // ============================================================================
  // Workflows
  // ============================================================================

  async listWorkflows(params?: PaginationParams): Promise<Workflow[]> {
    return this.request<Workflow[]>('GET', '/api/workflows', { params });
  }

  async getWorkflow(id: number | string): Promise<Workflow> {
    return this.request<Workflow>('GET', `/api/workflows/${id}`);
  }

  async createWorkflow(data: Partial<Workflow>): Promise<Workflow> {
    return this.request<Workflow>('POST', '/api/workflows', { body: { workflow: data } });
  }

  async updateWorkflow(id: number | string, data: Partial<Workflow>): Promise<Workflow> {
    return this.request<Workflow>('PUT', `/api/workflows/${id}`, { body: { workflow: data } });
  }

  async deleteWorkflow(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/workflows/${id}`);
  }

  // ============================================================================
  // Workflow Steps
  // ============================================================================

  async listWorkflowSteps(params?: PaginationParams): Promise<WorkflowStep[]> {
    return this.request<WorkflowStep[]>('GET', '/api/workflow_steps', { params });
  }

  async getWorkflowStep(id: number | string): Promise<WorkflowStep> {
    return this.request<WorkflowStep>('GET', `/api/workflow_steps/${id}`);
  }

  async createWorkflowStep(data: Partial<WorkflowStep>): Promise<WorkflowStep> {
    return this.request<WorkflowStep>('POST', '/api/workflow_steps', { body: { workflow_step: data } });
  }

  async updateWorkflowStep(id: number | string, data: Partial<WorkflowStep>): Promise<WorkflowStep> {
    return this.request<WorkflowStep>('PUT', `/api/workflow_steps/${id}`, { body: { workflow_step: data } });
  }

  async deleteWorkflowStep(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/workflow_steps/${id}`);
  }

  async approveWorkflowStep(id: number | string, assetIds: number[]): Promise<WorkflowStep> {
    return this.request<WorkflowStep>('POST', `/api/workflow_steps/${id}/approve`, { body: { asset_ids: assetIds } });
  }

  /** Approve a curated subset (picks) on a workflow step. */
  async approveWorkflowStepPicks(id: number | string, assetIds: number[]): Promise<WorkflowStep> {
    return this.request<WorkflowStep>('POST', `/api/workflow_steps/${id}/approve_picks`, { body: { asset_ids: assetIds } });
  }

  // ============================================================================
  // Comments
  // ============================================================================

  async listComments(params: PaginationParams & { type: string; id: number }): Promise<Comment[]> {
    return this.request<Comment[]>('GET', '/api/comments', { params });
  }

  async getComment(id: number | string): Promise<Comment> {
    return this.request<Comment>('GET', `/api/comments/${id}`);
  }

  async createComment(type: string, id: number, data: { text: string }): Promise<Comment> {
    // type and id must be query params even for POST
    return this.request<Comment>('POST', `/api/comments?type=${encodeURIComponent(type)}&id=${id}`, {
      body: { comment: data },
    });
  }

  async updateComment(id: number | string, data: { text: string }): Promise<Comment> {
    return this.request<Comment>('PUT', `/api/comments/${id}`, { body: { comment: data } });
  }

  async deleteComment(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/comments/${id}`);
  }

  // ============================================================================
  // Notifications
  // ============================================================================

  async listNotifications(params?: PaginationParams): Promise<Notification[]> {
    return this.request<Notification[]>('GET', '/api/notifications', { params });
  }

  async getNotificationCount(): Promise<NotificationCount> {
    return this.request<NotificationCount>('GET', '/api/notifications/count');
  }

  // ============================================================================
  // Downloads
  // ============================================================================

  async listDownloads(params?: PaginationParams): Promise<Download[]> {
    return this.request<Download[]>('GET', '/api/downloads', { params });
  }

  async getDownload(token: string): Promise<Download> {
    return this.request<Download>('GET', `/api/downloads/${token}`);
  }

  async createDownload(data: {
    asset_ids: number[];
    size: string;
    watermarked?: boolean;
    via?: string;
    skip_meta?: boolean;
  }): Promise<Download> {
    // Build download object with required fields
    const download: Record<string, unknown> = {
      asset_ids: data.asset_ids,
      size: data.size,
    };
    if (data.watermarked === true) {
      download.watermarked = true;
    }
    if (data.via) {
      download.via = data.via;
    }
    if (data.skip_meta === true) {
      download.skip_meta = true;
    }

    return this.request<Download>('POST', '/api/downloads', { body: { download } });
  }

  // ============================================================================
  // Webhooks
  // ============================================================================

  async listWebhooks(params?: PaginationParams): Promise<Webhook[]> {
    return this.request<Webhook[]>('GET', '/api/webhooks', { params });
  }

  async getWebhook(id: number | string): Promise<Webhook> {
    return this.request<Webhook>('GET', `/api/webhooks/${id}`);
  }

  async createWebhook(data: {
    name: string;
    url: string;
    events?: string;
    enabled?: boolean;
    asset_group_id?: number;
    include_download_url?: boolean;
    group_assets?: boolean;
    trash?: boolean;
    note?: string;
  }): Promise<Webhook> {
    return this.request<Webhook>('POST', '/api/webhooks', { body: { webhook: data } });
  }

  async updateWebhook(id: number | string, data: Partial<Webhook>): Promise<Webhook> {
    return this.request<Webhook>('PUT', `/api/webhooks/${id}`, { body: { webhook: data } });
  }

  async deleteWebhook(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/webhooks/${id}`);
  }

  async getWebhookLogs(id: number | string, params?: PaginationParams): Promise<WebhookLog[]> {
    return this.request<WebhookLog[]>('GET', `/api/webhooks/${id}/logs`, { params });
  }

  async testWebhook(url: string): Promise<unknown> {
    return this.request('POST', '/api/webhooks/test', { body: { url } });
  }

  async getWebhookPayload(): Promise<unknown> {
    return this.request('GET', '/api/webhooks/payload');
  }

  async getWebhookResponseData(): Promise<unknown> {
    return this.request('GET', '/api/webhooks/response_data');
  }

  // ============================================================================
  // User Groups
  // ============================================================================

  async listUserGroups(params?: PaginationParams): Promise<UserGroup[]> {
    return this.request<UserGroup[]>('GET', '/api/user_groups', { params });
  }

  async getUserGroup(id: number | string): Promise<UserGroup> {
    return this.request<UserGroup>('GET', `/api/user_groups/${id}`);
  }

  async createUserGroup(data: { name: string; description?: string }): Promise<UserGroup> {
    return this.request<UserGroup>('POST', '/api/user_groups', { body: { user_group: data } });
  }

  // ============================================================================
  // Asset Group Invites (collection / lightbox / folder invitations)
  // ============================================================================

  async listAssetGroupInvites(params?: PaginationParams): Promise<unknown[]> {
    return this.request<unknown[]>('GET', '/api/asset_group_invites', { params });
  }

  async getAssetGroupInvite(id: number | string): Promise<unknown> {
    return this.request('GET', `/api/asset_group_invites/${id}`);
  }

  /**
   * Create an invite to an asset group (collection / lightbox / folder).
   * Pass either `asset_group_id` (top-level form) or use the nested form by
   * passing `asset_group_id` as the parent id — both server forms exist.
   */
  async createAssetGroupInvite(data: {
    asset_group_id: number;
    email?: string;
    membership_id?: number;
    role?: string;
    message?: string;
  }): Promise<unknown> {
    return this.request('POST', `/api/asset_groups/${data.asset_group_id}/asset_group_invites`, { body: { asset_group_invite: data } });
  }

  async updateAssetGroupInvite(id: number | string, data: Record<string, unknown>): Promise<unknown> {
    return this.request('PUT', `/api/asset_group_invites/${id}`, { body: { asset_group_invite: data } });
  }

  async deleteAssetGroupInvite(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/asset_group_invites/${id}`);
  }

  async updateUserGroup(id: number | string, data: Partial<UserGroup>): Promise<UserGroup> {
    return this.request<UserGroup>('PUT', `/api/user_groups/${id}`, { body: { user_group: data } });
  }

  async deleteUserGroup(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/user_groups/${id}`);
  }

  // ============================================================================
  // Invites
  // ============================================================================

  async listInvites(params?: PaginationParams): Promise<Invite[]> {
    return this.request<Invite[]>('GET', '/api/invites', { params });
  }

  async getInvite(id: number | string): Promise<Invite> {
    return this.request<Invite>('GET', `/api/invites/${id}`);
  }

  async createInvite(data: { email: string; role_level: string; note?: string }): Promise<Invite> {
    return this.request<Invite>('POST', '/api/invites', { body: { invite: data } });
  }

  async updateInvite(id: number | string, data: Partial<{ role_level: string; note?: string }>): Promise<Invite> {
    return this.request<Invite>('PUT', `/api/invites/${id}`, { body: { invite: data } });
  }

  async deleteInvite(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/invites/${id}`);
  }

  async resendInvite(id: number | string): Promise<Invite> {
    return this.request<Invite>('POST', `/api/invites/${id}/resend`);
  }

  async findInvite(params: { token?: string }): Promise<Invite> {
    return this.request<Invite>('GET', '/api/invites/find', { params });
  }

  async checkInviteEmail(email: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>('POST', '/api/invites/check_email', { body: { email } });
  }

  async getAvailableRoleLevels(): Promise<string[]> {
    return this.request<string[]>('GET', '/api/invites/available_role_levels');
  }

  /**
   * Accept an invite using the email token (public — no auth required server-side
   * if the token is valid). Different from `acceptMyInvite` which uses the
   * profile-scoped invite list for an already-authenticated user.
   */
  async acceptInvite(token: string): Promise<unknown> {
    return this.request('POST', '/api/invites/accept', { body: { token } });
  }

  // ============================================================================
  // Filter Groups
  // ============================================================================

  async listFilterGroups(params?: PaginationParams): Promise<FilterGroup[]> {
    return this.request<FilterGroup[]>('GET', '/api/filter_groups', { params });
  }

  async getFilterGroup(id: number | string): Promise<FilterGroup> {
    return this.request<FilterGroup>('GET', `/api/filter_groups/${id}`);
  }

  async createFilterGroup(data: { name: string; filter_order?: string[] }): Promise<FilterGroup> {
    return this.request<FilterGroup>('POST', '/api/filter_groups', { body: { filter_group: data } });
  }

  async updateFilterGroup(id: number | string, data: Partial<FilterGroup>): Promise<FilterGroup> {
    return this.request<FilterGroup>('PUT', `/api/filter_groups/${id}`, { body: { filter_group: data } });
  }

  async deleteFilterGroup(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/filter_groups/${id}`);
  }

  async updateFilterGroupVisibility(
    id: number | string,
    data: { name: string; type: 'explore' | 'manage'; visible: boolean },
  ): Promise<FilterGroup> {
    return this.request<FilterGroup>('PUT', `/api/filter_groups/${id}/update_visibility`, {
      body: { name: data.name, type: data.type, visible: String(data.visible) },
    });
  }

  // ============================================================================
  // Search Queries
  // ============================================================================

  async listSearchQueries(params?: PaginationParams): Promise<SearchQuery[]> {
    return this.request<SearchQuery[]>('GET', '/api/search_queries', { params });
  }

  async getSearchQuery(id: number | string): Promise<SearchQuery> {
    return this.request<SearchQuery>('GET', `/api/search_queries/${id}`);
  }

  async createSearchQuery(data: { name: string; description?: string; sql: string }): Promise<SearchQuery> {
    return this.request<SearchQuery>('POST', '/api/search_queries', { body: { search_query: data } });
  }

  async updateSearchQuery(id: number | string, data: Partial<SearchQuery>): Promise<SearchQuery> {
    return this.request<SearchQuery>('PUT', `/api/search_queries/${id}`, { body: { search_query: data } });
  }

  async deleteSearchQuery(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/search_queries/${id}`);
  }

  // ============================================================================
  // Crop Presets
  // ============================================================================

  async listCropPresets(params?: PaginationParams): Promise<CropPreset[]> {
    return this.request<CropPreset[]>('GET', '/api/crop_presets', { params });
  }

  async getCropPreset(id: number | string): Promise<CropPreset> {
    return this.request<CropPreset>('GET', `/api/crop_presets/${id}`);
  }

  async createCropPreset(data: { name: string; width: number; height: number }): Promise<CropPreset> {
    return this.request<CropPreset>('POST', '/api/crop_presets', { body: { crop_preset: data } });
  }

  async updateCropPreset(id: number | string, data: Partial<CropPreset>): Promise<CropPreset> {
    return this.request<CropPreset>('PUT', `/api/crop_presets/${id}`, { body: { crop_preset: data } });
  }

  async deleteCropPreset(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/crop_presets/${id}`);
  }

  async updateCropPresetPosition(oldIndex: number, newIndex: number): Promise<CropPreset> {
    return this.request<CropPreset>('PUT', '/api/crop_presets/update_position', { body: { oldIndex, newIndex } });
  }

  // ============================================================================
  // Ingestions
  // ============================================================================

  async listIngestions(params?: PaginationParams): Promise<Ingestion[]> {
    return this.request<Ingestion[]>('GET', '/api/ingestions', { params });
  }

  // ============================================================================
  // Meta Imports
  // ============================================================================

  async listMetaImports(params?: PaginationParams): Promise<MetaImport[]> {
    return this.request<MetaImport[]>('GET', '/api/meta_imports', { params });
  }

  async getMetaImport(id: number | string): Promise<MetaImport> {
    return this.request<MetaImport>('GET', `/api/meta_imports/${id}`);
  }

  async createMetaImport(data: { filename: string }): Promise<MetaImport> {
    return this.request<MetaImport>('POST', '/api/meta_imports', { body: { meta_import: data } });
  }

  async getMetaImportAssets(id: number | string, params?: PaginationParams): Promise<Asset[]> {
    return this.request<Asset[]>('GET', `/api/meta_imports/${id}/assets`, { params });
  }

  async getMetaImportMapping(id: number | string): Promise<Record<string, string>> {
    return this.request<Record<string, string>>('GET', `/api/meta_imports/${id}/mapping`);
  }

  async updateMetaImportMapping(id: number | string, mapping: Record<string, string>): Promise<MetaImport> {
    return this.request<MetaImport>('PUT', `/api/meta_imports/${id}/mapping`, { body: { mapping } });
  }

  async startMetaImportProcess(id: number | string): Promise<MetaImport> {
    return this.request<MetaImport>('POST', `/api/meta_imports/${id}/start_process`);
  }

  // ============================================================================
  // Personal Access Tokens
  // ============================================================================

  async listPersonalAccessTokens(params?: PaginationParams): Promise<PersonalAccessToken[]> {
    return this.request<PersonalAccessToken[]>('GET', '/api/personal_access_tokens', { params });
  }

  async getPersonalAccessToken(id: number | string): Promise<PersonalAccessToken> {
    return this.request<PersonalAccessToken>('GET', `/api/personal_access_tokens/${id}`);
  }

  async createPersonalAccessToken(data: { name: string; scopes?: string[] }): Promise<PersonalAccessToken> {
    return this.request<PersonalAccessToken>('POST', '/api/personal_access_tokens', { body: { personal_access_token: data } });
  }

  async deletePersonalAccessToken(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/personal_access_tokens/${id}`);
  }

  async disablePersonalAccessToken(id: number | string): Promise<PersonalAccessToken> {
    return this.request<PersonalAccessToken>('POST', `/api/personal_access_tokens/${id}/disable`);
  }

  async enablePersonalAccessToken(id: number | string): Promise<PersonalAccessToken> {
    return this.request<PersonalAccessToken>('POST', `/api/personal_access_tokens/${id}/enable`);
  }

  // ============================================================================
  // Tag Imports (CSV/XLS)
  // ============================================================================

  async listTagImports(params?: PaginationParams): Promise<unknown[]> {
    return this.request<unknown[]>('GET', '/api/tag_imports', { params });
  }

  async getTagImport(id: number | string): Promise<unknown> {
    return this.request('GET', `/api/tag_imports/${id}`);
  }

  async createTagImport(data: { file: string; note?: string; name_column?: string; columns?: unknown }): Promise<unknown> {
    return this.request('POST', '/api/tag_imports', { body: { tag_import: data } });
  }

  async updateTagImport(id: number | string, data: Record<string, unknown>): Promise<unknown> {
    return this.request('PUT', `/api/tag_imports/${id}`, { body: { tag_import: data } });
  }

  async deleteTagImport(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/tag_imports/${id}`);
  }

  async updateTagImportMapping(id: number | string, column: { name: string; mapping: string }): Promise<unknown> {
    return this.request('PUT', `/api/tag_imports/${id}/mapping`, { body: { column } });
  }

  async startTagImportProcess(id: number | string): Promise<unknown> {
    return this.request('POST', `/api/tag_imports/${id}/start_process`);
  }

  async getTagImportTags(id: number | string, params?: PaginationParams): Promise<Tag[]> {
    return this.request<Tag[]>('GET', `/api/tag_imports/${id}/tags`, { params });
  }

  // ============================================================================
  // Rename Presets (Lightroom-style filename templates)
  // ============================================================================

  async listRenamePresets(params?: PaginationParams & { enabled?: boolean }): Promise<unknown[]> {
    return this.request<unknown[]>('GET', '/api/rename_presets', { params });
  }

  async getRenamePreset(id: number | string): Promise<unknown> {
    return this.request('GET', `/api/rename_presets/${id}`);
  }

  async createRenamePreset(data: {
    name: string;
    enabled?: boolean;
    position?: number;
    template?: Array<Record<string, unknown>>;
  }): Promise<unknown> {
    return this.request('POST', '/api/rename_presets', { body: { rename_preset: data } });
  }

  async updateRenamePreset(id: number | string, data: Record<string, unknown>): Promise<unknown> {
    return this.request('PUT', `/api/rename_presets/${id}`, { body: { rename_preset: data } });
  }

  async deleteRenamePreset(id: number | string): Promise<void> {
    await this.request<void>('DELETE', `/api/rename_presets/${id}`);
  }

  async updateRenamePresetPosition(oldIndex: number, newIndex: number): Promise<unknown> {
    return this.request('PUT', '/api/rename_presets/update_position', { body: { oldIndex, newIndex } });
  }

  // ============================================================================
  // Meta Downloads (background CSV export)
  // ============================================================================

  async listMetaDownloads(params?: PaginationParams & { dates?: string[]; user_id?: number }): Promise<unknown[]> {
    return this.request<unknown[]>('GET', '/api/meta_downloads', { params });
  }

  async getMetaDownloadColumns(): Promise<unknown> {
    return this.request('GET', '/api/meta_downloads/columns');
  }

  async createMetaDownload(data: {
    asset_ids: string;
    column_preset?: 'basic' | 'custom';
    columns?: string[];
    send_email?: boolean;
  }): Promise<{ guid: string }> {
    return this.request<{ guid: string }>('POST', '/api/download_meta', { body: data });
  }

  async updateMetaDownload(guid: string, send_email: boolean): Promise<unknown> {
    return this.request('PUT', `/api/download_meta/${guid}`, { body: { send_email } });
  }

  // ============================================================================
  // Organization CAI Budget / Trials (super-admin)
  // ============================================================================

  async addOrganizationCaiBudget(id: number | string, data: { amount?: number; description?: string }): Promise<unknown> {
    return this.request('POST', `/api/organizations/${id}/admin_add_cai_budget`, { body: data });
  }

  async grantOrganizationCaiBudget(id: number | string, data: { amount?: number; description?: string }): Promise<unknown> {
    return this.request('POST', `/api/organizations/${id}/admin_grant_cai_budget`, { body: data });
  }

  async markOrganizationCaiInvoicePaid(id: number | string): Promise<unknown> {
    return this.request('POST', `/api/organizations/${id}/mark_cai_invoice_paid`);
  }

  async extendOrganizationTrial(id: number | string, data: { days?: number; until?: string }): Promise<unknown> {
    return this.request('POST', `/admin/organizations/${id}/extend_trial`, { body: data });
  }
}
