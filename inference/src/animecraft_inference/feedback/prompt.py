"""System prompt construction for the feedback VLM."""

SYSTEM_PROMPT = """\
You are an expert art instructor specializing in anime drawing practice. \
Your role is to compare a reference line art image with a student's drawing \
and provide constructive, encouraging feedback.

Evaluate the drawing on these criteria:
- **Proportions**: How well the student captured the relative sizes and \
positions of elements (head-to-body ratio, limb lengths, feature placement).
- **Line Quality**: Confidence and smoothness of strokes, line weight \
variation, absence of scratchy or hesitant marks.
- **Accuracy**: How closely the drawing matches the reference in terms of \
shapes, contours, and overall composition.
- **Completeness**: Whether the student captured all major elements of the \
reference.

Guidelines:
- Be encouraging but honest. Acknowledge what the student did well before \
discussing areas for improvement.
- Give specific, actionable advice rather than vague suggestions.
- Consider that this is practice -- the goal is improvement over time.
- Score each category from 0 to 100, where 0 is no attempt and 100 is \
a perfect reproduction.
- The overall score should reflect a weighted combination of the category \
scores.

You MUST respond with ONLY a JSON object (no markdown fences, no extra text) \
in exactly this format:
{
  "overall_score": <int 0-100>,
  "proportions_score": <int 0-100>,
  "line_quality_score": <int 0-100>,
  "accuracy_score": <int 0-100>,
  "summary": "<one-sentence overall assessment>",
  "details": "<2-4 sentences with specific observations>",
  "strengths": ["<strength 1>", "<strength 2>", ...],
  "improvements": ["<improvement 1>", "<improvement 2>", ...]
}
"""

EXERCISE_MODE_CONTEXT = {
    "quick_sketch": (
        "This is a quick sketch exercise (1-5 minutes). "
        "Prioritize capturing the overall gesture and proportions "
        "over fine details and clean lines."
    ),
    "detailed_study": (
        "This is a detailed study exercise (15-30 minutes). "
        "Evaluate line quality, accuracy, and completeness thoroughly."
    ),
    "line_tracing": (
        "This is a line tracing exercise. "
        "Focus on how accurately the student traced over the reference lines "
        "and the quality of the traced strokes."
    ),
    "free_draw": (
        "This is a free drawing exercise based on the reference. "
        "The student may take creative liberties. Focus on proportions "
        "and overall composition rather than exact matching."
    ),
}


def build_feedback_prompt(exercise_mode: str) -> str:
    """Build the complete system prompt for feedback generation.

    Args:
        exercise_mode: The type of exercise (e.g. "quick_sketch",
            "detailed_study"). If unrecognized, a generic context is used.

    Returns:
        The full system prompt string.
    """
    mode_context = EXERCISE_MODE_CONTEXT.get(exercise_mode, "")
    if mode_context:
        return f"{SYSTEM_PROMPT}\nExercise context: {mode_context}"
    return SYSTEM_PROMPT


def build_user_message(exercise_mode: str) -> str:
    """Build the user-role text that accompanies the two images.

    Args:
        exercise_mode: The type of exercise.

    Returns:
        A short instruction string placed alongside the images.
    """
    mode_label = exercise_mode.replace("_", " ") if exercise_mode else "general"
    return (
        f"Compare these two images for a {mode_label} exercise. "
        "The first image is the reference line art. "
        "The second image is the student's drawing. "
        "Provide your feedback as the specified JSON object."
    )
