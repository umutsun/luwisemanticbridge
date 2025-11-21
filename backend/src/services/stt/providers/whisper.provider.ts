/**
 * Whisper STT Provider
 * Wrapper for existing WhisperIntegrationService
 */

import { ISTTProvider, STTResult, STTOptions, STTProviderConfig } from '../types';
import { whisperIntegrationService } from '../../whisper-integration.service';
import fs from 'fs/promises';

export class WhisperProvider implements ISTTProvider {
  readonly name = 'whisper' as const;
  readonly enabled: boolean;
  private config: STTProviderConfig;

  constructor(config: Partial<STTProviderConfig> = {}) {
    this.config = {
      enabled: config.enabled !== false,
      model: config.model || 'base',
      supportedFormats: [
        'audio/wav',
        'audio/mp3',
        'audio/mpeg',
        'audio/webm',
        'audio/ogg',
        'audio/flac',
        'audio/m4a',
      ],
      maxFileSizeMB: 25, // Whisper limit
      supportsDiarization: false, // Whisper doesn't support diarization
      supportsTimestamps: true,
      costPerMinute: 0, // Free (self-hosted)
    };
    this.enabled = this.config.enabled;
  }

  async isReady(): Promise<boolean> {
    try {
      return await whisperIntegrationService.checkHealth();
    } catch {
      return false;
    }
  }

  async transcribe(audioPath: string, options: STTOptions = {}): Promise<STTResult> {
    const startTime = Date.now();

    try {
      // Read audio file
      const audioBuffer = await fs.readFile(audioPath);

      // Transcribe using buffer method
      return await this.transcribeBuffer(audioBuffer, options);

    } catch (error) {
      console.error('[Whisper Provider] Transcription error:', error);
      throw error;
    }
  }

  async transcribeBuffer(audioBuffer: Buffer, options: STTOptions = {}): Promise<STTResult> {
    const startTime = Date.now();

    try {
      const {
        language = 'tr',
        model = 'base',
        enableTimestamps = false,
        initialPrompt,
        temperature = 0.0,
      } = options;

      // Call Whisper service
      const whisperResult = await whisperIntegrationService.transcribe(audioBuffer, {
        language,
        model: model as any,
        task: 'transcribe',
        temperature,
        initialPrompt,
        withTimestamps: enableTimestamps,
      });

      if (!whisperResult.success) {
        throw new Error(whisperResult.error || 'Whisper transcription failed');
      }

      const processingTime = Date.now() - startTime;

      // Calculate audio duration from segments (if available)
      let duration: number | undefined;
      if (whisperResult.segments && whisperResult.segments.length > 0) {
        const lastSegment = whisperResult.segments[whisperResult.segments.length - 1];
        duration = lastSegment.end;
      }

      // Calculate word count
      const wordCount = whisperResult.text.trim().split(/\s+/).length;

      return {
        text: whisperResult.text,
        language: whisperResult.language,
        segments: whisperResult.segments?.map(seg => ({
          start: seg.start,
          end: seg.end,
          text: seg.text,
        })),
        metadata: {
          provider: 'whisper',
          model: whisperResult.model || model,
          duration,
          processingTimeMs: processingTime,
          cost: 0, // Free
          wordCount,
        },
      };

    } catch (error) {
      console.error('[Whisper Provider] Transcription error:', error);
      throw error;
    }
  }

  getConfig(): STTProviderConfig {
    return { ...this.config };
  }

  async getSupportedLanguages(): Promise<Record<string, string>> {
    try {
      return await whisperIntegrationService.getSupportedLanguages();
    } catch {
      return {
        tr: 'Turkish',
        en: 'English',
        ar: 'Arabic',
        de: 'German',
        es: 'Spanish',
        fr: 'French',
      };
    }
  }
}
