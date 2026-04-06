package ai

import "context"

type AnalysisRequest struct {
	ReferenceImage []byte
	UserDrawing    []byte
	ExerciseMode   string
}

type AnalysisResponse struct {
	OverallScore       int
	ProportionsScore   int
	LineQualityScore   int
	ColorAccuracyScore int
	Summary            string
	Details            string
	Strengths          []string
	Improvements       []string
	RawResponse        string
}

type FeedbackClient interface {
	AnalyzeDrawing(ctx context.Context, req AnalysisRequest) (AnalysisResponse, error)
}
