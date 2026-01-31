import { useState, useCallback, useMemo } from 'react';
import type { App } from '@modelcontextprotocol/ext-apps';
import type { Asset } from '../types';
import { AssetCard } from './AssetCard';

interface GalleryProps {
  assets: Asset[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  onSelectAsset: (asset: Asset) => void;
  onPageChange: (page: number) => void;
  isLoading: boolean;
  app: App | null;
}

export function Gallery({
  assets,
  total,
  page,
  perPage,
  totalPages,
  onSelectAsset,
  onPageChange,
  isLoading,
  app,
}: GalleryProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showBulkDownloadMenu, setShowBulkDownloadMenu] = useState(false);
  const [bulkDownloadWatermarked, setBulkDownloadWatermarked] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Calculate pagination info
  const paginationInfo = useMemo(() => {
    const start = (page - 1) * perPage + 1;
    const end = Math.min(page * perPage, total);
    return { start, end };
  }, [page, perPage, total]);

  // Generate page numbers for pagination
  const pageNumbers = useMemo(() => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (page > 3) {
        pages.push('ellipsis');
      }

      // Show pages around current
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (page < totalPages - 2) {
        pages.push('ellipsis');
      }

      // Always show last page
      if (totalPages > 1) {
        pages.push(totalPages);
      }
    }

    return pages;
  }, [page, totalPages]);

  const handlePrevPage = useCallback(() => {
    if (page > 1) {
      onPageChange(page - 1);
    }
  }, [page, onPageChange]);

  const handleNextPage = useCallback(() => {
    if (page < totalPages) {
      onPageChange(page + 1);
    }
  }, [page, totalPages, onPageChange]);

  const handleToggleSelect = useCallback((assetId: number) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(assetId)) {
        newSet.delete(assetId);
      } else {
        newSet.add(assetId);
      }
      // Exit selection mode if no items selected
      if (newSet.size === 0) {
        setIsSelectionMode(false);
      }
      return newSet;
    });
  }, []);

  const handleEnterSelectionMode = useCallback(() => {
    setIsSelectionMode(true);
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setIsSelectionMode(false);
    setShowBulkDownloadMenu(false);
  }, []);

  const handleSelectAll = useCallback(() => {
    const allIds = new Set(assets.map((a) => a.id));
    setSelectedIds(allIds);
    setIsSelectionMode(true);
  }, [assets]);

  const handleBulkDownload = useCallback(async (size: 'small' | 'medium' | 'full' | 'original') => {
    if (!app || selectedIds.size === 0) return;

    setIsDownloading(true);
    setShowBulkDownloadMenu(false);

    try {
      const args: Record<string, unknown> = {
        asset_ids: Array.from(selectedIds),
        size: size,
      };
      if (bulkDownloadWatermarked) {
        args.watermarked = true;
      }

      const result = await app.callServerTool({
        name: 'bulk_download_assets',
        arguments: args,
      });

      if (result.isError) {
        console.error('[Gallery] Bulk download error:', result);
        return;
      }

      const textContent = result.content?.find((c) => c.type === 'text');
      if (textContent && textContent.type === 'text') {
        const data = JSON.parse((textContent as { text: string }).text);
        if (data.url) {
          await app.openLink({ url: data.url });
          handleClearSelection();
        }
      }
    } catch (err) {
      console.error('[Gallery] Failed to get bulk download URL:', err);
    } finally {
      setIsDownloading(false);
    }
  }, [app, selectedIds, bulkDownloadWatermarked, handleClearSelection]);

  return (
    <div className="gallery">
      {/* Header with count and selection controls */}
      <div className="gallery-header">
        <div className="gallery-count">
          {total > 0 ? (
            <>
              Showing <strong>{paginationInfo.start}-{paginationInfo.end}</strong> of{' '}
              <strong>{total.toLocaleString()}</strong> assets
            </>
          ) : (
            'No assets found'
          )}
        </div>

        <div className="gallery-actions">
          {!isSelectionMode ? (
            <button
              className="btn btn-secondary btn-small"
              onClick={handleEnterSelectionMode}
              title="Select multiple assets"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM17.99 9l-1.41-1.42-6.59 6.59-2.58-2.57-1.42 1.41 4 3.99z" />
              </svg>
              Select
            </button>
          ) : (
            <button
              className="btn btn-secondary btn-small"
              onClick={handleSelectAll}
              title="Select all on this page"
            >
              Select All
            </button>
          )}
        </div>
      </div>

      {/* Selection toolbar */}
      {isSelectionMode && selectedIds.size > 0 && (
        <div className="selection-toolbar">
          <div className="selection-info">
            <strong>{selectedIds.size}</strong> asset{selectedIds.size !== 1 ? 's' : ''} selected
          </div>

          <div className="selection-actions">
            <div className="bulk-download-container">
              <button
                className="btn btn-primary"
                onClick={() => setShowBulkDownloadMenu(!showBulkDownloadMenu)}
                disabled={isDownloading}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                </svg>
                {isDownloading ? 'Preparing...' : 'Download Selected'}
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style={{ marginLeft: 4 }}>
                  <path d="M7 10l5 5 5-5z" />
                </svg>
              </button>

              {showBulkDownloadMenu && (
                <div className="bulk-download-menu">
                  <div className="bulk-download-sizes">
                    <button onClick={() => handleBulkDownload('small')}>Small</button>
                    <button onClick={() => handleBulkDownload('medium')}>Medium</button>
                    <button onClick={() => handleBulkDownload('full')}>Full</button>
                    <button onClick={() => handleBulkDownload('original')}>Original</button>
                  </div>
                  <label className="bulk-download-watermark">
                    <input
                      type="checkbox"
                      checked={bulkDownloadWatermarked}
                      onChange={(e) => setBulkDownloadWatermarked(e.target.checked)}
                    />
                    Watermarked
                  </label>
                </div>
              )}
            </div>

            <button
              className="btn btn-secondary"
              onClick={handleClearSelection}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Grid of assets */}
      <div className={`gallery-grid ${isLoading ? 'loading' : ''}`}>
        {assets.map((asset) => (
          <AssetCard
            key={asset.id}
            asset={asset}
            onClick={() => onSelectAsset(asset)}
            isSelected={selectedIds.has(asset.id)}
            isSelectionMode={isSelectionMode}
            onToggleSelect={handleToggleSelect}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="gallery-pagination">
          <button
            className="pagination-btn pagination-prev"
            onClick={handlePrevPage}
            disabled={page <= 1 || isLoading}
            aria-label="Previous page"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
            </svg>
          </button>

          <div className="pagination-pages">
            {pageNumbers.map((p, i) =>
              p === 'ellipsis' ? (
                <span key={`ellipsis-${i}`} className="pagination-ellipsis">
                  ...
                </span>
              ) : (
                <button
                  key={p}
                  className={`pagination-btn pagination-page ${
                    p === page ? 'active' : ''
                  }`}
                  onClick={() => onPageChange(p)}
                  disabled={isLoading}
                  aria-current={p === page ? 'page' : undefined}
                >
                  {p}
                </button>
              )
            )}
          </div>

          <button
            className="pagination-btn pagination-next"
            onClick={handleNextPage}
            disabled={page >= totalPages || isLoading}
            aria-label="Next page"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z" />
            </svg>
          </button>
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div className="gallery-loading-overlay">
          <div className="spinner" />
        </div>
      )}
    </div>
  );
}
