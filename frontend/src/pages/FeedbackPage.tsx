import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import SideBySideComparison from "../components/feedback/SideBySideComparison";
import {
  RequestFeedback,
  GetFeedback,
} from "../../bindings/github.com/michael-freling/anime-craft/internal/bff/feedbackservice.js";
import { GetSession } from "../../bindings/github.com/michael-freling/anime-craft/internal/bff/sessionservice.js";
import { GetReferenceImageData } from "../../bindings/github.com/michael-freling/anime-craft/internal/bff/referenceservice.js";
import { GetDrawingImageData } from "../../bindings/github.com/michael-freling/anime-craft/internal/bff/drawingservice.js";

interface FeedbackData {
  referenceLineArt: string; // base64 data URI
}

function FeedbackPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);
  const [referenceImageUrl, setReferenceImageUrl] = useState<string>("");
  const [drawingImageUrl, setDrawingImageUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function loadFeedback() {
      try {
        // Try to get existing feedback first
        let fb;
        try {
          fb = await GetFeedback(id!);
        } catch {
          // No feedback yet, request it
          fb = await RequestFeedback(id!);
        }

        if (cancelled) return;

        setFeedback({
          referenceLineArt: fb.referenceLineArt || "",
        });

        // Load images for comparison
        const session = await GetSession(id!);
        if (cancelled) return;

        const [refImageData, drawingImageData] = await Promise.all([
          GetReferenceImageData(session.referenceImageId),
          GetDrawingImageData(id!),
        ]);

        if (cancelled) return;
        setReferenceImageUrl(refImageData);
        setDrawingImageUrl(drawingImageData);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load feedback");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadFeedback();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="feedback-page" data-testid="feedback-page">
        <div className="feedback-loading" data-testid="feedback-loading">
          Analyzing your drawing...
        </div>
      </div>
    );
  }

  if (error || !feedback) {
    return (
      <div className="feedback-page" data-testid="feedback-page">
        <div className="feedback-error" data-testid="feedback-error">
          {error || "Failed to load feedback"}
        </div>
      </div>
    );
  }

  return (
    <div className="feedback-page" data-testid="feedback-page">
      <h1>Drawing Feedback</h1>

      {referenceImageUrl && drawingImageUrl && (
        <SideBySideComparison
          referenceImageUrl={referenceImageUrl}
          drawingImageUrl={drawingImageUrl}
          lineArtUrl={feedback.referenceLineArt}
        />
      )}

      <button
        className="start-session-btn feedback-new-btn"
        data-testid="new-session-btn"
        onClick={() => navigate("/")}
      >
        Start New Session
      </button>
    </div>
  );
}

export default FeedbackPage;
