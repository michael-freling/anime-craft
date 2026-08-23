import type { Layer } from "../../hooks/useDrawingCanvas";

interface LayerPanelProps {
  layers: Layer[];
  activeLayerId: string;
  onAddLayer: () => void;
  onRemoveLayer: (layerId: string) => void;
  onSelectLayer: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onMoveLayer: (layerId: string, direction: "up" | "down") => void;
}

function LayerPanel({
  layers,
  activeLayerId,
  onAddLayer,
  onRemoveLayer,
  onSelectLayer,
  onToggleVisibility,
  onMoveLayer,
}: LayerPanelProps) {
  // Topmost layer first, the way it looks on the canvas.
  const ordered = [...layers].reverse();

  return (
    <div className="layer-panel" data-testid="layer-panel">
      <div className="layer-panel-header">
        <h4 className="layer-panel-title">Layers</h4>
        <button
          className="toolbar-btn"
          onClick={onAddLayer}
          data-testid="layer-add"
          title="Add a layer above the active one"
        >
          + Add
        </button>
      </div>

      <ul className="layer-list">
        {ordered.map((layer) => {
          const index = layers.findIndex((l) => l.id === layer.id);
          return (
            <li
              key={layer.id}
              className={`layer-item ${layer.id === activeLayerId ? "active" : ""}`}
              data-testid={`layer-item-${layer.id}`}
            >
              <button
                className="layer-name"
                onClick={() => onSelectLayer(layer.id)}
                data-testid={`layer-select-${layer.id}`}
              >
                {layer.name}
              </button>
              <div className="layer-actions">
                <button
                  className="layer-action"
                  onClick={() => onToggleVisibility(layer.id)}
                  aria-label={
                    layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`
                  }
                  data-testid={`layer-visibility-${layer.id}`}
                >
                  {layer.visible ? "◉" : "◌"}
                </button>
                <button
                  className="layer-action"
                  onClick={() => onMoveLayer(layer.id, "up")}
                  disabled={index === layers.length - 1}
                  aria-label={`Move ${layer.name} up`}
                  data-testid={`layer-up-${layer.id}`}
                >
                  ↑
                </button>
                <button
                  className="layer-action"
                  onClick={() => onMoveLayer(layer.id, "down")}
                  disabled={index === 0}
                  aria-label={`Move ${layer.name} down`}
                  data-testid={`layer-down-${layer.id}`}
                >
                  ↓
                </button>
                <button
                  className="layer-action layer-action-danger"
                  onClick={() => onRemoveLayer(layer.id)}
                  disabled={layers.length === 1}
                  aria-label={`Delete ${layer.name}`}
                  data-testid={`layer-delete-${layer.id}`}
                >
                  ✕
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default LayerPanel;
