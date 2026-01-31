import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { App } from '@modelcontextprotocol/ext-apps';
import type { Asset } from '../types';
import { RatingStars } from './RatingStars';
import { MediaPlayer } from './MediaPlayer';
import { MetadataForm } from './MetadataForm';
import { TagList } from './TagList';

interface DetailPanelProps {
  asset: Asset;
  organizationSlug?: string;
  onClose: () => void;
  onUpdate: (id: number, updates: Partial<Asset>) => Promise<void>;
  onAddToLightbox?: (assetId: number, lightboxId: number) => Promise<void>;
  app: App | null;
}

type TabId = 'info' | 'metadata' | 'tags';

export function DetailPanel({
  asset,
  organizationSlug,
  onClose,
  onUpdate,
  // onAddToLightbox - available for future use
  app,
}: DetailPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('info');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editedFields, setEditedFields] = useState<Partial<Asset>>({});
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [downloadWatermarked, setDownloadWatermarked] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const downloadMenuRef = useRef<HTMLDivElement>(null);

  // Reset edited fields when asset changes
  useEffect(() => {
    setEditedFields({});
    setIsEditing(false);
    setShowDownloadMenu(false);
  }, [asset.id]);

  // Close download menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target as Node)) {
        setShowDownloadMenu(false);
      }
    };
    if (showDownloadMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDownloadMenu]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isEditing) {
          setIsEditing(false);
          setEditedFields({});
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, onClose]);

  // Focus trap
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const focusableElements = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable?.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable?.focus();
        }
      }
    };

    panel.addEventListener('keydown', handleTabKey);
    firstFocusable?.focus();

    return () => panel.removeEventListener('keydown', handleTabKey);
  }, []);

  // Get preview URL based on asset type
  const previewUrl = useMemo(() => {
    return asset.preview_url || asset.full_url || asset.small_url || asset.grid_url;
  }, [asset]);

  // Check if asset is media (video/audio)
  const isMedia = useMemo(() => {
    const type = asset.type || asset.file_type || '';
    return type.includes('video') || type.includes('audio') || !!asset.duration;
  }, [asset]);

  // Compute Mediagraph URL
  const mediagraphUrl = useMemo(() => {
    console.log('[DetailPanel] Building mediagraphUrl:', { organizationSlug, guid: asset.guid });
    if (organizationSlug && asset.guid) {
      return `https://mediagraph.io/${organizationSlug}/explore#/assets/${asset.guid}`;
    }
    return null;
  }, [organizationSlug, asset.guid]);

  // Handle field change during editing
  const handleFieldChange = useCallback((field: keyof Asset, value: unknown) => {
    setEditedFields((prev) => ({ ...prev, [field]: value }));
  }, []);

  // Handle save
  const handleSave = useCallback(async () => {
    if (Object.keys(editedFields).length === 0) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onUpdate(asset.id, editedFields);
      setIsEditing(false);
      setEditedFields({});
    } finally {
      setIsSaving(false);
    }
  }, [asset.id, editedFields, onUpdate]);

  // Handle cancel editing
  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditedFields({});
  }, []);

  // Handle rating change (immediate save)
  const handleRatingChange = useCallback(
    async (rating: number) => {
      await onUpdate(asset.id, { rating });
    },
    [asset.id, onUpdate]
  );

  // Get current value (edited or original)
  const getValue = useCallback(
    <K extends keyof Asset>(field: K): Asset[K] => {
      return field in editedFields
        ? (editedFields[field] as Asset[K])
        : asset[field];
    },
    [asset, editedFields]
  );

  // Handle download with size and watermark options via the download API
  const handleDownload = useCallback(async (size: 'small' | 'medium' | 'full' | 'original') => {
    if (!app) return;

    setShowDownloadMenu(false);

    try {
      const result = await app.callServerTool({
        name: 'get_asset_download',
        arguments: {
          id: asset.id,
          size,
          watermarked: downloadWatermarked,
          via: 'mediagraph-mcp-app',
        },
      });

      if (result.isError) {
        console.error('[DetailPanel] Download error:', result);
        return;
      }

      const textContent = result.content?.find((c) => c.type === 'text');
      if (textContent && textContent.type === 'text') {
        const data = JSON.parse((textContent as { text: string }).text);
        if (data.url) {
          console.log('[DetailPanel] Opening download URL:', data.url);
          await app.openLink({ url: data.url });
        } else {
          console.error('[DetailPanel] No URL in response:', data);
        }
      }
    } catch (err) {
      console.error('[DetailPanel] Failed to get download URL:', err);
    }
  }, [app, asset.id, downloadWatermarked]);

  // Format file size
  const formatFileSize = useCallback((bytes?: number) => {
    if (!bytes) return 'Unknown';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }, []);

  // Format date
  const formatDate = useCallback((dateStr?: string) => {
    if (!dateStr) return 'Unknown';
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  // Pretty render for metadata values
  const renderMetaValue = useCallback((value: unknown, depth = 0): React.ReactNode => {
    if (value === null || value === undefined) {
      return <span className="meta-value-null">-</span>;
    }
    if (typeof value === 'boolean') {
      return <span className="meta-value-bool">{value ? 'Yes' : 'No'}</span>;
    }
    if (typeof value === 'number') {
      return <span className="meta-value-number">{value.toLocaleString()}</span>;
    }
    if (typeof value === 'string') {
      // Check if it's a date string
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
        return formatDate(value);
      }
      return value || '-';
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return '-';
      // For simple arrays, join with commas
      if (value.every(v => typeof v === 'string' || typeof v === 'number')) {
        return value.join(', ');
      }
      // For complex arrays, render each item
      return (
        <ul className="meta-value-list">
          {value.map((item, i) => (
            <li key={i}>{renderMetaValue(item, depth + 1)}</li>
          ))}
        </ul>
      );
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) return '-';
      return (
        <dl className={`meta-value-object ${depth > 0 ? 'nested' : ''}`}>
          {entries.map(([k, v]) => (
            <div key={k} className="meta-value-object-item">
              <dt>{k}</dt>
              <dd>{renderMetaValue(v, depth + 1)}</dd>
            </div>
          ))}
        </dl>
      );
    }
    return String(value);
  }, [formatDate]);

  return (
    <div className="detail-panel-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        className="detail-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-panel-title"
      >
        {/* Header */}
        <div className="detail-panel-header">
          <h2 id="detail-panel-title" className="detail-panel-title">
            {asset.title || asset.filename}
          </h2>
          <button
            className="detail-panel-close"
            onClick={onClose}
            aria-label="Close panel"
          >
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="detail-panel-content">
          {/* Preview section */}
          <div className="detail-panel-preview">
            {isMedia ? (
              <MediaPlayer
                src={asset.preview_url || asset.full_url}
                type={asset.type || asset.file_type}
                poster={asset.thumb_url}
              />
            ) : (
              <img
                src={previewUrl}
                alt={asset.alt_text || asset.title || asset.filename}
                className="detail-panel-image"
              />
            )}
          </div>

          {/* Actions bar */}
          <div className="detail-panel-actions">
            <RatingStars
              rating={asset.rating || 0}
              onChange={handleRatingChange}
              size="large"
            />

            <div className="detail-panel-action-buttons">
              {mediagraphUrl && (
                <button
                  className="btn btn-secondary"
                  onClick={() => app?.openLink({ url: mediagraphUrl })}
                  title="View on Mediagraph"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
                  </svg>
                  View on Mediagraph
                </button>
              )}
              <div className="download-menu-container" ref={downloadMenuRef}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                  title="Download"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                  </svg>
                  Download
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style={{ marginLeft: 4 }}>
                    <path d="M7 10l5 5 5-5z" />
                  </svg>
                </button>
                {showDownloadMenu && (
                  <div className="download-menu">
                    <div className="download-menu-sizes">
                      {asset.download_sizes?.includes('small') && (
                        <button onClick={() => handleDownload('small')}>Small</button>
                      )}
                      {asset.download_sizes?.includes('medium') && (
                        <button onClick={() => handleDownload('medium')}>Medium</button>
                      )}
                      {asset.download_sizes?.includes('full') && (
                        <button onClick={() => handleDownload('full')}>Full</button>
                      )}
                      {asset.download_sizes?.includes('original') && (
                        <button onClick={() => handleDownload('original')}>Original</button>
                      )}
                      {!asset.download_sizes?.length && (
                        <>
                          <button onClick={() => handleDownload('small')}>Small</button>
                          <button onClick={() => handleDownload('medium')}>Medium</button>
                          <button onClick={() => handleDownload('full')}>Full</button>
                          <button onClick={() => handleDownload('original')}>Original</button>
                        </>
                      )}
                    </div>
                    <label className="download-menu-watermark">
                      <input
                        type="checkbox"
                        checked={downloadWatermarked}
                        onChange={(e) => setDownloadWatermarked(e.target.checked)}
                      />
                      Watermarked
                    </label>
                  </div>
                )}
              </div>

              {!isEditing ? (
                <button
                  className="btn btn-primary"
                  onClick={() => setIsEditing(true)}
                >
                  Edit
                </button>
              ) : (
                <>
                  <button
                    className="btn btn-secondary"
                    onClick={handleCancel}
                    disabled={isSaving}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="detail-panel-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={activeTab === 'info'}
              className={`detail-panel-tab ${activeTab === 'info' ? 'active' : ''}`}
              onClick={() => setActiveTab('info')}
            >
              Info
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'metadata'}
              className={`detail-panel-tab ${activeTab === 'metadata' ? 'active' : ''}`}
              onClick={() => setActiveTab('metadata')}
            >
              Metadata
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'tags'}
              className={`detail-panel-tab ${activeTab === 'tags' ? 'active' : ''}`}
              onClick={() => setActiveTab('tags')}
            >
              Tags
            </button>
          </div>

          {/* Tab content */}
          <div className="detail-panel-tab-content" role="tabpanel">
            {activeTab === 'info' && (
              <div className="detail-info">
                {isEditing ? (
                  <MetadataForm
                    asset={asset}
                    editedFields={editedFields}
                    onChange={handleFieldChange}
                  />
                ) : (
                  <dl className="detail-info-list">
                    <div className="detail-info-item">
                      <dt>Title</dt>
                      <dd>{getValue('title') || '-'}</dd>
                    </div>
                    <div className="detail-info-item">
                      <dt>Description</dt>
                      <dd>{getValue('description') || '-'}</dd>
                    </div>
                    <div className="detail-info-item">
                      <dt>Alt Text</dt>
                      <dd>{getValue('alt_text') || '-'}</dd>
                    </div>
                    <div className="detail-info-item">
                      <dt>Caption</dt>
                      <dd>{getValue('caption') || '-'}</dd>
                    </div>
                    <div className="detail-info-item">
                      <dt>Filename</dt>
                      <dd>{asset.filename}</dd>
                    </div>
                    <div className="detail-info-item">
                      <dt>File Size</dt>
                      <dd>{formatFileSize(asset.file_size)}</dd>
                    </div>
                    {asset.width && asset.height && (
                      <div className="detail-info-item">
                        <dt>Dimensions</dt>
                        <dd>
                          {asset.width} x {asset.height} px
                        </dd>
                      </div>
                    )}
                    {asset.duration && (
                      <div className="detail-info-item">
                        <dt>Duration</dt>
                        <dd>
                          {Math.floor(asset.duration / 60)}:
                          {Math.floor(asset.duration % 60)
                            .toString()
                            .padStart(2, '0')}
                        </dd>
                      </div>
                    )}
                    <div className="detail-info-item">
                      <dt>Created</dt>
                      <dd>{formatDate(asset.created_at)}</dd>
                    </div>
                    {asset.captured_at && (
                      <div className="detail-info-item">
                        <dt>Captured</dt>
                        <dd>{formatDate(asset.captured_at)}</dd>
                      </div>
                    )}
                    <div className="detail-info-item">
                      <dt>Updated</dt>
                      <dd>{formatDate(asset.updated_at)}</dd>
                    </div>
                    {(getValue('credit') || getValue('copyright')) && (
                      <>
                        <div className="detail-info-item">
                          <dt>Credit</dt>
                          <dd>{getValue('credit') || '-'}</dd>
                        </div>
                        <div className="detail-info-item">
                          <dt>Copyright</dt>
                          <dd>{getValue('copyright') || '-'}</dd>
                        </div>
                      </>
                    )}
                  </dl>
                )}
              </div>
            )}

            {activeTab === 'metadata' && (
              <div className="detail-metadata">
                {asset.meta && Object.keys(asset.meta).length > 0 ? (
                  <dl className="detail-info-list">
                    {Object.entries(asset.meta).map(([key, value]) => (
                      <div key={key} className="detail-info-item">
                        <dt>{key}</dt>
                        <dd>{renderMetaValue(value)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="detail-empty">No EXIF/IPTC metadata available</p>
                )}
              </div>
            )}

            {activeTab === 'tags' && (
              <TagList
                tags={asset.tags || []}
                assetId={asset.id}
                app={app}
                onUpdate={onUpdate}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
