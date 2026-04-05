import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import ScoreDisplay from "../components/feedback/ScoreDisplay";
import CategoryBreakdown from "../components/feedback/CategoryBreakdown";
import FeedbackComments from "../components/feedback/FeedbackComments";
import SideBySideComparison from "../components/feedback/SideBySideComparison";
import {
  RequestFeedback,
  GetFeedback,
} from "../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/feedbackservice.js";
import { GetSession } from "../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/sessionservice.js";
import { GetReference } from "../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/referenceservice.js";
import { GetDrawing } from "../../bindings/github.com/michael-freling/anime-craft/gateway/internal/bff/drawingservice.js";

interface FeedbackData {
  overallScore: number;
  proportionsScore: number | null;
  lineQualityScore: number | null;
  colorAccuracyScore: number | null;
  summary: string;
  details: string;
  strengths: string[];
  improvements: string[];
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
          overallScore: fb.overallScore,
          proportionsScore: fb.proportionsScore ?? null,
          lineQualityScore: fb.lineQualityScore ?? null,
          colorAccuracyScore: fb.colorAccuracyScore ?? null,
          summary: fb.summary,
          details: fb.details,
          strengths: fb.strengths || [],
          improvements: fb.improvements || [],
        });

        // Load images for comparison
        const session = await GetSession(id!);
        if (cancelled) return;

        const [ref, drawing] = await Promise.all([
          GetReference(session.referenceImageId),
          GetDrawing(id!),
        ]);

        if (cancelled) return;
        setReferenceImageUrl(ref.filePath);
        setDrawingImageUrl(drawing.filePath);
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

      <div className="feedback-top">
        <ScoreDisplay score={feedback.overallScore} />
        <CategoryBreakdown
          proportionsScore={feedback.proportionsScore}
          lineQualityScore={feedback.lineQualityScore}
          colorAccuracyScore={feedback.colorAccuracyScore}
        />
      </div>

      <FeedbackComments
        summary={feedback.summary}
        strengths={feedback.strengths}
        improvements={feedback.improvements}
      />

      {referenceImageUrl && drawingImageUrl && (
        <SideBySideComparison
          referenceImageUrl={referenceImageUrl}
          drawingImageUrl={drawingImageUrl}
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
