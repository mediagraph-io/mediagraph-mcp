import { useCallback } from 'react';
import type { Asset } from '../types';

interface MetadataFormProps {
  asset: Asset;
  editedFields: Partial<Asset>;
  onChange: (field: keyof Asset, value: unknown) => void;
}

export function MetadataForm({ asset, editedFields, onChange }: MetadataFormProps) {
  // Get current value (edited or original)
  const getValue = useCallback(
    <K extends keyof Asset>(field: K): string => {
      const value = field in editedFields ? editedFields[field] : asset[field];
      return value?.toString() || '';
    },
    [asset, editedFields]
  );

  const handleChange = useCallback(
    (field: keyof Asset) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange(field, e.target.value);
    },
    [onChange]
  );

  return (
    <div className="metadata-form">
      <div className="form-group">
        <label htmlFor="title">Title</label>
        <input
          id="title"
          type="text"
          value={getValue('title')}
          onChange={handleChange('title')}
          placeholder="Enter title..."
        />
      </div>

      <div className="form-group">
        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          value={getValue('description')}
          onChange={handleChange('description')}
          placeholder="Enter description..."
          rows={3}
        />
      </div>

      <div className="form-group">
        <label htmlFor="alt_text">Alt Text</label>
        <textarea
          id="alt_text"
          value={getValue('alt_text')}
          onChange={handleChange('alt_text')}
          placeholder="Describe the image for accessibility..."
          rows={2}
        />
      </div>

      <div className="form-group">
        <label htmlFor="caption">Caption</label>
        <input
          id="caption"
          type="text"
          value={getValue('caption')}
          onChange={handleChange('caption')}
          placeholder="Enter caption..."
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="credit">Credit</label>
          <input
            id="credit"
            type="text"
            value={getValue('credit')}
            onChange={handleChange('credit')}
            placeholder="Photographer/creator..."
          />
        </div>

        <div className="form-group">
          <label htmlFor="copyright">Copyright</label>
          <input
            id="copyright"
            type="text"
            value={getValue('copyright')}
            onChange={handleChange('copyright')}
            placeholder="Copyright notice..."
          />
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="notes">Notes</label>
        <textarea
          id="notes"
          value={getValue('notes')}
          onChange={handleChange('notes')}
          placeholder="Internal notes..."
          rows={2}
        />
      </div>
    </div>
  );
}
