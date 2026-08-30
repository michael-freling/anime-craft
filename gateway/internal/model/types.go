package model

import "time"

type ReferenceImage struct {
	ID           string    `json:"id"`
	Title        string    `json:"title"`
	FilePath     string    `json:"filePath"`
	ExerciseMode string    `json:"exerciseMode"`
	Difficulty   string    `json:"difficulty"`
	Tags         string    `json:"tags"`
	CreatedAt    time.Time `json:"createdAt"`
}

type Session struct {
	ID               string     `json:"id"`
	ReferenceImageID string     `json:"referenceImageId"`
	ExerciseMode     string     `json:"exerciseMode"`
	Status           string     `json:"status"`
	StartedAt        time.Time  `json:"startedAt"`
	EndedAt          *time.Time `json:"endedAt"`
	DurationSeconds  *int       `json:"durationSeconds"`
}

type Drawing struct {
	ID        string    `json:"id"`
	SessionID string    `json:"sessionId"`
	FilePath  string    `json:"filePath"`
	CreatedAt time.Time `json:"createdAt"`
}

// DrawingDocument is the index entry for a session's autosaved, resumable
// drawing. The drawing data itself lives in FilePath.
type DrawingDocument struct {
	SessionID      string    `json:"sessionId"`
	FilePath       string    `json:"filePath"`
	Revision       int       `json:"revision"`
	OperationCount int       `json:"operationCount"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

// DrawingSaveResult is what an autosave reports back so the editor can show
// what has been persisted and track what it still owes the disk.
type DrawingSaveResult struct {
	Revision       int       `json:"revision"`
	OperationCount int       `json:"operationCount"`
	Cursor         int       `json:"cursor"`
	SavedAt        time.Time `json:"savedAt"`
	// Checkpointed is true when this save also rewrote the OpenRaster file.
	Checkpointed bool `json:"checkpointed"`
}

// ResumableSession is a saved drawing as the home screen lists it: enough to
// recognise it and pick it back up. Finished sessions are listed too — a
// submitted drawing is still a drawing the artist may want to carry on with.
type ResumableSession struct {
	ID               string `json:"id"`
	ReferenceImageID string `json:"referenceImageId"`
	ReferenceTitle   string `json:"referenceTitle"`
	ExerciseMode     string `json:"exerciseMode"`
	Status           string `json:"status"`
	// DrawingStartedAt is when the drawing was first started, which is the
	// first attempt in its chain rather than the session being listed —
	// carrying a drawing on must not make it look newly begun.
	DrawingStartedAt time.Time `json:"drawingStartedAt"`
	// LastSavedAt is when autosave last wrote to it.
	LastSavedAt    time.Time `json:"lastSavedAt"`
	OperationCount int       `json:"operationCount"`
	// The last graded attempt on this drawing, which may be an earlier
	// session that handed the drawing on. Empty when nothing has been
	// submitted yet.
	LastResultSessionID string `json:"lastResultSessionId"`
	LastScore           int    `json:"lastScore"`
	// How many attempts on this drawing have been graded.
	ResultCount int `json:"resultCount"`
}

type Feedback struct {
	ID                 string    `json:"id"`
	SessionID          string    `json:"sessionId"`
	OverallScore       int       `json:"overallScore"`
	ProportionsScore   *int      `json:"proportionsScore"`
	LineQualityScore   *int      `json:"lineQualityScore"`
	ColorAccuracyScore *int      `json:"colorAccuracyScore"`
	AccuracyScore      *int      `json:"accuracyScore"`
	Summary            string    `json:"summary"`
	Details            string    `json:"details"`
	Strengths          []string  `json:"strengths"`
	Improvements       []string  `json:"improvements"`
	ReferenceLineArt   string    `json:"referenceLineArt"`  // base64 data URI, not stored in DB
	ComparisonHeatmap  string    `json:"comparisonHeatmap"` // base64 data URI, not stored in DB
	CreatedAt          time.Time `json:"createdAt"`
}

type Achievement struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Title         string `json:"title"`
	Description   string `json:"description"`
	Icon          string `json:"icon"`
	CriteriaType  string `json:"criteriaType"`
	CriteriaValue int    `json:"criteriaValue"`
}

type AchievementStatus struct {
	Achievement
	Earned   bool       `json:"earned"`
	EarnedAt *time.Time `json:"earnedAt"`
}

type ProgressSummary struct {
	TotalSessions     int              `json:"totalSessions"`
	CompletedSessions int              `json:"completedSessions"`
	AverageScore      float64          `json:"averageScore"`
	BestScore         int              `json:"bestScore"`
	CurrentStreak     int              `json:"currentStreak"`
	RecentScores      []ScoreDataPoint `json:"recentScores"`
}

type ScoreDataPoint struct {
	SessionID string    `json:"sessionId"`
	Score     int       `json:"score"`
	Date      time.Time `json:"date"`
}

type Settings struct {
	AIAPIKey         string `json:"aiApiKey"`
	AIProvider       string `json:"aiProvider"`
	BrushDefaultSize int    `json:"brushDefaultSize"`
	Theme            string `json:"theme"`
}
