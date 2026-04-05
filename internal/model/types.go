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

type Feedback struct {
	ID               string    `json:"id"`
	SessionID        string    `json:"sessionId"`
	ReferenceLineArt string    `json:"referenceLineArt"` // base64 data URI, not stored in DB
	CreatedAt        time.Time `json:"createdAt"`
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
