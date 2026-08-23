interface FeedbackDetailsProps {
  summary?: string;
  details?: string;
  strengths?: string[];
  improvements?: string[];
}

function FeedbackDetails({
  summary,
  details,
  strengths,
  improvements,
}: FeedbackDetailsProps) {
  const hasContent =
    summary ||
    details ||
    (strengths && strengths.length > 0) ||
    (improvements && improvements.length > 0);

  if (!hasContent) {
    return null;
  }

  return (
    <div className="feedback-details" data-testid="feedback-details">
      {summary && (
        <div className="feedback-summary" data-testid="feedback-summary">
          <h3 className="feedback-section-title">Summary</h3>
          <p>{summary}</p>
        </div>
      )}

      {strengths && strengths.length > 0 && (
        <div className="feedback-strengths" data-testid="feedback-strengths">
          <h3 className="feedback-section-title">What you did well</h3>
          <ul className="feedback-list strengths-list">
            {strengths.map((item, i) => (
              <li key={i}>
                <span className="feedback-icon">&#10003;</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {improvements && improvements.length > 0 && (
        <div className="feedback-improvements" data-testid="feedback-improvements">
          <h3 className="feedback-section-title">Areas to improve</h3>
          <ul className="feedback-list improvements-list">
            {improvements.map((item, i) => (
              <li key={i}>
                <span className="feedback-icon">&#8594;</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {details && (
        <div className="feedback-details-text" data-testid="feedback-details-text">
          <h3 className="feedback-section-title">Details</h3>
          <p>{details}</p>
        </div>
      )}
    </div>
  );
}

export default FeedbackDetails;
