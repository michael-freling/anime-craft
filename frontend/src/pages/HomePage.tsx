import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ExerciseModeSelector from "../components/session/ExerciseModeSelector";
import ReferenceImagePicker from "../components/session/ReferenceImagePicker";
import { StartSession } from "../../bindings/github.com/michael-freling/anime-craft/internal/bff/sessionservice.js";

function HomePage() {
  const navigate = useNavigate();
  const [selectedMode, setSelectedMode] = useState<string | null>(null);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectMode = (mode: string) => {
    setSelectedMode(mode);
    setSelectedRef(null);
    setError(null);
  };

  const handleStart = async () => {
    if (!selectedMode || !selectedRef) return;
    setIsStarting(true);
    setError(null);
    try {
      const session = await StartSession(selectedMode, selectedRef);
      navigate(`/session/${session.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start session");
      setIsStarting(false);
    }
  };

  return (
    <div className="home-page" data-testid="home-page">
      <h1>Anime Craft</h1>
      <ExerciseModeSelector
        selectedMode={selectedMode}
        onSelectMode={handleSelectMode}
      />
      <ReferenceImagePicker
        mode={selectedMode}
        selectedRef={selectedRef}
        onSelectRef={setSelectedRef}
      />
      {error && (
        <div className="home-error" data-testid="home-error">
          {error}
        </div>
      )}
      <button
        className="start-session-btn"
        data-testid="start-session-btn"
        disabled={!selectedMode || !selectedRef || isStarting}
        onClick={handleStart}
      >
        {isStarting ? "Starting..." : "Start Session"}
      </button>
    </div>
  );
}

export default HomePage;
