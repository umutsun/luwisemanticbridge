/**
 * Speech-to-Text (STT) Type Definitions
 * Shared types for all STT providers (Google, Whisper, etc.)
 */

export type STTProviderType =
  | 'google'      // Google Cloud Speech-to-Text (primary)
  | 'whisper'     // OpenAI Whisper (fallback)
  | 'auto';       // Automatic selection based on settings

export interface STTSegment {
  start: number;      // Start time in seconds
  end: number;        // End time in seconds
  text: string;       // Transcribed text for this segment
  confidence?: number; // Confidence score (0-100)
  speaker?: string;   // Speaker label (if diarization enabled)
}

export interface STTResult {
  text: string;                  // Full transcribed text
  confidence?: number;           // Overall confidence (0-100)
  language?: string;             // Detected/specified language code
  segments?: STTSegment[];       // Time-stamped segments
  metadata: {
    provider: STTProviderType;   // Which provider was used
    model?: string;              // Model name/version
    duration?: number;           // Audio duration in seconds
    processingTimeMs: number;    // Processing time in milliseconds
    cost?: number;               // Processing cost in USD
    fallbackUsed?: boolean;      // True if fallback provider was used
    primaryProvider?: STTProviderType; // Original provider if fallback used
    speakerCount?: number;       // Number of speakers detected
    wordCount?: number;          // Number of words transcribed
  };
}

export interface STTOptions {
  provider?: STTProviderType;    // Force specific provider
  language?: string;             // Language code (en, tr, auto, etc.)
  model?: string;                // Model to use (provider-specific)
  enableDiarization?: boolean;   // Enable speaker diarization
  speakerCount?: number;         // Expected number of speakers
  enableTimestamps?: boolean;    // Enable word-level timestamps
  enablePunctuation?: boolean;   // Enable automatic punctuation
  filterProfanity?: boolean;     // Filter profanity
  customVocabulary?: string[];   // Custom vocabulary/phrases
  initialPrompt?: string;        // Initial prompt for context
  temperature?: number;          // Sampling temperature (Whisper)
  maxAlternatives?: number;      // Number of alternative transcriptions
}

export interface STTProviderConfig {
  enabled: boolean;
  model?: string;
  supportedFormats: string[];    // ['audio/wav', 'audio/mp3', etc.]
  maxFileSizeMB?: number;
  supportsDiarization?: boolean;
  supportsTimestamps?: boolean;
  costPerMinute?: number;        // USD per minute
}

export interface ISTTProvider {
  readonly name: STTProviderType;
  readonly enabled: boolean;

  /**
   * Check if provider is ready to process audio
   */
  isReady(): Promise<boolean>;

  /**
   * Transcribe audio file to text
   */
  transcribe(
    audioPath: string,
    options?: STTOptions
  ): Promise<STTResult>;

  /**
   * Transcribe audio buffer to text
   */
  transcribeBuffer(
    audioBuffer: Buffer,
    options?: STTOptions
  ): Promise<STTResult>;

  /**
   * Get provider configuration
   */
  getConfig(): STTProviderConfig;

  /**
   * Get supported languages
   */
  getSupportedLanguages(): Promise<Record<string, string>>;
}
