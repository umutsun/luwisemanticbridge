# Feature Specification: Voice Features (TTS & STT)

## Feature ID: 004-voice-features
## Date: 2025-12-25
## Status: Implemented

---

## Overview

Chat interface'e sesli girdi (STT/Whisper) ve sesli cikti (TTS) ozellikleri eklenmesi.

### Features
- **STT (Speech-to-Text)**: Kullanici mikrofona konusarak mesaj gonderebilir
- **TTS (Text-to-Speech)**: AI yaniti sesli olarak dinlenebilir

---

## User Stories

### US-001: Voice Input (STT)
**As a** user
**I want to** send messages using my voice
**So that** I can interact with the chatbot hands-free

**Acceptance Criteria:**
- [x] Mic button visible in chat input when feature is enabled
- [x] Recording starts on mic click
- [x] Visual feedback during recording (pulse animation)
- [x] Transcription added to input field after recording stops
- [x] Error handling for microphone permission denied

### US-002: Voice Output (TTS)
**As a** user
**I want to** listen to AI responses
**So that** I can consume content while doing other tasks

**Acceptance Criteria:**
- [x] Speaker button visible on assistant messages when feature is enabled
- [x] Audio plays on speaker click
- [x] Pause/stop functionality during playback
- [x] Loading indicator while audio is being generated
- [x] Error handling for TTS failures

### US-003: Feature Toggles
**As an** admin
**I want to** enable/disable voice features
**So that** I can control which features are available to users

**Acceptance Criteria:**
- [x] Voice Input toggle in settings UI
- [x] Voice Output toggle in settings UI
- [x] Settings persist in database
- [x] Features hidden when disabled

---

## Technical Specifications

### STT (Speech-to-Text)

**Provider**: OpenAI Whisper API (via existing backend)

**Flow**:
1. User clicks Mic button
2. MediaRecorder captures audio (WebM/Opus format)
3. Audio sent to `/api/whisper/transcribe`
4. Transcription returned and added to input

**Limits**:
- Max recording: 60 seconds (configurable)
- Audio format: WebM/Opus

### TTS (Text-to-Speech)

**Provider**: OpenAI TTS API

**Voices Available**:
| Voice | Gender | Description |
|-------|--------|-------------|
| alloy | neutral | Balanced and versatile |
| echo | male | Warm and engaging |
| fable | female | Expressive British accent |
| onyx | male | Deep and authoritative |
| nova | female | Friendly and warm |
| shimmer | female | Clear and optimistic |

**Flow**:
1. User clicks Speaker button on assistant message
2. Request sent to `/api/v2/tts/synthesize`
3. Audio stream returned (MP3)
4. Audio played in browser

**Limits**:
- Max text: 4096 characters
- Speed: 0.25x - 4.0x

---

## Database Schema

### Settings Table Entries

| Key | Default | Description |
|-----|---------|-------------|
| `voiceSettings.enableVoiceInput` | `false` | Enable STT |
| `voiceSettings.enableVoiceOutput` | `false` | Enable TTS |
| `voiceSettings.ttsProvider` | `openai` | TTS provider |
| `voiceSettings.ttsVoice` | `alloy` | Default voice |
| `voiceSettings.ttsSpeed` | `1.0` | Playback speed |
| `voiceSettings.maxRecordingSeconds` | `60` | Max recording duration |

---

## API Endpoints

### STT (Existing)
```
POST /api/whisper/transcribe
Body: FormData (audio file)
Response: { text: string, language: string }
```

### TTS (New)
```
POST /api/v2/tts/synthesize
Body: { text: string, voice?: string, speed?: number }
Response: audio/mpeg stream

GET /api/v2/tts/voices
Response: { voices: Voice[], defaultVoice: string, defaultSpeed: number }

GET /api/v2/tts/health
Response: { status: string, enabled: boolean, ready: boolean }
```

### Settings
```
GET /api/v2/chat/voice-settings
Response: {
  enableVoiceInput: boolean,
  enableVoiceOutput: boolean,
  ttsVoice: string,
  ttsSpeed: number,
  maxRecordingSeconds: number
}
```

---

## File Structure

### New Files
```
frontend/src/lib/hooks/use-voice-recording.ts    # STT recording hook
frontend/src/lib/hooks/use-audio-player.ts       # TTS playback hook
backend/src/services/tts/tts.service.ts          # TTS service
backend/src/routes/tts.routes.ts                 # TTS API routes
backend/database/migrations/20251225_add_voice_features.sql
```

### Modified Files
```
frontend/src/types/chatbot-features.ts           # +2 toggles
frontend/src/components/settings/FeatureToggles.tsx  # Voice group
frontend/src/components/chat/chat-input.tsx      # Mic button
frontend/src/components/chat/message-item.tsx    # Speaker button
backend/src/routes/chat.routes.ts                # Voice settings endpoint
backend/src/server.ts                            # TTS routes registration
```

---

## Security Considerations

- Audio data processed ephemerally (not stored)
- TTS requests require authentication
- Rate limiting on TTS endpoint (prevent abuse)
- Max text length enforced server-side

---

## Dependencies

### Frontend
- MediaRecorder API (browser native)
- Audio element (browser native)

### Backend
- OpenAI SDK (`openai` package) - already installed
- Existing Whisper service

---

## Testing

### Manual Testing
1. Enable Voice Input in settings
2. Click Mic, speak, click again -> text should appear in input
3. Enable Voice Output in settings
4. Send a message, click Speaker on response -> audio should play

### Error Cases
- Microphone permission denied -> appropriate error message
- Network error during TTS -> graceful fallback
- Feature disabled -> buttons hidden

---

## Deployment Notes

1. Run migration: `20251225_add_voice_features.sql`
2. Deploy backend first (TTS service)
3. Deploy frontend
4. Enable features in Settings UI

---

## Future Enhancements

- [ ] Continuous recording mode (press-and-hold)
- [ ] Voice activity detection (auto stop recording)
- [ ] TTS audio caching
- [ ] Multiple language support for STT
- [ ] Voice cloning support
