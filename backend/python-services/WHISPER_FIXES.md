# Whisper Integration - Issues Fixed

## Summary
Fixed 10 critical issues in the Whisper audio transcription integration for LSEMB project.

## Issues Fixed

### ✅ 1. File Extension Hardcoding
**Problem**: Temporary files were always saved with `.webm` extension, causing issues with other audio formats.

**Fix**:
- Added `file_extension` parameter to `transcribe_audio()` and `transcribe_with_timestamps()`
- Router now extracts and passes the actual file extension from uploaded files
- Supports: `.mp3`, `.wav`, `.m4a`, `.webm`, `.ogg`, `.flac`, `.mp4`, `.mpeg`, `.mpga`

**Location**:
- `services/whisper_service.py:99, 191`
- `routers/whisper_router.py:88, 181`

---

### ✅ 2. Global Service Instance Recreation
**Problem**: Service was created once and never updated, making model switching impossible.

**Fix**:
- Changed from single global instance to cache dictionary
- Services cached per `(model_name, mode)` combination
- Added `force_recreate` parameter for manual cache invalidation

**Location**: `services/whisper_service.py:270-307`

**Example**:
```python
# Different models get different instances
service_base = get_whisper_service(model_name="base", mode="local")
service_small = get_whisper_service(model_name="small", mode="local")
# service_base != service_small ✅

# Same model returns cached instance
service_base2 = get_whisper_service(model_name="base", mode="local")
# service_base == service_base2 ✅
```

---

### ✅ 3. Device Check in API Mode
**Problem**: Code tried to access `torch.cuda` even in API mode, creating unnecessary dependency.

**Fix**:
- Device check now only runs when `mode == "local"`
- API mode sets `device = None`

**Location**: `services/whisper_service.py:61-65`

---

### ✅ 4. Audio Format Validation
**Problem**: No validation of uploaded audio formats, leading to unclear errors.

**Fix**:
- Added `validate_audio_file()` function
- Checks file extension against supported formats
- Returns clear error messages for unsupported formats

**Location**: `routers/whisper_router.py:22-38`

**Supported Formats**:
```python
SUPPORTED_FORMATS = {
    ".mp3", ".mp4", ".mpeg", ".mpga", ".m4a",
    ".wav", ".webm", ".ogg", ".flac"
}
```

---

### ✅ 5. Temperature Parameter Type
**Problem**: `temperature: float = Form(0.0)` might not work correctly in all FastAPI versions.

**Fix**:
- Changed to `temperature: Optional[float] = Form(None)`
- Defaults to 0.0 if not provided

**Location**: `routers/whisper_router.py:48`

---

### ✅ 6. Timestamp Feature API Mode Support
**Problem**: `transcribe_with_timestamps()` didn't check if API mode was being used, would fail silently.

**Fix**:
- Added mode check at the start of the function
- Returns clear error message for API mode
- Router endpoint validates mode before calling service

**Location**:
- `services/whisper_service.py:205-212`
- `routers/whisper_router.py:156-161`

---

### ✅ 7. File Size Limits
**Problem**: No maximum file size check, potential for memory issues or DoS.

**Fix**:
- Added `MAX_FILE_SIZE = 25MB` constant (OpenAI API limit)
- Validates file size before processing
- Returns clear error message with size limits

**Location**: `routers/whisper_router.py:17, 81-85, 174-178`

---

### ✅ 8. Mode Parameter in Router
**Problem**: Couldn't specify API vs Local mode per request.

**Fix**:
- Added `mode` parameter to both transcribe endpoints
- Defaults to `"local"`
- Auto-loads OpenAI API key from environment for API mode

**Location**: `routers/whisper_router.py:46, 90-98`

---

### ✅ 9. Frontend Missing Import
**Problem**: Frontend used `RefreshCw` and `Textarea` without importing them.

**Fix**:
- Added missing imports from `lucide-react`

**Location**: `frontend/src/app/dashboard/settings/services/page.tsx:16, 36`

---

### ✅ 10. Error Handling
**Problem**: Generic error messages didn't help with debugging.

**Fix**:
- Added specific validation error messages
- Clear errors for file size, format, and configuration issues
- Better logging throughout

**Location**: Multiple files

---

## API Changes

### POST `/api/python/whisper/transcribe`

**New Parameters**:
- `mode`: `"local"` or `"api"` (default: `"local"`)
- `temperature`: Now `Optional[float]` (default: `None` → 0.0)

**Example Request**:
```bash
curl -X POST "http://localhost:8002/api/python/whisper/transcribe" \
  -H "x-api-key: YOUR_API_KEY" \
  -F "audio=@audio.mp3" \
  -F "language=tr" \
  -F "model=base" \
  -F "mode=local" \
  -F "temperature=0.0"
```

**Example Response**:
```json
{
  "success": true,
  "text": "Transcribed text here...",
  "language": "tr",
  "model": "base",
  "mode": "local",
  "device": "cpu"
}
```

### POST `/api/python/whisper/transcribe-with-timestamps`

**New Parameters**:
- `mode`: Must be `"local"` (timestamps not supported in API mode)

**Validation**:
- Returns 400 error if `mode != "local"`

---

## Configuration

### Environment Variables

For API mode, set:
```bash
OPENAI_API_KEY=sk-...
```

For local mode:
- No additional configuration needed
- Whisper model downloads automatically on first use
- GPU automatically detected if available

---

## Testing

Run the test suite:
```bash
cd backend/python-services
python test_whisper.py
```

**Tests Include**:
1. Service instance caching
2. Device check (API vs Local)
3. File extension handling
4. Timestamp API mode rejection
5. Supported formats validation
6. File size limits
7. Model info retrieval

---

## Migration Guide

### For Existing Code

**Before**:
```python
whisper_service = get_whisper_service(model_name="base")
result = await whisper_service.transcribe_audio(
    audio_data=audio_data,
    language="tr"
)
```

**After**:
```python
whisper_service = get_whisper_service(
    model_name="base",
    mode="local"  # or "api"
)
result = await whisper_service.transcribe_audio(
    audio_data=audio_data,
    language="tr",
    file_extension=".mp3"  # Now required
)
```

### For API Requests

**Before**:
```bash
curl -F "audio=@audio.webm" -F "model=base" /whisper/transcribe
```

**After**:
```bash
curl -F "audio=@audio.mp3" -F "model=base" -F "mode=local" /whisper/transcribe
```

---

## Production Deployment

### For All Instances (emlakai, vergilex, bookie)

1. **Update Python services**:
```bash
ssh root@91.99.229.96

# Update emlakai
cd /var/www/emlakai/backend/python-services
git pull
pip3 install -r requirements.txt
pm2 restart emlakai-python

# Update vergilex
cd /var/www/vergilex/backend/python-services
git pull
pip3 install -r requirements.txt
pm2 restart vergilex-python

# Update bookie
cd /var/www/bookie/backend/python-services
git pull
pip3 install -r requirements.txt
pm2 restart bookie-python
```

2. **Update frontend** (if using Whisper UI):
```bash
# Update emlakai frontend
cd /var/www/emlakai/frontend
git pull
npm install
npm run build
pm2 restart emlakai-frontend

# Repeat for vergilex and bookie
```

3. **Set OpenAI API key** (if using API mode):
```bash
# In production .env file
echo "OPENAI_API_KEY=sk-..." >> /var/www/emlakai/backend/.env
```

---

## Performance Recommendations

### Local Mode
- **Tiny**: ~1GB RAM, fastest, good for quick transcriptions
- **Base**: ~1GB RAM, recommended for most use cases
- **Small**: ~2GB RAM, better accuracy
- **Medium**: ~5GB RAM, high accuracy
- **Large**: ~10GB RAM, best accuracy (GPU recommended)

### API Mode
- **whisper-1**: Always latest model, requires API key
- Cost: $0.006 per minute of audio
- No GPU required
- Faster for short audio
- Best for production with high accuracy needs

### Recommendations
- **Development**: Use local mode with `base` model
- **Production (low volume)**: Use API mode for reliability
- **Production (high volume)**: Use local mode with `small` or `medium` on GPU
- **Real-time**: Use API mode or local `tiny`/`base` models

---

## Troubleshooting

### Issue: "OpenAI package not installed"
**Solution**:
```bash
pip install openai
```

### Issue: "Whisper/torch packages not available"
**Solution**:
```bash
pip install openai-whisper torch
```

### Issue: "File too large"
**Solution**:
- Compress audio file
- Max size: 25MB
- Use lower bitrate or shorter clips

### Issue: "Unsupported format"
**Solution**:
- Convert to supported format: mp3, wav, m4a, webm, ogg, flac
- Use `ffmpeg` to convert:
```bash
ffmpeg -i input.aac -c:a libmp3lame output.mp3
```

### Issue: "Word-level timestamps not supported in API mode"
**Solution**:
- Use `mode=local` for timestamp feature
- API mode doesn't support word-level timestamps

---

## Multi-tenant Notes

All production instances (emlakai, vergilex, bookie) share the same codebase but:
- Each has its own OpenAI API key (if using API mode)
- Each can use different default models
- Whisper models are shared on disk (cached in `~/.cache/whisper`)
- Local mode benefits from shared GPU on server

---

## Next Steps

Future improvements:
- [ ] Add streaming/chunked transcription for long audio
- [ ] Add WebSocket support for real-time transcription
- [ ] Add language auto-detection
- [ ] Add speaker diarization
- [ ] Add background job queue for long transcriptions
- [ ] Add transcription history/caching
- [ ] Add batch transcription endpoint
- [ ] Add audio format conversion endpoint

---

## Questions?

For issues or questions:
1. Check logs: `pm2 logs [instance]-python`
2. Test with: `python test_whisper.py`
3. Verify environment: Check `.env` file
4. Check API docs: `http://localhost:8002/docs`
