"""
Whisper Speech-to-Text Router
API endpoints for audio transcription
"""

from fastapi import APIRouter, File, UploadFile, HTTPException, Form
from fastapi.responses import JSONResponse
from typing import Optional
from loguru import logger

from services.whisper_service import get_whisper_service

router = APIRouter(prefix="/whisper", tags=["whisper"])


@router.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    language: str = Form("tr"),
    model: str = Form("base"),
    task: str = Form("transcribe"),
    temperature: float = Form(0.0),
    initial_prompt: Optional[str] = Form(None)
):
    """
    Transcribe audio file to text

    Args:
        audio: Audio file (webm, mp3, wav, etc.)
        language: Language code (tr, en, de, etc.)
        model: Whisper model size (tiny, base, small, medium, large)
        task: "transcribe" or "translate" (to English)
        temperature: Sampling temperature (0-1)
        initial_prompt: Optional prompt to guide transcription

    Returns:
        JSON with transcription result
    """
    try:
        logger.info(f"Transcribe request: language={language}, model={model}, file={audio.filename}")

        # Read audio data
        audio_data = await audio.read()

        if len(audio_data) == 0:
            raise HTTPException(status_code=400, detail="Empty audio file")

        # Get Whisper service
        whisper_service = get_whisper_service(model_name=model)

        # Transcribe
        result = await whisper_service.transcribe_audio(
            audio_data=audio_data,
            language=language,
            task=task,
            temperature=temperature,
            initial_prompt=initial_prompt
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
    model: str = Form("base")
):
    """
    Transcribe audio with word-level timestamps

    Args:
        audio: Audio file
        language: Language code
        model: Whisper model size

    Returns:
        JSON with transcription and timestamps
    """
    try:
        logger.info(f"Timestamp transcribe: language={language}, model={model}")

        audio_data = await audio.read()

        if len(audio_data) == 0:
            raise HTTPException(status_code=400, detail="Empty audio file")

        whisper_service = get_whisper_service(model_name=model)

        result = await whisper_service.transcribe_with_timestamps(
            audio_data=audio_data,
            language=language
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
