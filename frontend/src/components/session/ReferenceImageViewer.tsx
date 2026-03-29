import { useEffect, useState } from "react";
import { GetReference } from "../../../bindings/github.com/michael-freling/anime-craft/internal/bff/referenceservice.js";

interface ReferenceImageViewerProps {
  referenceId: string;
}

function ReferenceImageViewer({ referenceId }: ReferenceImageViewerProps) {
  const [title, setTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setTitle(null);

    GetReference(referenceId)
      .then((ref) => {
        if (!cancelled) {
          setTitle(ref.title);
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

  if (!title) {
    return (
      <div className="session-loading" data-testid="reference-loading">
        Loading reference...
      </div>
    );
  }

  return (
    <div className="reference-placeholder" data-testid="reference-placeholder">
      <span className="reference-placeholder-text">{title}</span>
    </div>
  );
}

export default ReferenceImageViewer;
