"""
Whisper Speech-to-Text Service
Supports both OpenAI API and self-hosted local models
"""

import os
import tempfile
from pathlib import Path
from typing import Optional, Dict, Any
from loguru import logger
import whisper
import torch
try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    logger.warning("OpenAI package not available. API mode will not work.")

class WhisperService:
    """
    Service for audio transcription
    Supports:
    - API mode: OpenAI Whisper API (requires API key)
    - Local mode: Self-hosted Whisper (tiny, base, small, medium, large)
    """

    def __init__(
        self,
        model_name: str = "base",
        mode: str = "local",
        api_key: Optional[str] = None,
        initial_prompt: Optional[str] = None
    ):
        """
        Initialize Whisper service

        Args:
            model_name: Model name
                - API mode: "whisper-1" (OpenAI's model)
                - Local mode: "tiny", "base", "small", "medium", "large"
            mode: "api" for OpenAI API, "local" for self-hosted
            api_key: OpenAI API key (required for API mode)
            initial_prompt: Default prompt to guide transcription
        """
        self.model_name = model_name
        self.mode = mode
        self.api_key = api_key
        self.initial_prompt = initial_prompt
        self.model = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"

        if mode == "api":
            if not OPENAI_AVAILABLE:
                raise RuntimeError("OpenAI package not installed. Install with: pip install openai")
            if not api_key:
                raise ValueError("API key is required for API mode")
            self.client = OpenAI(api_key=api_key)
            logger.info(f"🎤 Whisper initialized in API mode (model: {model_name})")
        else:
            logger.info(f"🎤 Whisper initialized in LOCAL mode (model: {model_name}, device: {self.device})")

    def load_model(self):
        """Load Whisper model (lazy loading) - Only for local mode"""
        if self.mode == "api":
            return None  # API mode doesn't need model loading

        if self.model is None:
            try:
                logger.info(f"Loading Whisper model: {self.model_name}")
                self.model = whisper.load_model(self.model_name, device=self.device)
                logger.info(f"✅ Whisper model '{self.model_name}' loaded successfully")
            except Exception as e:
                logger.error(f"❌ Failed to load Whisper model: {e}")
                raise
        return self.model

    async def transcribe_audio(
        self,
        audio_data: bytes,
        language: str = "tr",
        task: str = "transcribe",
        temperature: float = 0.0,
        initial_prompt: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Transcribe audio to text (API or Local)

        Args:
            audio_data: Audio file bytes
            language: Language code (tr, en, etc.)
            task: "transcribe" or "translate" (to English)
            temperature: Sampling temperature (0-1)
            initial_prompt: Optional prompt to guide the transcription

        Returns:
            Dict with transcription results
        """
        try:
            # Use default prompt if not provided
            prompt = initial_prompt or self.initial_prompt

            # Save audio to temporary file
            with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_audio:
                temp_audio.write(audio_data)
                temp_audio_path = temp_audio.name

            try:
                logger.info(f"Transcribing audio ({self.mode} mode): {len(audio_data)} bytes, language={language}")

                if self.mode == "api":
                    # OpenAI API mode
                    with open(temp_audio_path, "rb") as audio_file:
                        response = self.client.audio.transcriptions.create(
                            model=self.model_name,
                            file=audio_file,
                            language=language,
                            prompt=prompt,
                            temperature=temperature
                        )

                    logger.info(f"✅ API Transcription completed: {len(response.text)} characters")

                    return {
                        "success": True,
                        "text": response.text,
                        "language": language,
                        "model": self.model_name,
                        "mode": "api"
                    }

                else:
                    # Local mode
                    model = self.load_model()

                    result = model.transcribe(
                        temp_audio_path,
                        language=language,
                        task=task,
                        temperature=temperature,
                        initial_prompt=prompt,
                        fp16=False  # Disable FP16 for CPU compatibility
                    )

                    logger.info(f"✅ Local Transcription completed: {len(result['text'])} characters")

                    return {
                        "success": True,
                        "text": result["text"],
                        "language": result.get("language", language),
                        "segments": result.get("segments", []),
                        "model": self.model_name,
                        "device": self.device,
                        "mode": "local"
                    }

            finally:
                # Clean up temp file
                if os.path.exists(temp_audio_path):
                    os.remove(temp_audio_path)

        except Exception as e:
            logger.error(f"❌ Transcription failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "text": "",
                "mode": self.mode
            }

    async def transcribe_with_timestamps(
        self,
        audio_data: bytes,
        language: str = "tr"
    ) -> Dict[str, Any]:
        """
        Transcribe audio with word-level timestamps

        Args:
            audio_data: Audio file bytes
            language: Language code

        Returns:
            Dict with transcription and timestamps
        """
        try:
            model = self.load_model()

            with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_audio:
                temp_audio.write(audio_data)
                temp_audio_path = temp_audio.name

            try:
                result = model.transcribe(
                    temp_audio_path,
                    language=language,
                    word_timestamps=True,
                    fp16=False
                )

                # Extract segments with timestamps
                segments = []
                for segment in result.get("segments", []):
                    segments.append({
                        "start": segment["start"],
                        "end": segment["end"],
                        "text": segment["text"],
                        "words": segment.get("words", [])
                    })

                return {
                    "success": True,
                    "text": result["text"],
                    "language": result.get("language", language),
                    "segments": segments,
                    "model": self.model_name
                }

            finally:
                if os.path.exists(temp_audio_path):
                    os.remove(temp_audio_path)

        except Exception as e:
            logger.error(f"❌ Timestamp transcription failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "text": "",
                "segments": []
            }

    def get_model_info(self) -> Dict[str, Any]:
        """Get information about current model"""
        return {
            "model_name": self.model_name,
            "device": self.device,
            "loaded": self.model is not None,
            "cuda_available": torch.cuda.is_available()
        }


# Global instance (lazy loaded)
_whisper_service: Optional[WhisperService] = None

def get_whisper_service(
    model_name: str = "base",
    mode: str = "local",
    api_key: Optional[str] = None,
    initial_prompt: Optional[str] = None
) -> WhisperService:
    """
    Get or create Whisper service instance

    Args:
        model_name: Model name (whisper-1 for API, tiny/base/small/medium/large for local)
        mode: "api" or "local"
        api_key: OpenAI API key (for API mode)
        initial_prompt: Default prompt for transcriptions

    Returns:
        WhisperService instance
    """
    global _whisper_service
    if _whisper_service is None:
        _whisper_service = WhisperService(
            model_name=model_name,
            mode=mode,
            api_key=api_key,
            initial_prompt=initial_prompt
        )
    return _whisper_service
