import { useEffect } from "react";

interface ImageModalProps {
  src: string;
  alt: string;
  onClose: () => void;
}

function ImageModal({ src, alt, onClose }: ImageModalProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="image-modal-backdrop"
      data-testid="image-modal"
      onClick={onClose}
    >
      <button
        className="image-modal-close"
        data-testid="image-modal-close"
        onClick={onClose}
        aria-label="Close"
      >
        X
      </button>
      <img
        src={src}
        alt={alt}
        className="image-modal-img"
        data-testid="image-modal-img"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

export default ImageModal;
