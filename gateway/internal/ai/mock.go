package ai

import "context"

type MockFeedbackClient struct{}

func NewMockFeedbackClient() *MockFeedbackClient {
	return &MockFeedbackClient{}
}

func (m *MockFeedbackClient) AnalyzeDrawing(ctx context.Context, req AnalysisRequest) (AnalysisResponse, error) {
	response := AnalysisResponse{
		OverallScore:       72,
		ProportionsScore:   75,
		LineQualityScore:   68,
		ColorAccuracyScore: 73,
		Summary:            "Good effort! Your proportions are solid, but the line work could be smoother. Keep practicing to build line confidence.",
		Details:            "Your drawing shows a good understanding of the overall shape and proportions of the reference. The main areas for improvement are in line quality — try drawing longer, more confident strokes instead of short, sketchy lines. Focus on varying line weight to add depth and dimension.",
		Strengths:          []string{"Good overall proportions", "Clean line intersections", "Accurate placement of features"},
		Improvements:       []string{"Work on line confidence — try drawing strokes in single motions", "Vary line weight to convey depth and form", "Practice consistent line weight throughout the drawing"},
	}

	switch req.ExerciseMode {
	case "line_work":
		response.ColorAccuracyScore = 0
	}

	return response, nil
}
