/**
 * Common types used across the Mediagraph API
 */

export interface PaginationParams {
  page?: number;
  per_page?: number;
  current?: number;
  pageSize?: number;
  sortField?: string;
  sortOrder?: 'ascend' | 'descend';
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages?: number;
}

export interface ApiError {
  error: string;
  message?: string;
  details?: Record<string, unknown>;
}
