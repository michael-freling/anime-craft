import { useEffect, useState } from "react";
import { ListReferences } from "../../../bindings/github.com/michael-freling/anime-craft/internal/bff/referenceservice.js";

interface ReferenceImagePickerProps {
  mode: string | null;
  selectedRef: string | null;
  onSelectRef: (id: string) => void;
}

function ReferenceImagePicker({
  mode,
  selectedRef,
  onSelectRef,
}: ReferenceImagePickerProps) {
  const [images, setImages] = useState<any[]>([]);

  useEffect(() => {
    ListReferences(mode ?? "").then((result) => {
      setImages(result ?? []);
    });
  }, [mode]);

  if (!mode) {
    return (
      <div className="reference-picker" data-testid="reference-picker">
        <h3>Reference Image</h3>
        <p className="picker-hint">Select an exercise mode first</p>
      </div>
    );
  }

  return (
    <div className="reference-picker" data-testid="reference-picker">
      <h3>Reference Image</h3>
      {images.length === 0 ? (
        <p className="picker-hint">No reference images available</p>
      ) : (
        <div className="reference-grid">
          {images.map((img) => (
            <div
              key={img.id}
              className={`reference-card ${selectedRef === img.id ? "active" : ""}`}
              onClick={() => onSelectRef(img.id)}
              data-testid={`reference-card-${img.id}`}
            >
              <div className="reference-thumbnail">
                <span className="thumbnail-placeholder">IMG</span>
              </div>
              <div className="reference-info">
                <span className="reference-title">{img.title}</span>
                <span className={`difficulty-badge ${img.difficulty}`}>
                  {img.difficulty}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ReferenceImagePicker;
