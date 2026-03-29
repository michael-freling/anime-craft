interface FeedbackCommentsProps {
  summary: string;
  strengths: string[];
  improvements: string[];
}

function FeedbackComments({
  summary,
  strengths,
  improvements,
}: FeedbackCommentsProps) {
  return (
    <div className="feedback-comments" data-testid="feedback-comments">
      <div className="feedback-summary" data-testid="feedback-summary">
        <h3 className="feedback-section-title">Summary</h3>
        <p>{summary}</p>
      </div>

      {strengths.length > 0 && (
        <div className="feedback-list-section" data-testid="feedback-strengths">
          <h3 className="feedback-section-title">Strengths</h3>
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

      {improvements.length > 0 && (
        <div className="feedback-list-section" data-testid="feedback-improvements">
          <h3 className="feedback-section-title">Areas to Improve</h3>
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
    </div>
  );
}

export default FeedbackComments;
