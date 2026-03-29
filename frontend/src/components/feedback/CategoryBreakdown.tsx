interface CategoryBreakdownProps {
  proportionsScore: number | null | undefined;
  lineQualityScore: number | null | undefined;
  colorAccuracyScore: number | null | undefined;
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color = score >= 80 ? "#4caf50" : score >= 60 ? "#ff9800" : "#f44336";

  return (
    <div className="category-row">
      <span className="category-label">{label}</span>
      <div className="category-bar-track">
        <div
          className="category-bar-fill"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      <span className="category-score">{score}</span>
    </div>
  );
}

function CategoryBreakdown({
  proportionsScore,
  lineQualityScore,
  colorAccuracyScore,
}: CategoryBreakdownProps) {
  return (
    <div className="category-breakdown" data-testid="category-breakdown">
      <h3 className="feedback-section-title">Category Scores</h3>
      {proportionsScore != null && (
        <ScoreBar label="Proportions" score={proportionsScore} />
      )}
      {lineQualityScore != null && (
        <ScoreBar label="Line Quality" score={lineQualityScore} />
      )}
      {colorAccuracyScore != null && (
        <ScoreBar label="Color Accuracy" score={colorAccuracyScore} />
      )}
    </div>
  );
}

export default CategoryBreakdown;
