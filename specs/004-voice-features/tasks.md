# Task Breakdown: Voice Features (TTS & STT)

## Feature ID: 004-voice-features
## Date: 2025-12-25
## Status: Completed

---

## Phase 1: Feature Toggles & Settings

### Task 1.1: ChatbotFeatures Type Update
- [x] Add `enableVoiceInput: boolean` to interface
- [x] Add `enableVoiceOutput: boolean` to interface
- [x] Update defaultFeatures with false defaults
- **File**: `frontend/src/types/chatbot-features.ts`

### Task 1.2: FeatureToggles UI
- [x] Import Mic icon from lucide-react
- [x] Add Voice Features group with 2 toggles
- [x] Voice Input toggle (STT)
- [x] Voice Output toggle (TTS)
- **File**: `frontend/src/components/settings/FeatureToggles.tsx`

### Task 1.3: Database Migration
- [x] Create migration file
- [x] Add voiceSettings entries to settings table
- [x] Include rollback commands
- **File**: `backend/database/migrations/20251225_add_voice_features.sql`

### Task 1.4: Voice Settings Endpoint
- [x] Add GET /api/v2/chat/voice-settings endpoint
- [x] Return all voice settings from database
- **File**: `backend/src/routes/chat.routes.ts`

---

## Phase 2: STT Frontend Implementation

### Task 2.1: Voice Recording Hook
- [x] Create use-voice-recording.ts hook
- [x] MediaRecorder API integration
- [x] WebM/Opus audio capture
- [x] Whisper API transcription call
- [x] Error handling for permissions
- [x] Max duration timeout
- **File**: `frontend/src/lib/hooks/use-voice-recording.ts`

### Task 2.2: ChatInput Mic Button
- [x] Import Mic and Square icons
- [x] Import useVoiceRecording hook
- [x] Add voiceSettings state
- [x] Fetch voice settings on mount
- [x] Add Mic button (inline with Paperclip and Send)
- [x] Recording state visual feedback (pulse animation)
- [x] Transcription -> input field integration
- **File**: `frontend/src/components/chat/chat-input.tsx`

---

## Phase 3: TTS Backend Implementation

### Task 3.1: TTS Service
- [x] Create tts.service.ts
- [x] OpenAI TTS API integration
- [x] synthesize() method
- [x] getVoices() method
- [x] getSettings() from database
- [x] Error handling
- **File**: `backend/src/services/tts/tts.service.ts`

### Task 3.2: TTS Routes
- [x] Create tts.routes.ts
- [x] POST /api/v2/tts/synthesize endpoint
- [x] GET /api/v2/tts/voices endpoint
- [x] GET /api/v2/tts/health endpoint
- [x] Authentication middleware
- [x] Feature enable check
- **File**: `backend/src/routes/tts.routes.ts`

### Task 3.3: Register TTS Routes
- [x] Import ttsRoutes in server.ts
- [x] Register routes with app.use()
- **File**: `backend/src/server.ts`

---

## Phase 4: TTS Frontend Implementation

### Task 4.1: Audio Player Hook
- [x] Create use-audio-player.ts hook
- [x] TTS API request handling
- [x] Audio element playback
- [x] Play/pause/stop controls
- [x] Loading state management
- [x] Error handling
- **File**: `frontend/src/lib/hooks/use-audio-player.ts`

### Task 4.2: MessageItem TTS Button
- [x] Import Volume2, Pause, Loader2 icons
- [x] Import useAudioPlayer hook
- [x] Add voiceOutputEnabled state
- [x] Fetch voice settings on mount
- [x] Add handleTTSToggle function
- [x] Add Speaker button (inline with timestamp)
- [x] Playing state visual feedback
- **File**: `frontend/src/components/chat/message-item.tsx`

---

## Phase 5: Documentation

### Task 5.1: SpecPulse Capsule
- [x] Create specs/004-voice-features/ directory
- [x] Create spec.md with full specification
- [x] Create tasks.md with task breakdown
- **Files**: `specs/004-voice-features/spec.md`, `specs/004-voice-features/tasks.md`

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Phase 1: Feature Toggles | 4 | Completed |
| Phase 2: STT Frontend | 2 | Completed |
| Phase 3: TTS Backend | 3 | Completed |
| Phase 4: TTS Frontend | 2 | Completed |
| Phase 5: Documentation | 1 | Completed |

**Total Tasks**: 12
**Completed**: 12
**Progress**: 100%
