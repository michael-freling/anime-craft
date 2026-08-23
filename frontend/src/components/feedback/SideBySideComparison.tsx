import { useState } from "react";
import ImageModal from "./ImageModal";

interface SideBySideComparisonProps {
  referenceImageUrl: string;
  drawingImageUrl: string;
  lineArtUrl?: string;
  comparisonHeatmapUrl?: string;
}

function SideBySideComparison({
  referenceImageUrl,
  drawingImageUrl,
  lineArtUrl,
  comparisonHeatmapUrl,
}: SideBySideComparisonProps) {
  const [modalImage, setModalImage] = useState<{
    src: string;
    alt: string;
  } | null>(null);

  // Use line art for the main comparison when available, otherwise fall back to reference
  const mainLeftUrl = lineArtUrl || referenceImageUrl;
  const mainLeftAlt = lineArtUrl ? "Reference line art" : "Reference";
  const mainLeftLabel = lineArtUrl ? "Reference Line Art" : "Reference";
  const mainLeftTestId = lineArtUrl
    ? "comparison-lineart"
    : "comparison-reference";

  return (
    <>
      <div className="comparison-sections" data-testid="side-by-side">
        {/* Main comparison */}
        <div className="comparison-main">
          <h3 className="comparison-section-title">Comparison</h3>
          <div className="comparison-pair">
            <div className="comparison-panel">
              <h4 className="comparison-label">{mainLeftLabel}</h4>
              <img
                src={mainLeftUrl}
                alt={mainLeftAlt}
                className="comparison-img"
                data-testid={mainLeftTestId}
                onClick={() =>
                  setModalImage({ src: mainLeftUrl, alt: mainLeftAlt })
                }
              />
            </div>
            <div className="comparison-panel">
              <h4 className="comparison-label">Your Drawing</h4>
              <img
                src={drawingImageUrl}
                alt="Your drawing"
                className="comparison-img"
                data-testid="comparison-drawing"
                onClick={() =>
                  setModalImage({ src: drawingImageUrl, alt: "Your drawing" })
                }
              />
            </div>
          </div>
        </div>

        {/* Supporting images */}
        <div className="comparison-details">
          <h3 className="comparison-section-title">Details</h3>
          <div className="comparison-pair">
            <div className="comparison-panel">
              <h4 className="comparison-label">Reference (Original)</h4>
              <img
                src={referenceImageUrl}
                alt="Reference (original)"
                className="comparison-img"
                data-testid="comparison-reference-detail"
                onClick={() =>
                  setModalImage({
                    src: referenceImageUrl,
                    alt: "Reference (original)",
                  })
                }
              />
            </div>
            {comparisonHeatmapUrl && (
              <div className="comparison-panel">
                <h4 className="comparison-label">SSIM Heatmap</h4>
                <img
                  src={comparisonHeatmapUrl}
                  alt="SSIM comparison heatmap"
                  className="comparison-img"
                  data-testid="comparison-heatmap"
                  onClick={() =>
                    setModalImage({
                      src: comparisonHeatmapUrl,
                      alt: "SSIM comparison heatmap",
                    })
                  }
                />
                <div
                  className="diff-legend"
                  style={{
                    display: "flex",
                    gap: "12px",
                    justifyContent: "center",
                    fontSize: "12px",
                    marginTop: "4px",
                  }}
                >
                  <span>
                    <span style={{ color: "#dc3232" }}>&#9632;</span> Needs work
                  </span>
                  <span>
                    <span style={{ color: "#c8c800" }}>&#9632;</span> Moderate
                  </span>
                  <span>
                    <span style={{ color: "#32b432" }}>&#9632;</span> Good match
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {modalImage && (
        <ImageModal
          src={modalImage.src}
          alt={modalImage.alt}
          onClose={() => setModalImage(null)}
        />
      )}
    </>
  );
}

export default SideBySideComparison;
