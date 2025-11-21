/**
 * Google Cloud Speech-to-Text Provider
 * Primary STT provider with speaker diarization support
 */

import { ISTTProvider, STTResult, STTOptions, STTProviderConfig } from '../types';
import { settingsService } from '../../settings.service';
import fs from 'fs/promises';
import fetch from 'node-fetch';

export class GoogleProvider implements ISTTProvider {
  readonly name = 'google' as const;
  readonly enabled: boolean;
  private config: STTProviderConfig;
  private apiKey: string | null = null;

  constructor(config: Partial<STTProviderConfig> = {}) {
    this.config = {
      enabled: config.enabled !== false,
      model: config.model || 'latest_long',
      supportedFormats: [
        'audio/wav',
        'audio/mp3',
        'audio/mpeg',
        'audio/flac',
        'audio/ogg',
        'audio/webm',
      ],
      maxFileSizeMB: 10, // Google Cloud limit for sync requests
      supportsDiarization: true,
      supportsTimestamps: true,
      costPerMinute: 0.006, // $0.006 per 15 seconds
    };
    this.enabled = this.config.enabled;
  }

  async isReady(): Promise<boolean> {
    try {
      // Check if API key exists in settings
      await this.loadApiKey();
      return this.apiKey !== null && this.apiKey.length > 0;
    } catch {
      return false;
    }
  }

  private async loadApiKey(): Promise<void> {
    if (this.apiKey) return; // Already loaded

    try {
      const settings = await settingsService.getAllSettings();
      this.apiKey = settings.google_speech_api_key || process.env.GOOGLE_SPEECH_API_KEY || null;
    } catch (error) {
      console.warn('[Google STT] Failed to load API key from settings');
      this.apiKey = process.env.GOOGLE_SPEECH_API_KEY || null;
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
      console.error('[Google STT] Transcription error:', error);
      throw error;
    }
  }

  async transcribeBuffer(audioBuffer: Buffer, options: STTOptions = {}): Promise<STTResult> {
    const startTime = Date.now();

    try {
      await this.loadApiKey();

      if (!this.apiKey) {
        throw new Error('Google Speech API key not configured');
      }

      const {
        language = 'tr-TR',
        enableDiarization = false,
        speakerCount = 2,
        enableTimestamps = true,
        enablePunctuation = true,
        filterProfanity = false,
        maxAlternatives = 1,
      } = options;

      // Convert audio buffer to base64
      const audioContent = audioBuffer.toString('base64');

      // Build request body
      const requestBody: any = {
        config: {
          encoding: this.detectEncoding(audioBuffer),
          sampleRateHertz: 16000, // Common sample rate
          languageCode: language,
          enableAutomaticPunctuation: enablePunctuation,
          enableWordTimeOffsets: enableTimestamps,
          maxAlternatives,
          profanityFilter: filterProfanity,
          model: this.config.model,
        },
        audio: {
          content: audioContent,
        },
      };

      // Add speaker diarization config if enabled
      if (enableDiarization) {
        requestBody.config.diarizationConfig = {
          enableSpeakerDiarization: true,
          minSpeakerCount: 1,
          maxSpeakerCount: speakerCount || 6,
        };
      }

      // Call Google Speech-to-Text API
      const response = await fetch(
        `https://speech.googleapis.com/v1/speech:recognize?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google Speech API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      if (!result.results || result.results.length === 0) {
        return {
          text: '',
          confidence: 0,
          language,
          metadata: {
            provider: 'google',
            model: this.config.model,
            processingTimeMs: Date.now() - startTime,
            cost: 0,
            wordCount: 0,
          },
        };
      }

      // Extract transcription
      const transcript = result.results
        .map((r: any) => r.alternatives[0].transcript)
        .join(' ');

      // Extract confidence
      const avgConfidence = result.results
        .reduce((sum: number, r: any) => sum + (r.alternatives[0].confidence || 0), 0) / result.results.length;

      // Extract word-level timestamps
      const segments = this.extractSegments(result.results, enableDiarization);

      // Calculate cost (per 15 seconds)
      const durationSec = segments.length > 0 ? segments[segments.length - 1].end : 0;
      const cost = Math.ceil(durationSec / 15) * 0.006;

      // Calculate word count
      const wordCount = transcript.trim().split(/\s+/).length;

      return {
        text: transcript,
        confidence: Math.round(avgConfidence * 100),
        language,
        segments,
        metadata: {
          provider: 'google',
          model: this.config.model,
          duration: durationSec,
          processingTimeMs: Date.now() - startTime,
          cost,
          wordCount,
          speakerCount: enableDiarization ? this.countSpeakers(segments) : undefined,
        },
      };

    } catch (error) {
      console.error('[Google STT] Transcription error:', error);
      throw error;
    }
  }

  private detectEncoding(audioBuffer: Buffer): string {
    // Simple encoding detection based on file signature
    // In production, you might want to use a library like `file-type`
    const header = audioBuffer.slice(0, 12).toString('hex');

    if (header.startsWith('52494646')) return 'WAV'; // RIFF
    if (header.startsWith('fffb') || header.startsWith('fff3')) return 'MP3';
    if (header.startsWith('664c6143')) return 'FLAC';
    if (header.startsWith('4f676753')) return 'OGG_OPUS';

    return 'LINEAR16'; // Default
  }

  private extractSegments(results: any[], withDiarization: boolean): any[] {
    const segments: any[] = [];

    for (const result of results) {
      const alternative = result.alternatives[0];

      if (alternative.words && alternative.words.length > 0) {
        for (const word of alternative.words) {
          const startTime = this.parseTime(word.startTime);
          const endTime = this.parseTime(word.endTime);

          segments.push({
            start: startTime,
            end: endTime,
            text: word.word,
            confidence: alternative.confidence ? Math.round(alternative.confidence * 100) : undefined,
            speaker: withDiarization && word.speakerTag ? `Speaker ${word.speakerTag}` : undefined,
          });
        }
      }
    }

    return segments;
  }

  private parseTime(timeStr: string | undefined): number {
    if (!timeStr) return 0;

    // Parse Google's duration format: "1.500s" -> 1.5
    const match = timeStr.match(/^(\d+\.?\d*)s$/);
    return match ? parseFloat(match[1]) : 0;
  }

  private countSpeakers(segments: any[]): number {
    const speakers = new Set(segments.map(s => s.speaker).filter(Boolean));
    return speakers.size;
  }

  getConfig(): STTProviderConfig {
    return { ...this.config };
  }

  async getSupportedLanguages(): Promise<Record<string, string>> {
    // Google Speech-to-Text supports 125+ languages
    // Returning most common ones
    return {
      'tr-TR': 'Turkish',
      'en-US': 'English (US)',
      'en-GB': 'English (UK)',
      'ar-SA': 'Arabic',
      'de-DE': 'German',
      'es-ES': 'Spanish',
      'fr-FR': 'French',
      'it-IT': 'Italian',
      'ja-JP': 'Japanese',
      'ko-KR': 'Korean',
      'pt-BR': 'Portuguese (Brazil)',
      'ru-RU': 'Russian',
      'zh-CN': 'Chinese (Simplified)',
    };
  }
}
