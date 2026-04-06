"""Tests for the feedback generation module."""

import json

import pytest

from animecraft_inference.config import Config
from animecraft_inference.feedback.generator import (
    FeedbackGenerator,
    FeedbackResult,
    parse_feedback_json,
)
from animecraft_inference.feedback.prompt import (
    EXERCISE_MODE_CONTEXT,
    SYSTEM_PROMPT,
    build_feedback_prompt,
    build_user_message,
)


class TestBuildFeedbackPrompt:
    """Tests for system prompt construction."""

    def test_contains_json_format_instructions(self):
        prompt = build_feedback_prompt("quick_sketch")
        assert "overall_score" in prompt
        assert "proportions_score" in prompt
        assert "line_quality_score" in prompt
        assert "accuracy_score" in prompt
        assert "summary" in prompt
        assert "strengths" in prompt
        assert "improvements" in prompt

    def test_quick_sketch_mode(self):
        prompt = build_feedback_prompt("quick_sketch")
        assert "quick sketch" in prompt.lower()
        assert "gesture" in prompt.lower()

    def test_detailed_study_mode(self):
        prompt = build_feedback_prompt("detailed_study")
        assert "detailed study" in prompt.lower()

    def test_line_tracing_mode(self):
        prompt = build_feedback_prompt("line_tracing")
        assert "tracing" in prompt.lower()

    def test_free_draw_mode(self):
        prompt = build_feedback_prompt("free_draw")
        assert "free drawing" in prompt.lower()

    def test_unknown_mode_returns_base_prompt(self):
        prompt = build_feedback_prompt("unknown_mode")
        assert prompt == SYSTEM_PROMPT

    def test_empty_mode_returns_base_prompt(self):
        prompt = build_feedback_prompt("")
        assert prompt == SYSTEM_PROMPT

    def test_all_known_modes_have_context(self):
        for mode in EXERCISE_MODE_CONTEXT:
            prompt = build_feedback_prompt(mode)
            assert len(prompt) > len(SYSTEM_PROMPT)


class TestBuildUserMessage:
    """Tests for user message construction."""

    def test_mentions_reference_and_drawing(self):
        msg = build_user_message("quick_sketch")
        assert "reference" in msg.lower()
        assert "drawing" in msg.lower()

    def test_includes_exercise_mode(self):
        msg = build_user_message("detailed_study")
        assert "detailed study" in msg

    def test_empty_mode(self):
        msg = build_user_message("")
        assert "general" in msg


class TestParseFeedbackJson:
    """Tests for JSON parsing of VLM output."""

    def test_parse_valid_json(self):
        data = {
            "overall_score": 75,
            "proportions_score": 80,
            "line_quality_score": 70,
            "accuracy_score": 65,
            "summary": "Good attempt with solid proportions.",
            "details": "The head shape is well captured. Lines could be smoother.",
            "strengths": ["Good proportions", "Clean contour"],
            "improvements": ["Smoother lines", "More detail in hair"],
        }
        result = parse_feedback_json(json.dumps(data))
        assert result.overall_score == 75
        assert result.proportions_score == 80
        assert result.line_quality_score == 70
        assert result.accuracy_score == 65
        assert result.summary == "Good attempt with solid proportions."
        assert result.strengths == ["Good proportions", "Clean contour"]
        assert result.improvements == ["Smoother lines", "More detail in hair"]

    def test_parse_json_with_markdown_fences(self):
        json_str = '```json\n{"overall_score": 50, "proportions_score": 60, "line_quality_score": 40, "accuracy_score": 55, "summary": "test", "details": "details", "strengths": [], "improvements": []}\n```'
        result = parse_feedback_json(json_str)
        assert result.overall_score == 50
        assert result.proportions_score == 60

    def test_parse_json_with_surrounding_text(self):
        text = 'Here is my feedback:\n{"overall_score": 88, "proportions_score": 90, "line_quality_score": 85, "accuracy_score": 80, "summary": "Great work!", "details": "Very nice.", "strengths": ["Excellent proportions"], "improvements": ["Minor cleanup"]}\nHope this helps!'
        result = parse_feedback_json(text)
        assert result.overall_score == 88
        assert result.strengths == ["Excellent proportions"]

    def test_parse_scores_clamped_to_range(self):
        data = {
            "overall_score": 150,
            "proportions_score": -10,
            "line_quality_score": 50,
            "accuracy_score": 200,
            "summary": "test",
            "details": "",
            "strengths": [],
            "improvements": [],
        }
        result = parse_feedback_json(json.dumps(data))
        assert result.overall_score == 100  # clamped to max
        assert result.proportions_score == 0  # clamped to min
        assert result.accuracy_score == 100  # clamped to max

    def test_parse_missing_fields_use_defaults(self):
        result = parse_feedback_json('{"overall_score": 42}')
        assert result.overall_score == 42
        assert result.proportions_score == 0
        assert result.summary == ""
        assert result.strengths == []

    def test_parse_invalid_json_returns_default(self):
        result = parse_feedback_json("this is not json at all")
        assert result.overall_score == 0
        assert "Failed to parse" in result.summary

    def test_parse_empty_string(self):
        result = parse_feedback_json("")
        assert result.overall_score == 0
        assert "Failed to parse" in result.summary

    def test_parse_non_int_scores_converted(self):
        data = {
            "overall_score": "75",
            "proportions_score": 80.5,
            "line_quality_score": "invalid",
            "accuracy_score": None,
            "summary": "test",
            "details": "",
            "strengths": [],
            "improvements": [],
        }
        result = parse_feedback_json(json.dumps(data))
        assert result.overall_score == 75
        assert result.proportions_score == 80
        assert result.line_quality_score == 0  # invalid -> default
        assert result.accuracy_score == 0  # None -> default

    def test_parse_strengths_non_list_ignored(self):
        data = {
            "overall_score": 50,
            "strengths": "not a list",
            "improvements": 42,
        }
        result = parse_feedback_json(json.dumps(data))
        assert result.strengths == []
        assert result.improvements == []


class TestFeedbackGeneratorNotLoaded:
    """Tests for the generator before the model is loaded."""

    def test_is_loaded_false_initially(self):
        config = Config()
        gen = FeedbackGenerator(config)
        assert not gen.is_loaded

    def test_generate_raises_without_load(self):
        config = Config()
        gen = FeedbackGenerator(config)
        with pytest.raises(RuntimeError, match="Model not loaded"):
            # Must consume the generator to trigger the error
            list(gen.generate(b"ref", b"drawing", "quick_sketch"))
