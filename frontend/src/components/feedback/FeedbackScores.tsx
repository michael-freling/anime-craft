interface FeedbackScoresProps {
  overallScore?: number;
  proportionsScore?: number;
  lineQualityScore?: number;
  accuracyScore?: number;
}

function getScoreColorClass(score: number): string {
  if (score >= 70) return "score-fill-green";
  if (score >= 40) return "score-fill-yellow";
  return "score-fill-red";
}

interface ScoreBarProps {
  label: string;
  score: number;
}

function ScoreBar({ label, score }: ScoreBarProps) {
  const colorClass = getScoreColorClass(score);

  return (
    <div className="score-bar" data-testid={`score-bar-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="score-bar-header">
        <span className="score-bar-label">{label}</span>
        <span className="score-bar-value">{score}</span>
      </div>
      <div className="score-bar-track">
        <div
          className={`score-fill ${colorClass}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function hasAnyScore(props: FeedbackScoresProps): boolean {
  return (
    (props.overallScore != null && props.overallScore > 0) ||
    (props.proportionsScore != null && props.proportionsScore > 0) ||
    (props.lineQualityScore != null && props.lineQualityScore > 0) ||
    (props.accuracyScore != null && props.accuracyScore > 0)
  );
}

function FeedbackScores(props: FeedbackScoresProps) {
  const { overallScore, proportionsScore, lineQualityScore, accuracyScore } =
    props;

  if (!hasAnyScore(props)) {
    return (
      <div className="feedback-scores" data-testid="feedback-scores">
        <div className="feedback-scores-analyzing" data-testid="feedback-scores-analyzing">
          Analyzing...
        </div>
      </div>
    );
  }

  return (
    <div className="feedback-scores" data-testid="feedback-scores">
      {overallScore != null && overallScore > 0 && (
        <ScoreBar label="Overall" score={overallScore} />
      )}
      {proportionsScore != null && proportionsScore > 0 && (
        <ScoreBar label="Proportions" score={proportionsScore} />
      )}
      {lineQualityScore != null && lineQualityScore > 0 && (
        <ScoreBar label="Line Quality" score={lineQualityScore} />
      )}
      {accuracyScore != null && accuracyScore > 0 && (
        <ScoreBar label="Accuracy" score={accuracyScore} />
      )}
    </div>
  );
}

export default FeedbackScores;
