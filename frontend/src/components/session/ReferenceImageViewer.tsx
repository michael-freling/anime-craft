import { useEffect, useState } from "react";
import { GetReference } from "../../../bindings/github.com/michael-freling/anime-craft/internal/bff/referenceservice.js";

interface ReferenceImageViewerProps {
  referenceId: string;
}

function ReferenceImageViewer({ referenceId }: ReferenceImageViewerProps) {
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setImagePath(null);

    GetReference(referenceId)
      .then((ref) => {
        if (!cancelled) {
          setImagePath(ref.filePath);
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

  if (!imagePath) {
    return (
      <div className="session-loading" data-testid="reference-loading">
        Loading reference...
      </div>
    );
  }

  return (
    <img
      src={imagePath}
      alt="Reference"
      className="session-reference-img"
      data-testid="reference-image"
      style={{ maxWidth: 500 }}
    />
  );
}

export default ReferenceImageViewer;
