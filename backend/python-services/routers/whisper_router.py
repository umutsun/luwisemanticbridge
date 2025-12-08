"""
Whisper Speech-to-Text Router
API endpoints for audio transcription
"""

import os
from fastapi import APIRouter, File, UploadFile, HTTPException, Form
from fastapi.responses import JSONResponse
from typing import Optional
from loguru import logger

from services.whisper_service import get_whisper_service

router = APIRouter(prefix="/whisper", tags=["whisper"])

# Constants
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25MB limit (OpenAI API limit)
SUPPORTED_FORMATS = {
    ".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".wav", ".webm", ".ogg", ".flac"
}

def validate_audio_file(file: UploadFile) -> tuple[bool, str]:
    """
    Validate audio file format and size

    Returns:
        Tuple of (is_valid, error_message)
    """
    # Check if filename exists
    if not file.filename:
        return False, "Filename is required"

    # Check file extension
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in SUPPORTED_FORMATS:
        return False, f"Unsupported format: {file_ext}. Supported: {', '.join(SUPPORTED_FORMATS)}"

    return True, ""


@router.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    language: str = Form("tr"),
    model: str = Form("base"),
    mode: str = Form("local"),
    task: str = Form("transcribe"),
    temperature: Optional[float] = Form(None),
    initial_prompt: Optional[str] = Form(None)
):
    """
    Transcribe audio file to text

    Args:
        audio: Audio file (mp3, wav, m4a, webm, ogg, flac)
        language: Language code (tr, en, de, etc.)
        model: Whisper model size (tiny, base, small, medium, large for local; whisper-1 for API)
        mode: "local" for self-hosted, "api" for OpenAI API
        task: "transcribe" or "translate" (to English)
        temperature: Sampling temperature (0-1), defaults to 0.0
        initial_prompt: Optional prompt to guide transcription

    Returns:
        JSON with transcription result
    """
    try:
        logger.info(f"Transcribe request: language={language}, model={model}, mode={mode}, file={audio.filename}")

        # Validate audio file
        is_valid, error_msg = validate_audio_file(audio)
        if not is_valid:
            raise HTTPException(status_code=400, detail=error_msg)

        # Read audio data
        audio_data = await audio.read()

        # Check file size
        if len(audio_data) == 0:
            raise HTTPException(status_code=400, detail="Empty audio file")

        if len(audio_data) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File too large: {len(audio_data)} bytes. Max size: {MAX_FILE_SIZE} bytes ({MAX_FILE_SIZE // (1024*1024)}MB)"
            )

        # Get file extension
        file_ext = os.path.splitext(audio.filename)[1].lower()

        # Get API key from environment if API mode
        api_key = None
        if mode == "api":
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                raise HTTPException(
                    status_code=400,
                    detail="OpenAI API key not configured. Set OPENAI_API_KEY environment variable."
                )

        # Get Whisper service
        whisper_service = get_whisper_service(
            model_name=model,
            mode=mode,
            api_key=api_key
        )

        # Transcribe
        result = await whisper_service.transcribe_audio(
            audio_data=audio_data,
            language=language,
            task=task,
            temperature=temperature if temperature is not None else 0.0,
            initial_prompt=initial_prompt,
            file_extension=file_ext
        )

        if not result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=f"Transcription failed: {result.get('error', 'Unknown error')}"
            )

        logger.info(f"✅ Transcription completed: {len(result['text'])} chars")

        return JSONResponse(content=result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Transcription error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/transcribe-with-timestamps")
async def transcribe_with_timestamps(
    audio: UploadFile = File(...),
    language: str = Form("tr"),
    model: str = Form("base"),
    mode: str = Form("local")
):
    """
    Transcribe audio with word-level timestamps (Local mode only)

    Args:
        audio: Audio file (mp3, wav, m4a, webm, ogg, flac)
        language: Language code (tr, en, de, etc.)
        model: Whisper model size (tiny, base, small, medium, large)
        mode: Must be "local" (API mode doesn't support timestamps)

    Returns:
        JSON with transcription and timestamps
    """
    try:
        logger.info(f"Timestamp transcribe: language={language}, model={model}, mode={mode}, file={audio.filename}")

        # Check if mode is local
        if mode != "local":
            raise HTTPException(
                status_code=400,
                detail="Word-level timestamps are only supported in local mode. Use mode='local' with a local Whisper model."
            )

        # Validate audio file
        is_valid, error_msg = validate_audio_file(audio)
        if not is_valid:
            raise HTTPException(status_code=400, detail=error_msg)

        audio_data = await audio.read()

        # Check file size
        if len(audio_data) == 0:
            raise HTTPException(status_code=400, detail="Empty audio file")

        if len(audio_data) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File too large: {len(audio_data)} bytes. Max size: {MAX_FILE_SIZE} bytes ({MAX_FILE_SIZE // (1024*1024)}MB)"
            )

        # Get file extension
        file_ext = os.path.splitext(audio.filename)[1].lower()

        whisper_service = get_whisper_service(model_name=model, mode=mode)

        result = await whisper_service.transcribe_with_timestamps(
            audio_data=audio_data,
            language=language,
            file_extension=file_ext
        )

        if not result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=f"Transcription failed: {result.get('error', 'Unknown error')}"
            )

        return JSONResponse(content=result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Timestamp transcription error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/model-info")
async def get_model_info(model: str = "base"):
    """
    Get information about Whisper model

    Args:
        model: Model name

    Returns:
        Model information
    """
    try:
        whisper_service = get_whisper_service(model_name=model)
        info = whisper_service.get_model_info()

        return JSONResponse(content=info)

    except Exception as e:
        logger.error(f"❌ Model info error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/supported-languages")
async def get_supported_languages():
    """
    Get list of supported languages

    Returns:
        List of language codes and names
    """
    # Whisper supports 98 languages
    languages = {
        "tr": "Turkish",
        "en": "English",
        "de": "German",
        "fr": "French",
        "es": "Spanish",
        "it": "Italian",
        "pt": "Portuguese",
        "ru": "Russian",
        "ar": "Arabic",
        "zh": "Chinese",
        "ja": "Japanese",
        "ko": "Korean",
        # Add more as needed
    }

    return JSONResponse(content={"languages": languages})
