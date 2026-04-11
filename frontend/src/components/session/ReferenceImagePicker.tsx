import { useCallback, useEffect, useRef, useState } from "react";
import { ListReferences, AddReference } from "../../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/referenceservice.js";

interface ReferenceImagePickerProps {
  selectedRef: string | null;
  onSelectRef: (id: string) => void;
}

const EXERCISE_MODE = "line_work";

function ReferenceImagePicker({
  selectedRef,
  onSelectRef,
}: ReferenceImagePickerProps) {
  const [images, setImages] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadReferences = useCallback(() => {
    setError(null);
    return ListReferences(EXERCISE_MODE)
      .then((result) => {
        setImages(result ?? []);
      })
      .catch((e) => {
        const message =
          e instanceof Error ? e.message : "Failed to load references";
        console.error("ReferenceImagePicker: ListReferences failed:", e);
        setError(message);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    ListReferences(EXERCISE_MODE)
      .then((result) => {
        if (!cancelled) {
          setImages(result ?? []);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          const message =
            e instanceof Error ? e.message : "Failed to load references";
          console.error("ReferenceImagePicker: ListReferences failed:", e);
          setError(message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAddClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const base64Data = await readFileAsBase64(file);
      const title = file.name.replace(/\.[^/.]+$/, "");
      await AddReference(title, "beginner", base64Data);
      await loadReferences();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to upload image";
      console.error("ReferenceImagePicker: upload failed:", err);
      setError(message);
    } finally {
      setUploading(false);
      // Reset file input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const addImageCard = (
    <div
      className="reference-card reference-card-add"
      onClick={handleAddClick}
      data-testid="reference-card-add"
      role="button"
      aria-label="Add Image"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: "none" }}
        data-testid="reference-file-input"
      />
      <div className="reference-card-add-content">
        <span className="reference-card-add-icon">+</span>
        <span className="reference-card-add-label">
          {uploading ? "Uploading..." : "Add Image"}
        </span>
      </div>
    </div>
  );

  return (
    <div className="reference-picker" data-testid="reference-picker">
      <h3>Reference Image</h3>
      {error && (
        <p className="home-error" data-testid="reference-picker-error">
          {error}
        </p>
      )}
      <div className="reference-grid">
        {addImageCard}
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
    </div>
  );
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix (e.g. "data:image/png;base64,")
      const base64 = result.split(",")[1] ?? result;
      resolve(base64);
    };
    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };
    reader.readAsDataURL(file);
  });
}

export default ReferenceImagePicker;
