import { useCallback, useEffect, useRef, useState } from "react";
import {
  ListReferences,
  AddReferenceByFilePath,
  GetReferenceImageData,
} from "../../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/referenceservice.js";

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
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const requestedThumbnails = useRef<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

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

  // Load the image data for each reference so the cards show a preview instead
  // of a placeholder. Each image is fetched once; the ref keeps a re-render
  // from re-requesting images that are already loaded.
  useEffect(() => {
    let cancelled = false;
    const missing = images.filter(
      (img) => img?.id && !requestedThumbnails.current.has(img.id),
    );
    if (missing.length === 0) {
      return;
    }
    missing.forEach((img) => requestedThumbnails.current.add(img.id));

    Promise.all(
      missing.map((img) =>
        GetReferenceImageData(img.id)
          .then((dataUrl: string) => [img.id, dataUrl] as const)
          .catch((e: unknown) => {
            // One unreadable image shouldn't blank out the whole picker: keep
            // its placeholder and allow a retry on the next load.
            console.error(
              "ReferenceImagePicker: GetReferenceImageData failed:",
              e,
            );
            requestedThumbnails.current.delete(img.id);
            return null;
          }),
      ),
    ).then((results) => {
      if (cancelled) {
        return;
      }
      const loaded = results.filter(
        (result): result is readonly [string, string] => result !== null,
      );
      if (loaded.length === 0) {
        return;
      }
      setThumbnails((prev) => ({ ...prev, ...Object.fromEntries(loaded) }));
    });

    return () => {
      cancelled = true;
    };
  }, [images]);

  const handleAddClick = async () => {
    try {
      // Dynamically import Dialogs to avoid the @wailsio/runtime index.js
      // side effect (System.invoke("wails:runtime:ready")) at module load time,
      // which causes initialization race conditions in dev mode.
      const { Dialogs } = await import("@wailsio/runtime");

      // Use Wails' native file dialog instead of HTML file input.
      // This returns the file path as a string, avoiding base64 in URL params.
      const filePath = await Dialogs.OpenFile({
        Title: "Select Reference Image",
        Filters: [
          {
            DisplayName: "Images",
            Pattern: "*.png;*.jpg;*.jpeg;*.gif;*.bmp;*.webp",
          },
        ],
      });

      if (!filePath) return; // User cancelled

      setUploading(true);
      setError(null);

      // Extract title from filename
      const fileName = filePath.split(/[/\\]/).pop() || "untitled";
      const title = fileName.replace(/\.[^/.]+$/, "");

      await AddReferenceByFilePath(title, "beginner", filePath);
      await loadReferences();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to upload image";
      console.error("ReferenceImagePicker: upload failed:", err);
      setError(message);
    } finally {
      setUploading(false);
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
              {thumbnails[img.id] ? (
                <img
                  className="reference-thumbnail-img"
                  src={thumbnails[img.id]}
                  alt={img.title}
                  data-testid={`reference-thumbnail-${img.id}`}
                />
              ) : (
                <span className="thumbnail-placeholder">IMG</span>
              )}
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

export default ReferenceImagePicker;
