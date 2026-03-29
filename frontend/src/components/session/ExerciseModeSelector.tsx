interface ExerciseModeSelectorProps {
  selectedMode: string | null;
  onSelectMode: (mode: string) => void;
}

const modes = [
  { value: "line_work", label: "Line Work" },
  { value: "coloring", label: "Coloring" },
  { value: "full_drawing", label: "Full Drawing" },
];

function ExerciseModeSelector({
  selectedMode,
  onSelectMode,
}: ExerciseModeSelectorProps) {
  return (
    <div className="exercise-mode-selector" data-testid="exercise-mode-selector">
      <h3>Exercise Mode</h3>
      <div className="mode-buttons">
        {modes.map((mode) => (
          <button
            key={mode.value}
            className={`mode-btn ${selectedMode === mode.value ? "active" : ""}`}
            onClick={() => onSelectMode(mode.value)}
            data-testid={`mode-${mode.value}`}
          >
            {mode.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default ExerciseModeSelector;
