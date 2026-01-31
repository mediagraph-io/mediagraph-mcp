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

export interface MediagraphClientConfig {
  apiUrl?: string;
  getAccessToken: () => Promise<string | null>;
}

export class MediagraphApiError extends Error {
  constructor(
    public statusCode: number,
    public errorBody: ApiError,
  ) {
    super(errorBody.message || errorBody.error || 'API Error');
    this.name = 'MediagraphApiError';
  }
}

export class MediagraphClient {
  private apiUrl: string;
  private getAccessToken: () => Promise<string | null>;
  private maxRetries = 3;
  private retryDelay = 1000;

  constructor(config: MediagraphClientConfig) {
    this.apiUrl = config.apiUrl || 'https://api.mediagraph.io';
    this.getAccessToken = config.getAccessToken;
  }

  private async request<T>(
    method: string,
    path: string,
    options: {
      params?: Record<string, unknown>;
      body?: unknown;
    } = {},
  ): Promise<T> {
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Not authenticated. Please authorize with Mediagraph first.');
    }

    let url = `${this.apiUrl}${path}`;

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
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        };

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
          throw new MediagraphApiError(403, {
            error: 'forbidden',
            message: 'You do not have permission to perform this action.',
          });
        }

        if (response.status === 404) {
          throw new MediagraphApiError(404, {
            error: 'not_found',
            message: 'The requested resource was not found.',
          });
        }

        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : this.retryDelay * Math.pow(2, attempt);
          await this.sleep(delay);
          continue;
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

        const data = await response.json();
        return data as T;
      } catch (error) {
        lastError = error as Error;

        if (error instanceof MediagraphApiError && [401, 403, 404].includes(error.statusCode)) {
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

  async listTags(params?: PaginationParams & { q?: string }): Promise<Tag[]> {
    return this.request<Tag[]>('GET', '/api/tags', { params });
  }

  async getTag(id: number | string): Promise<Tag> {
    return this.request<Tag>('GET', `/api/tags/${id}`);
  }

  async createTag(data: { name: string; parent_id?: number }): Promise<Tag> {
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

  async mergeTagInto(id: number | string, targetTagId: number): Promise<void> {
    await this.request<void>('POST', `/api/tags/${id}/merge_into`, { body: { tag_2_id: targetTagId } });
  }

  async getTagEvents(params?: PaginationParams): Promise<unknown[]> {
    return this.request<unknown[]>('GET', '/api/tags/events', { params });
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

  // ============================================================================
  // Uploads
  // ============================================================================

  async listUploads(params?: PaginationParams): Promise<Upload[]> {
    return this.request<Upload[]>('GET', '/api/uploads', { params });
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
   * Upload file data directly to a signed S3 URL
   */
  async uploadToSignedUrl(signedUrl: string, fileData: Buffer | Uint8Array, contentType: string): Promise<void> {
    const response = await fetch(signedUrl, {
      method: 'PUT',
      body: fileData,
      headers: {
        'Content-Type': contentType,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to upload to S3: ${response.status} ${response.statusText}`);
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

  // ============================================================================
  // Custom Meta Fields
  // ============================================================================

  async listCustomMetaFields(params?: PaginationParams): Promise<CustomMetaField[]> {
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
}
