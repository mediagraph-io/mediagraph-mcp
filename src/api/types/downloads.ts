/**
 * Download types
 */

export interface DownloadResponse {
  url: string;
  filename: string;
  expires_at?: string;
  file_size?: number;
}

export interface Download {
  id: number;
  token: string;
  status?: string;
  filename?: string;
  file_size?: number;
  download_type?: string;
  asset_ids?: number[];
  created_at: string;
  expires_at?: string;
  url?: string;
}
