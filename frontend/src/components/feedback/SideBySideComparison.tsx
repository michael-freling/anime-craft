interface SideBySideComparisonProps {
  referenceImageUrl: string;
  drawingImageUrl: string;
}

function SideBySideComparison({
  referenceImageUrl,
  drawingImageUrl,
}: SideBySideComparisonProps) {
  return (
    <div className="side-by-side" data-testid="side-by-side">
      <div className="comparison-panel">
        <h4 className="comparison-label">Reference</h4>
        <img
          src={referenceImageUrl}
          alt="Reference"
          className="comparison-img"
          data-testid="comparison-reference"
        />
      </div>
      <div className="comparison-panel">
        <h4 className="comparison-label">Your Drawing</h4>
        <img
          src={drawingImageUrl}
          alt="Your drawing"
          className="comparison-img"
          data-testid="comparison-drawing"
        />
      </div>
    </div>
  );
}

export default SideBySideComparison;
