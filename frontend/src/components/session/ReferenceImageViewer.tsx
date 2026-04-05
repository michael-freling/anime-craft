import { useEffect, useState } from "react";
import {
  GetReference,
  GetReferenceImageData,
} from "../../../bindings/github.com/michael-freling/anime-craft/internal/bff/referenceservice.js";

interface ReferenceImageViewerProps {
  referenceId: string;
}

function ReferenceImageViewer({ referenceId }: ReferenceImageViewerProps) {
  const [title, setTitle] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setTitle(null);
    setImageDataUrl(null);

    Promise.all([GetReference(referenceId), GetReferenceImageData(referenceId)])
      .then(([ref, dataUrl]) => {
        if (!cancelled) {
          setTitle(ref.title);
          setImageDataUrl(dataUrl);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load reference");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [referenceId]);

  if (error) {
    return (
      <div className="session-loading" data-testid="reference-error">
        {error}
      </div>
    );
  }

  if (!title || !imageDataUrl) {
    return (
      <div className="session-loading" data-testid="reference-loading">
        Loading reference...
      </div>
    );
  }

  return (
    <img
      className="session-reference-img"
      data-testid="reference-image"
      src={imageDataUrl}
      alt={title}
    />
  );
}

export default ReferenceImageViewer;
