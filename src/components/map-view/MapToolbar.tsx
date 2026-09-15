import { useState } from 'react';
import { Home, ChevronLeft, Maximize2, Trash2, Layers, MessageSquare } from 'lucide-react';
import { clearAllCache } from '../../utils/db';
import type { LayerName } from './layerUrls';

/** Map toolbar props — navigation, feedback, basemap (year / layer mode live in sidebar). */
interface MapToolbarProps {
  showBackButton: boolean;
  onReset: () => void;
  onGoBack: () => void;
  onFeedbackClick: () => void;
}

/**
 * Map Toolbar Component - Rendered as React overlay at top center
 */
export function MapToolbar({
  showBackButton,
  onReset,
  onGoBack,
  onFeedbackClick,
}: MapToolbarProps): JSX.Element {
  const [activeLayer, setActiveLayer] = useState<LayerName>('Streets');
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);

  const handleFullscreen = (): void => {
    const mapContainer = document.querySelector('.map-container');
    if (!document.fullscreenElement) {
      void mapContainer?.requestFullscreen?.();
    } else {
      void document.exitFullscreen?.();
    }
  };

  const handleClearCache = async (): Promise<void> => {
    await clearAllCache();
  };

  const handleLayerChange = (layer: LayerName): void => {
    setActiveLayer(layer);
    setLayerMenuOpen(false);
    // Dispatch custom event for the map to handle
    window.dispatchEvent(new CustomEvent('changeBaseLayer', { detail: layer }));
  };

  const isDev =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  return (
    <div className="map-toolbar">
      {/* Left section - navigation */}
      <div className="toolbar-section toolbar-left">
        {showBackButton && (
          <button className="toolbar-btn" onClick={onGoBack} title="Go back">
            <ChevronLeft size={18} />
          </button>
        )}
        <button className="toolbar-btn" onClick={onReset} title="Reset to India">
          <Home size={18} />
        </button>
        <button className="toolbar-btn" onClick={handleFullscreen} title="Toggle fullscreen">
          <Maximize2 size={18} />
        </button>
        {isDev && (
          <button className="toolbar-btn" onClick={handleClearCache} title="Clear cache">
            <Trash2 size={18} />
          </button>
        )}
      </div>

      {/* Right section - feedback and layer switcher */}
      <div className="toolbar-section toolbar-right">
        <button
          className="toolbar-btn feedback-btn"
          onClick={onFeedbackClick}
          title="Send feedback or report a bug"
        >
          <MessageSquare size={18} />
        </button>
        <div className="toolbar-dropdown">
          <button
            className="toolbar-btn toolbar-dropdown-btn"
            onClick={() => setLayerMenuOpen(!layerMenuOpen)}
            title="Change map style"
          >
            <Layers size={18} />
          </button>
          <div className={`toolbar-dropdown-menu ${layerMenuOpen ? 'visible' : ''}`}>
            {(['Streets', 'Light', 'Satellite', 'Terrain', 'Vector'] as LayerName[]).map(
              (layer) => (
                <button
                  key={layer}
                  className={`toolbar-dropdown-item ${activeLayer === layer ? 'active' : ''}`}
                  onClick={() => handleLayerChange(layer)}
                >
                  {layer}
                  {layer === 'Vector' && <span className="layer-badge">Fast</span>}
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
