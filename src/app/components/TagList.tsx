import { useState, useCallback, useMemo } from 'react';
import type { App } from '@modelcontextprotocol/ext-apps';
import type { Asset } from '../types';

// Tags can come as strings or objects from the API
type TagInput = string | { name?: string; [key: string]: unknown };

interface TagListProps {
  tags: TagInput[];
  assetId: number;
  app: App | null;
  onUpdate: (id: number, updates: Partial<Asset>) => Promise<void>;
}

export function TagList({ tags, assetId, app, onUpdate }: TagListProps) {
  // Normalize tags to strings
  const normalizedTags = useMemo(() => {
    return tags.map(tag => typeof tag === 'string' ? tag : tag.name || '').filter(Boolean);
  }, [tags]);
  const [newTag, setNewTag] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddTag = useCallback(async () => {
    if (!app || !newTag.trim()) return;

    setIsSubmitting(true);
    try {
      const result = await app.callServerTool({
        name: 'add_tags_to_asset',
        arguments: {
          id: assetId,
          tags: [newTag.trim()],
        },
      });

      if (!result.isError) {
        setNewTag('');
        setIsAdding(false);
        // Parse the response to get updated tags
        const textContent = result.content?.find((c) => c.type === 'text');
        if (textContent && textContent.type === 'text') {
          const response = JSON.parse((textContent as { text: string }).text);
          // The response contains { tags: [...tag objects...] }
          // Normalize tag objects to strings
          const tagNames = (response.tags || []).map((tag: unknown) => {
            if (typeof tag === 'string') return tag;
            if (tag && typeof tag === 'object' && 'name' in tag) {
              return (tag as { name: string }).name;
            }
            return '';
          }).filter(Boolean);
          // Update the asset with normalized tag strings
          await onUpdate(assetId, { tags: tagNames });
        }
      }
    } catch (err) {
      console.error('Failed to add tag:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [app, assetId, newTag, onUpdate]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddTag();
      } else if (e.key === 'Escape') {
        setIsAdding(false);
        setNewTag('');
      }
    },
    [handleAddTag]
  );

  return (
    <div className="tag-list">
      {normalizedTags.length > 0 ? (
        <div className="tag-chips">
          {normalizedTags.map((tag, index) => (
            <span key={index} className="tag-chip">
              {tag}
            </span>
          ))}
        </div>
      ) : (
        <p className="detail-empty">No tags assigned</p>
      )}

      <div className="tag-add-section">
        {isAdding ? (
          <div className="tag-add-form">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter tag name..."
              autoFocus
              disabled={isSubmitting}
            />
            <button
              className="btn btn-primary btn-small"
              onClick={handleAddTag}
              disabled={!newTag.trim() || isSubmitting}
            >
              {isSubmitting ? 'Adding...' : 'Add'}
            </button>
            <button
              className="btn btn-secondary btn-small"
              onClick={() => {
                setIsAdding(false);
                setNewTag('');
              }}
              disabled={isSubmitting}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="btn btn-secondary"
            onClick={() => setIsAdding(true)}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
            Add Tag
          </button>
        )}
      </div>
    </div>
  );
}
