import { useState, useCallback, useEffect } from 'react';
import { useApp, useHostStyleVariables } from '@modelcontextprotocol/ext-apps/react';
import type { McpUiToolResultNotification, McpUiToolInputNotification } from '@modelcontextprotocol/ext-apps';
import { Gallery } from './components/Gallery';
import { DetailPanel } from './components/DetailPanel';
import type { Asset, SearchResponse } from './types';

type ToolResult = McpUiToolResultNotification['params'];
type ToolInput = McpUiToolInputNotification['params'];

// Normalize asset tags from objects to strings
function normalizeAssetTags(asset: Asset): Asset {
  if (!asset.tags || !Array.isArray(asset.tags)) return asset;
  const normalizedTags = asset.tags.map((tag: unknown) => {
    if (typeof tag === 'string') return tag;
    if (tag && typeof tag === 'object' && 'name' in tag) {
      return (tag as { name: string }).name;
    }
    return '';
  }).filter(Boolean);
  return { ...asset, tags: normalizedTags };
}

interface AppState {
  searchResponse: SearchResponse | null;
  selectedAsset: Asset | null;
  isLoading: boolean;
  error: string | null;
  receivedData: boolean;
}

export default function App() {
  const [state, setState] = useState<AppState>({
    searchResponse: null,
    selectedAsset: null,
    isLoading: true,
    error: null,
    receivedData: false,
  });

  // Timeout for initial data load - if no data after 30s, show error
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!state.receivedData && state.isLoading) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Timed out waiting for search results. Please try again.',
        }));
      }
    }, 30000);

    return () => clearTimeout(timeout);
  }, [state.receivedData, state.isLoading]);

  // Handle tool results from the MCP server
  const handleToolResult = useCallback((result: ToolResult) => {
    console.log('[Mediagraph App] Tool result received:', {
      isError: result.isError,
      toolName: result.toolName,
      contentLength: result.content?.length,
    });

    if (result.isError) {
      const errorText = result.content?.[0]?.type === 'text'
        ? (result.content[0] as { text: string }).text
        : 'An error occurred';
      console.error('[Mediagraph App] Tool error:', errorText);
      setState(prev => ({
        ...prev,
        isLoading: false,
        receivedData: true,
        error: errorText,
      }));
      return;
    }

    try {
      const textContent = result.content?.find(c => c.type === 'text');
      if (textContent && textContent.type === 'text') {
        const data = JSON.parse((textContent as { text: string }).text);
        console.log('[Mediagraph App] Parsed data:', {
          hasAssets: !!data.assets,
          assetCount: data.assets?.length,
          hasId: !!data.id,
        });
        if (data.assets) {
          setState(prev => ({
            ...prev,
            searchResponse: data,
            isLoading: false,
            error: null,
            receivedData: true,
          }));
          console.log('[Mediagraph App] Gallery updated with', data.assets.length, 'assets');
          console.log('[Mediagraph App] Organization slug:', data.organization_slug);
        } else if (data.id) {
          // Single asset response (from get_asset or update_asset)
          const normalizedAsset = normalizeAssetTags(data);
          setState(prev => ({
            ...prev,
            selectedAsset: normalizedAsset,
            isLoading: false,
            receivedData: true,
          }));
          console.log('[Mediagraph App] Asset detail loaded:', data.id);
        } else {
          console.warn('[Mediagraph App] Unexpected data structure:', Object.keys(data));
        }
      } else {
        console.warn('[Mediagraph App] No text content in result:', result.content);
      }
    } catch (err) {
      console.error('[Mediagraph App] Failed to parse tool result:', err);
      setState(prev => ({
        ...prev,
        isLoading: false,
        receivedData: true,
        error: 'Failed to parse search results',
      }));
    }
  }, []);

  // Handle streaming tool input
  const handleToolInput = useCallback((input: ToolInput) => {
    console.log('[Mediagraph App] Tool input received:', input.toolName);
    // Tool input comes before result, can be used for loading states
    // Reset loading state when new tool input starts
    if (input.toolName === 'search_assets_visual') {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
    }
  }, []);

  // Set up MCP App connection
  const { app, isConnected, error: connectionError } = useApp({
    appInfo: { name: 'Mediagraph', version: '1.0.0' },
    capabilities: {},
    onAppCreated: (app) => {
      console.log('[Mediagraph App] App created, setting up callbacks');
      app.ontoolresult = handleToolResult;
      app.ontoolinput = handleToolInput;
    },
  });

  // Log connection state changes
  useEffect(() => {
    console.log('[Mediagraph App] Connection state:', { isConnected, hasError: !!connectionError });
    if (connectionError) {
      console.error('[Mediagraph App] Connection error:', connectionError);
    }
  }, [isConnected, connectionError]);

  // Manually trigger resize after content changes to fix height issues
  useEffect(() => {
    if (state.searchResponse && app) {
      // Wait for DOM to update, then notify host of actual size
      requestAnimationFrame(() => {
        const height = document.documentElement.scrollHeight;
        const width = document.documentElement.scrollWidth;
        console.log('[Mediagraph App] Sending size update:', { width, height });
        app.sendSizeChanged({ width, height });
      });
    }
  }, [state.searchResponse, app]);

  // Resize when detail panel opens/closes
  useEffect(() => {
    if (app) {
      // Use setTimeout to allow DOM to update after state change
      setTimeout(() => {
        // When detail panel is open, request at least 700px height
        const minHeight = state.selectedAsset ? 700 : 0;
        const contentHeight = document.documentElement.scrollHeight;
        const height = Math.max(contentHeight, minHeight);
        const width = document.documentElement.scrollWidth;
        console.log('[Mediagraph App] Detail panel size update:', { width, height, hasSelected: !!state.selectedAsset, contentHeight, minHeight });
        app.sendSizeChanged({ width, height });
      }, 50);
    }
  }, [state.selectedAsset, app]);

  // Apply host styles (theme, fonts, etc.)
  useHostStyleVariables(app);

  // Handle asset selection - fetch full details
  const handleSelectAsset = useCallback(async (asset: Asset) => {
    if (!app) return;

    setState(prev => ({ ...prev, selectedAsset: asset, isLoading: true }));

    try {
      const result = await app.callServerTool({
        name: 'get_asset',
        arguments: {
          id: asset.id,
          include_renditions: true,
          include_meta: true,
        },
      });

      if (result.isError) {
        setState(prev => ({ ...prev, isLoading: false }));
        return;
      }

      const textContent = result.content?.find(c => c.type === 'text');
      if (textContent && textContent.type === 'text') {
        const rawAsset = JSON.parse((textContent as { text: string }).text);
        const fullAsset = normalizeAssetTags(rawAsset);
        setState(prev => ({
          ...prev,
          selectedAsset: fullAsset,
          isLoading: false,
        }));
      }
    } catch (err) {
      console.error('Failed to fetch asset details:', err);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [app]);

  // Handle asset update
  const handleUpdateAsset = useCallback(async (id: number, updates: Partial<Asset>) => {
    if (!app) return;

    try {
      const result = await app.callServerTool({
        name: 'update_asset',
        arguments: { id, ...updates },
      });

      if (result.isError) return;

      const textContent = result.content?.find(c => c.type === 'text');
      if (textContent && textContent.type === 'text') {
        const rawAsset = JSON.parse((textContent as { text: string }).text);
        const updatedAsset = normalizeAssetTags(rawAsset);
        setState(prev => ({
          ...prev,
          selectedAsset: updatedAsset,
          searchResponse: prev.searchResponse ? {
            ...prev.searchResponse,
            assets: prev.searchResponse.assets.map(a =>
              a.id === updatedAsset.id ? { ...a, ...updatedAsset } : a
            ),
          } : null,
        }));
      }
    } catch (err) {
      console.error('Failed to update asset:', err);
    }
  }, [app]);

  // Handle pagination
  const handlePageChange = useCallback(async (page: number) => {
    if (!app || !state.searchResponse) return;

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      // Re-run the search with new page
      const result = await app.callServerTool({
        name: 'search_assets',
        arguments: {
          page,
          per_page: state.searchResponse.per_page,
          include_renditions: true,
        },
      });

      if (result.isError) {
        setState(prev => ({ ...prev, isLoading: false }));
        return;
      }

      const textContent = result.content?.find(c => c.type === 'text');
      if (textContent && textContent.type === 'text') {
        const data = JSON.parse((textContent as { text: string }).text);
        setState(prev => ({
          ...prev,
          searchResponse: data,
          isLoading: false,
        }));
      }
    } catch (err) {
      console.error('Failed to change page:', err);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [app, state.searchResponse]);

  // Handle adding asset to lightbox
  const handleAddToLightbox = useCallback(async (assetId: number, lightboxId: number) => {
    if (!app) return;

    try {
      await app.callServerTool({
        name: 'add_asset_to_lightbox',
        arguments: { lightbox_id: lightboxId, asset_id: assetId },
      });
    } catch (err) {
      console.error('Failed to add to lightbox:', err);
    }
  }, [app]);

  // Handle close detail panel
  const handleCloseDetail = useCallback(() => {
    setState(prev => ({ ...prev, selectedAsset: null }));
  }, []);

  // Connection states
  if (connectionError) {
    return (
      <div className="app-error">
        <h2>Connection Error</h2>
        <p>{connectionError.message}</p>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <p>Connecting to Mediagraph...</p>
      </div>
    );
  }

  // Error state
  if (state.error) {
    return (
      <div className="app-error">
        <h2>Error</h2>
        <p>{state.error}</p>
      </div>
    );
  }

  // Waiting for initial data
  if (!state.searchResponse && state.isLoading) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <p>Loading assets...</p>
      </div>
    );
  }

  return (
    <div className={`app ${state.selectedAsset ? 'has-detail-panel' : ''}`}>
      {state.searchResponse && (
        <Gallery
          assets={state.searchResponse.assets}
          total={state.searchResponse.total}
          page={state.searchResponse.page}
          perPage={state.searchResponse.per_page}
          totalPages={state.searchResponse.total_pages}
          onSelectAsset={handleSelectAsset}
          onPageChange={handlePageChange}
          isLoading={state.isLoading}
          app={app}
        />
      )}

      {state.selectedAsset && (
        <DetailPanel
          asset={state.selectedAsset}
          organizationSlug={state.searchResponse?.organization_slug}
          onClose={handleCloseDetail}
          onUpdate={handleUpdateAsset}
          onAddToLightbox={handleAddToLightbox}
          app={app}
        />
      )}
    </div>
  );
}
