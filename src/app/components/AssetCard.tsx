import { useState, useCallback, useMemo } from 'react';
import type { Asset } from '../types';
import { RatingStars } from './RatingStars';

interface AssetCardProps {
  asset: Asset;
  onClick: () => void;
  isSelected?: boolean;
  isSelectionMode?: boolean;
  onToggleSelect?: (assetId: number) => void;
}

export function AssetCard({
  asset,
  onClick,
  isSelected = false,
  isSelectionMode = false,
  onToggleSelect,
}: AssetCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
  }, []);

  const handleImageError = useCallback(() => {
    setImageError(true);
    setImageLoaded(true);
  }, []);

  const handleCheckboxClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleSelect?.(asset.id);
  }, [asset.id, onToggleSelect]);

  const handleCardClick = useCallback(() => {
    if (isSelectionMode) {
      onToggleSelect?.(asset.id);
    } else {
      onClick();
    }
  }, [isSelectionMode, onToggleSelect, asset.id, onClick]);

  // Determine the asset type icon
  const typeIcon = useMemo(() => {
    const type = asset.type || asset.file_type;
    if (type?.includes('video') || asset.duration) {
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      );
    }
    if (type?.includes('audio')) {
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M12 3v9.28a4.39 4.39 0 00-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z" />
        </svg>
      );
    }
    if (type?.includes('pdf') || asset.ext === 'pdf') {
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z" />
        </svg>
      );
    }
    return null;
  }, [asset.type, asset.file_type, asset.ext, asset.duration]);

  // Format duration for videos
  const formattedDuration = useMemo(() => {
    if (!asset.duration) return null;
    const minutes = Math.floor(asset.duration / 60);
    const seconds = Math.floor(asset.duration % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, [asset.duration]);

  // Get display title
  const displayTitle = asset.title || asset.filename;

  // Thumbnail URL with fallback
  const thumbnailUrl = asset.grid_url || asset.thumb_url || asset.small_url;

  return (
    <button
      className={`asset-card ${isSelected ? 'selected' : ''} ${isSelectionMode ? 'selection-mode' : ''}`}
      onClick={handleCardClick}
      type="button"
      aria-label={`View ${displayTitle}`}
    >
      {/* Selection checkbox */}
      <div
        className={`asset-card-checkbox ${isSelected ? 'checked' : ''}`}
        onClick={handleCheckboxClick}
        role="checkbox"
        aria-checked={isSelected}
      >
        {isSelected && (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
        )}
      </div>

      {/* Thumbnail container */}
      <div className="asset-card-thumbnail">
        {!imageLoaded && !imageError && (
          <div className="asset-card-placeholder">
            <div className="spinner-small" />
          </div>
        )}

        {imageError ? (
          <div className="asset-card-error">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
            </svg>
          </div>
        ) : (
          <img
            src={thumbnailUrl}
            alt={asset.alt_text || displayTitle}
            loading="lazy"
            onLoad={handleImageLoad}
            onError={handleImageError}
            className={imageLoaded ? 'loaded' : ''}
          />
        )}

        {/* Type badge */}
        {typeIcon && (
          <div className="asset-card-type">
            {typeIcon}
          </div>
        )}

        {/* Duration badge for videos */}
        {formattedDuration && (
          <div className="asset-card-duration">
            {formattedDuration}
          </div>
        )}
      </div>

      {/* Info overlay */}
      <div className="asset-card-overlay">
        <div className="asset-card-info">
          <div className="asset-card-title" title={displayTitle}>
            {displayTitle}
          </div>

          {asset.tags && asset.tags.length > 0 && (
            <div className="asset-card-tags">
              {asset.tags.slice(0, 3).map((tag, i) => (
                <span key={i} className="asset-card-tag">
                  {tag}
                </span>
              ))}
              {asset.tags.length > 3 && (
                <span className="asset-card-tag more">
                  +{asset.tags.length - 3}
                </span>
              )}
            </div>
          )}

          {typeof asset.rating === 'number' && asset.rating > 0 && (
            <RatingStars rating={asset.rating} readonly size="small" />
          )}

          {asset.width && asset.height && (
            <div className="asset-card-dimensions">
              {asset.width} x {asset.height}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
