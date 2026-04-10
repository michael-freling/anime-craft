"""Feedback generation using Qwen2.5-VL-3B-Instruct.

Loads the vision-language model and generates structured feedback
by comparing a reference line art image with the student's drawing.
"""

import base64
import json
import logging
import re
from dataclasses import dataclass, field
from threading import Thread
from typing import Iterator, Optional

import torch
from PIL import Image
from transformers import (
    AutoModelForImageTextToText,
    AutoProcessor,
    TextIteratorStreamer,
)

from animecraft_inference.config import Config
from animecraft_inference.feedback.prompt import build_feedback_prompt, build_user_message

logger = logging.getLogger(__name__)


@dataclass
class FeedbackResult:
    """Parsed feedback from the VLM."""

    overall_score: int = 0
    proportions_score: int = 0
    line_quality_score: int = 0
    accuracy_score: int = 0
    summary: str = ""
    details: str = ""
    strengths: list[str] = field(default_factory=list)
    improvements: list[str] = field(default_factory=list)


def parse_feedback_json(text: str) -> FeedbackResult:
    """Parse the VLM's JSON output into a FeedbackResult.

    Handles cases where the model wraps the JSON in markdown code fences
    or includes extra text before/after the JSON object.

    Args:
        text: Raw text output from the VLM.

    Returns:
        A FeedbackResult with parsed values, or a default result if
        parsing fails.
    """
    # Strip markdown code fences if present
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    cleaned = cleaned.strip()

    # Try to extract a JSON object from the text
    # Find the first { and the last }
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        logger.warning("No JSON object found in VLM output: %s", text[:200])
        return FeedbackResult(summary="Failed to parse feedback from model output.")

    json_str = cleaned[start : end + 1]

    try:
        data = json.loads(json_str)
    except json.JSONDecodeError as exc:
        logger.warning("Failed to parse JSON from VLM output: %s", exc)
        return FeedbackResult(summary="Failed to parse feedback from model output.")

    def _int(key: str, default: int = 0) -> int:
        val = data.get(key, default)
        try:
            return max(0, min(100, int(val)))
        except (TypeError, ValueError):
            return default

    def _str(key: str, default: str = "") -> str:
        val = data.get(key, default)
        return str(val) if val is not None else default

    def _str_list(key: str) -> list[str]:
        val = data.get(key, [])
        if isinstance(val, list):
            return [str(item) for item in val]
        return []

    return FeedbackResult(
        overall_score=_int("overall_score"),
        proportions_score=_int("proportions_score"),
        line_quality_score=_int("line_quality_score"),
        accuracy_score=_int("accuracy_score"),
        summary=_str("summary"),
        details=_str("details"),
        strengths=_str_list("strengths"),
        improvements=_str_list("improvements"),
    )


def _image_bytes_to_data_uri(image_bytes: bytes, media_type: str = "image/png") -> str:
    """Encode image bytes as a base64 data URI."""
    b64 = base64.b64encode(image_bytes).decode("ascii")
    return f"data:{media_type};base64,{b64}"


class FeedbackGenerator:
    """Generates structured feedback using the Qwen2.5-VL model.

    Usage::

        gen = FeedbackGenerator(config)
        gen.load()
        for chunk in gen.generate(ref_png, drawing_png, "quick_sketch"):
            print(chunk, end="")
    """

    def __init__(self, config: Config):
        self._config = config
        self._model: Optional[AutoModelForImageTextToText] = None
        self._processor: Optional[AutoProcessor] = None

    @property
    def is_loaded(self) -> bool:
        """Whether the model and processor have been loaded."""
        return self._model is not None and self._processor is not None

    def load(self) -> None:
        """Load the Qwen2.5-VL model and processor from HuggingFace."""
        model_id = self._config.feedback_model_id
        device = self._config.resolved_device
        cache_dir = self._config.feedback_model_cache_dir or None

        logger.info("Loading feedback model %s on device %s...", model_id, device)

        self._processor = AutoProcessor.from_pretrained(
            model_id,
            cache_dir=cache_dir,
        )

        dtype = torch.float16 if device == "cuda" else torch.float32
        self._model = AutoModelForImageTextToText.from_pretrained(
            model_id,
            dtype=dtype,
            device_map=device if device == "cuda" else None,
            cache_dir=cache_dir,
        )
        if device == "cpu":
            self._model = self._model.to(device)

        self._model.eval()
        logger.info("Feedback model loaded successfully.")

    def generate(
        self,
        reference_line_art_png: bytes,
        drawing_png: bytes,
        exercise_mode: str,
    ) -> Iterator[str]:
        """Generate feedback by comparing reference line art with a drawing.

        This is a streaming generator that yields text chunks as the model
        produces them. After generation completes, the caller can use
        ``parse_feedback_json()`` on the concatenated text to extract
        structured results.

        Args:
            reference_line_art_png: PNG bytes of the reference line art.
            drawing_png: PNG bytes of the student's drawing.
            exercise_mode: The exercise type (e.g. "quick_sketch").

        Yields:
            Text chunks as the model generates them.

        Raises:
            RuntimeError: If the model has not been loaded.
        """
        if self._model is None or self._processor is None:
            raise RuntimeError(
                "Model not loaded. Call load() before generate()."
            )

        system_prompt = build_feedback_prompt(exercise_mode)
        user_text = build_user_message(exercise_mode)
        ref_uri = _image_bytes_to_data_uri(reference_line_art_png)
        drawing_uri = _image_bytes_to_data_uri(drawing_png)

        # Build the chat messages in the format expected by the processor
        messages = [
            {
                "role": "system",
                "content": [{"type": "text", "text": system_prompt}],
            },
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": ref_uri},
                    {"type": "image", "image": drawing_uri},
                    {"type": "text", "text": user_text},
                ],
            },
        ]

        # Apply the chat template to get the formatted prompt
        text_prompt = self._processor.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )

        # Process inputs (handles both text and images)
        inputs = self._processor(
            text=[text_prompt],
            images=[
                Image.open(__import__("io").BytesIO(reference_line_art_png)).convert("RGB"),
                Image.open(__import__("io").BytesIO(drawing_png)).convert("RGB"),
            ],
            padding=True,
            return_tensors="pt",
        )
        inputs = inputs.to(self._model.device)

        # Set up streaming
        streamer = TextIteratorStreamer(
            self._processor.tokenizer,
            skip_prompt=True,
            skip_special_tokens=True,
        )

        generation_kwargs = {
            **inputs,
            "max_new_tokens": self._config.feedback_max_new_tokens,
            "temperature": self._config.feedback_temperature,
            "do_sample": self._config.feedback_temperature > 0,
            "streamer": streamer,
        }

        # Run generation in a background thread so we can iterate the streamer
        thread = Thread(target=self._model.generate, kwargs=generation_kwargs)
        thread.start()

        try:
            for chunk in streamer:
                yield chunk
        finally:
            thread.join()
