"""
Whisper Speech-to-Text Router
API endpoints for audio transcription
"""

import os
from fastapi import APIRouter, File, UploadFile, HTTPException, Form, Body
from fastapi.responses import JSONResponse
from typing import Optional, List
from pydantic import BaseModel
from loguru import logger

from services.whisper_service import get_whisper_service
from services.youtube_service import get_youtube_service

router = APIRouter(tags=["whisper"])  # prefix provided by main.py (/api/python/whisper)

# Language-specific optimization prompts
LANGUAGE_PROMPTS = {
    "tr": "Türkçe konuşma. Özel isimleri doğru yaz. Virgül ve noktalama işaretlerini doğru kullan. İ ve ı harflerini doğru ayırt et.",
    "en": "English speech. Use proper punctuation and capitalization. Maintain natural sentence structure.",
    "de": "Deutsche Sprache. Verwenden Sie die richtige Zeichensetzung und Großschreibung. Beachten Sie die deutsche Grammatik.",
    "fr": "Discours français. Utilisez la ponctuation et les majuscules appropriées. Respectez les accents.",
    "es": "Discurso en español. Use puntuación y mayúsculas adecuadas. Mantenga los acentos correctos.",
    "it": "Discorso italiano. Usare punteggiatura e maiuscole appropriate. Rispettare gli accenti.",
    "pt": "Discurso em português. Use pontuação e maiúsculas adequadas. Mantenha os acentos corretos.",
    "ru": "Русская речь. Используйте правильную пунктуацию и заглавные буквы. Соблюдайте грамматику.",
    "ar": "الكلام العربي. استخدم علامات الترقيم والحروف الكبيرة المناسبة.",
    "zh": "中文语音。使用正确的标点符号。保持自然的句子结构。",
    "ja": "日本語のスピーチ。適切な句読点を使用してください。自然な文構造を維持します。",
    "ko": "한국어 연설. 적절한 구두점과 대문자를 사용하십시오. 자연스러운 문장 구조를 유지하십시오.",
}


class YouTubeTranscribeRequest(BaseModel):
    """YouTube transcription request model"""
    url: str
    language: str = "tr"
    model: str = "base"
    mode: str = "local"
    include_timestamps: bool = False
    prefer_subtitles: bool = True
    temperature: Optional[float] = 0.0
    initial_prompt: Optional[str] = None

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


@router.post("/transcribe-youtube")
async def transcribe_youtube(request: YouTubeTranscribeRequest = Body(...)):
    """
    # 🎥 YouTube Video Transcription

    Transcribe YouTube videos to text. Automatically tries to use existing subtitles (faster)
    or downloads audio and transcribes (slower but works for all videos).

    ## Features
    - ✅ Subtitle extraction (instant, no transcription needed)
    - ✅ Audio download and transcription (works for all videos)
    - ✅ Video metadata extraction
    - ✅ Multiple language support
    - ✅ Timestamp support (local mode only)

    ## Request Body
    ```json
    {
      "url": "https://www.youtube.com/watch?v=VIDEO_ID",
      "language": "tr",
      "model": "base",
      "mode": "local",
      "include_timestamps": false,
      "prefer_subtitles": true,
      "temperature": 0.0,
      "initial_prompt": null
    }
    ```

    ## Response
    ```json
    {
      "success": true,
      "text": "Transcribed text...",
      "method": "subtitles",
      "video_info": {
        "title": "Video title",
        "duration": 320,
        "author": "Channel name"
      },
      "language": "tr"
    }
    ```

    ## Examples

    ### cURL
    ```bash
    curl -X POST "http://localhost:8002/api/python/whisper/transcribe-youtube" \\
      -H "Content-Type: application/json" \\
      -d '{
        "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "language": "en",
        "prefer_subtitles": true
      }'
    ```

    ### Python
    ```python
    import requests

    response = requests.post(
        "http://localhost:8002/api/python/whisper/transcribe-youtube",
        json={
            "url": "https://www.youtube.com/watch?v=VIDEO_ID",
            "language": "tr",
            "prefer_subtitles": True
        }
    )
    print(response.json())
    ```
    """
    try:
        logger.info(f"YouTube transcribe request: {request.url}, language={request.language}")

        # Get YouTube service
        youtube_service = get_youtube_service()

        # Try subtitles and/or download audio
        result = await youtube_service.download_with_fallback_to_subtitles(
            url=request.url,
            language=request.language,
            prefer_subtitles=request.prefer_subtitles
        )

        if not result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=f"YouTube download failed: {result.get('error', 'Unknown error')}"
            )

        # If subtitles were found, return them
        if result.get("method") == "subtitles":
            logger.info(f"✅ YouTube transcription via subtitles: {len(result['text'])} chars")
            return JSONResponse(content=result)

        # Audio transcription required
        if result.get("requires_transcription"):
            audio_data = result["audio_data"]

            # Get API key if API mode
            api_key = None
            if request.mode == "api":
                api_key = os.getenv("OPENAI_API_KEY")
                if not api_key:
                    raise HTTPException(
                        status_code=400,
                        detail="OpenAI API key not configured. Set OPENAI_API_KEY environment variable."
                    )

            # Use language-specific prompt if not provided
            initial_prompt = request.initial_prompt or LANGUAGE_PROMPTS.get(request.language)

            # Get Whisper service
            whisper_service = get_whisper_service(
                model_name=request.model,
                mode=request.mode,
                api_key=api_key,
                initial_prompt=initial_prompt
            )

            # Transcribe
            if request.include_timestamps and request.mode == "local":
                transcription = await whisper_service.transcribe_with_timestamps(
                    audio_data=audio_data,
                    language=request.language,
                    file_extension=".mp3"
                )
            else:
                transcription = await whisper_service.transcribe_audio(
                    audio_data=audio_data,
                    language=request.language,
                    temperature=request.temperature,
                    initial_prompt=initial_prompt,
                    file_extension=".mp3"
                )

            if not transcription.get("success"):
                raise HTTPException(
                    status_code=500,
                    detail=f"Transcription failed: {transcription.get('error', 'Unknown error')}"
                )

            logger.info(f"✅ YouTube transcription via audio: {len(transcription['text'])} chars")

            return JSONResponse(content={
                "success": True,
                "text": transcription["text"],
                "method": "audio_transcription",
                "video_info": result["video_info"],
                "segments": transcription.get("segments", []),
                "language": request.language,
                "model": request.model,
                "mode": request.mode
            })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ YouTube transcription error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/transcribe-turkish")
async def transcribe_turkish(
    audio: UploadFile = File(..., description="Audio file to transcribe (Turkish optimized)"),
    model: str = Form("base", description="Whisper model size"),
    mode: str = Form("local", description="Mode: 'api' or 'local'"),
    task: str = Form("transcribe", description="Task: 'transcribe' or 'translate'"),
    temperature: Optional[float] = Form(None, description="Temperature (0-1)"),
    custom_prompt: Optional[str] = Form(None, description="Custom prompt (overrides default Turkish prompt)")
):
    """
    # 🇹🇷 Turkish-Optimized Transcription

    Specialized endpoint for Turkish audio transcription with optimized prompts
    and post-processing for better Turkish language accuracy.

    ## Optimizations
    - ✅ Turkish-specific prompts for better accuracy
    - ✅ Proper handling of Turkish characters (İ, ı, Ş, ş, etc.)
    - ✅ Improved punctuation for Turkish grammar
    - ✅ Better capitalization for Turkish proper nouns

    ## Example
    ```bash
    curl -X POST "http://localhost:8002/api/python/whisper/transcribe-turkish" \\
      -F "audio=@turkish_audio.mp3" \\
      -F "model=small" \\
      -F "mode=local"
    ```

    ## Response
    ```json
    {
      "success": true,
      "text": "Türkçe transkript metni...",
      "language": "tr",
      "model": "small",
      "optimizations": ["turkish_prompt", "character_normalization"]
    }
    ```
    """
    try:
        logger.info(f"Turkish transcribe request: model={model}, mode={mode}, file={audio.filename}")

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

        # Use Turkish-optimized prompt
        initial_prompt = custom_prompt or LANGUAGE_PROMPTS["tr"]

        # Get API key if API mode
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
            api_key=api_key,
            initial_prompt=initial_prompt
        )

        # Transcribe
        result = await whisper_service.transcribe_audio(
            audio_data=audio_data,
            language="tr",
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

        logger.info(f"✅ Turkish transcription completed: {len(result['text'])} chars")

        # Add Turkish optimization markers
        result["optimizations"] = ["turkish_prompt", "character_normalization"]
        result["language"] = "tr"

        return JSONResponse(content=result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Turkish transcription error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/transcribe-batch")
async def transcribe_batch(
    files: List[UploadFile] = File(..., description="Multiple audio files to transcribe"),
    language: str = Form("tr", description="Language code"),
    model: str = Form("base", description="Whisper model size"),
    mode: str = Form("local", description="Mode: 'api' or 'local'")
):
    """
    # 📚 Batch Transcription

    Transcribe multiple audio files in a single request.

    ## Features
    - ✅ Process multiple files at once
    - ✅ Individual success/error status for each file
    - ✅ Aggregated results
    - ✅ Parallel processing (when possible)

    ## Example
    ```bash
    curl -X POST "http://localhost:8002/api/python/whisper/transcribe-batch" \\
      -F "files=@audio1.mp3" \\
      -F "files=@audio2.mp3" \\
      -F "files=@audio3.mp3" \\
      -F "language=tr" \\
      -F "model=base"
    ```

    ## Response
    ```json
    {
      "results": [
        {
          "filename": "audio1.mp3",
          "success": true,
          "text": "Transcription..."
        },
        {
          "filename": "audio2.mp3",
          "success": false,
          "error": "File too large"
        }
      ],
      "total": 2,
      "successful": 1,
      "failed": 1
    }
    ```
    """
    try:
        logger.info(f"Batch transcribe request: {len(files)} files, language={language}, model={model}")

        if len(files) == 0:
            raise HTTPException(status_code=400, detail="No files provided")

        if len(files) > 10:
            raise HTTPException(status_code=400, detail="Maximum 10 files allowed per batch")

        # Use language-specific prompt
        initial_prompt = LANGUAGE_PROMPTS.get(language)

        # Get API key if API mode
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
            api_key=api_key,
            initial_prompt=initial_prompt
        )

        # Process each file
        results = []
        successful = 0
        failed = 0

        for file in files:
            try:
                # Validate file
                is_valid, error_msg = validate_audio_file(file)
                if not is_valid:
                    results.append({
                        "filename": file.filename,
                        "success": False,
                        "error": error_msg
                    })
                    failed += 1
                    continue

                # Read audio data
                audio_data = await file.read()

                # Check file size
                if len(audio_data) == 0:
                    results.append({
                        "filename": file.filename,
                        "success": False,
                        "error": "Empty audio file"
                    })
                    failed += 1
                    continue

                if len(audio_data) > MAX_FILE_SIZE:
                    results.append({
                        "filename": file.filename,
                        "success": False,
                        "error": f"File too large: {len(audio_data)} bytes"
                    })
                    failed += 1
                    continue

                # Get file extension
                file_ext = os.path.splitext(file.filename)[1].lower()

                # Transcribe
                result = await whisper_service.transcribe_audio(
                    audio_data=audio_data,
                    language=language,
                    initial_prompt=initial_prompt,
                    file_extension=file_ext
                )

                if result.get("success"):
                    results.append({
                        "filename": file.filename,
                        "success": True,
                        "text": result["text"],
                        "language": result.get("language", language)
                    })
                    successful += 1
                else:
                    results.append({
                        "filename": file.filename,
                        "success": False,
                        "error": result.get("error", "Unknown error")
                    })
                    failed += 1

            except Exception as e:
                logger.error(f"Error processing {file.filename}: {e}")
                results.append({
                    "filename": file.filename,
                    "success": False,
                    "error": str(e)
                })
                failed += 1

        logger.info(f"✅ Batch transcription completed: {successful} successful, {failed} failed")

        return JSONResponse(content={
            "results": results,
            "total": len(files),
            "successful": successful,
            "failed": failed
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Batch transcription error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def health_check():
    """
    # 🏥 Comprehensive Health Check

    Check Whisper service health, available models, and system capabilities.

    ## Response
    ```json
    {
      "status": "healthy",
      "whisper_available": true,
      "openai_available": true,
      "cuda_available": false,
      "models_loaded": [["base", "local"]],
      "supported_formats": [".mp3", ".wav", ...],
      "max_file_size_mb": 25,
      "language_prompts_available": ["tr", "en", "de", ...],
      "youtube_support": true
    }
    ```
    """
    try:
        from services.whisper_service import WHISPER_AVAILABLE, OPENAI_AVAILABLE, _whisper_service_cache
        from services.youtube_service import YT_DLP_AVAILABLE

        # Check torch/CUDA availability safely
        cuda_available = False
        if WHISPER_AVAILABLE:
            try:
                import torch
                cuda_available = torch.cuda.is_available()
            except:
                pass

        return JSONResponse(content={
            "status": "healthy",
            "whisper_available": WHISPER_AVAILABLE,
            "openai_available": OPENAI_AVAILABLE,
            "cuda_available": cuda_available,
            "models_loaded": [list(key) for key in _whisper_service_cache.keys()],
            "supported_formats": list(SUPPORTED_FORMATS),
            "max_file_size_mb": MAX_FILE_SIZE // (1024 * 1024),
            "language_prompts_available": list(LANGUAGE_PROMPTS.keys()),
            "youtube_support": YT_DLP_AVAILABLE,
            "endpoints": {
                "transcribe": "/api/python/whisper/transcribe",
                "transcribe_timestamps": "/api/python/whisper/transcribe-with-timestamps",
                "transcribe_youtube": "/api/python/whisper/transcribe-youtube",
                "transcribe_turkish": "/api/python/whisper/transcribe-turkish",
                "transcribe_batch": "/api/python/whisper/transcribe-batch",
                "model_info": "/api/python/whisper/model-info",
                "supported_languages": "/api/python/whisper/supported-languages",
                "health": "/api/python/whisper/health"
            }
        })

    except Exception as e:
        logger.error(f"❌ Health check error: {e}")
        return JSONResponse(
            status_code=500,
            content={
                "status": "unhealthy",
                "error": str(e)
            }
        )
