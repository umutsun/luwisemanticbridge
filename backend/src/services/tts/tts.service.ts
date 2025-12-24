/**
 * TTS (Text-to-Speech) Service
 * OpenAI TTS API kullanarak metin-sese dönüşüm
 */

import OpenAI from 'openai';
import { settingsService } from '../settings.service';

export type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
export type TTSFormat = 'mp3' | 'opus' | 'aac' | 'flac';

export interface TTSOptions {
  text: string;
  voice?: TTSVoice;
  speed?: number;  // 0.25 - 4.0
  format?: TTSFormat;
}

export interface TTSResult {
  audio: Buffer;
  format: TTSFormat;
  voice: TTSVoice;
  textLength: number;
  processingTimeMs: number;
}

export interface VoiceInfo {
  id: TTSVoice;
  name: string;
  gender: 'male' | 'female' | 'neutral';
  description: string;
}

class TTSService {
  private openai: OpenAI | null = null;
  private maxTextLength = 4096;

  constructor() {
    this.initialize();
  }

  private initialize() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
      console.log('[TTS] Service initialized with OpenAI');
    } else {
      console.warn('[TTS] OPENAI_API_KEY not set - TTS will not work');
    }
  }

  /**
   * Check if TTS service is ready
   */
  isReady(): boolean {
    return this.openai !== null;
  }

  /**
   * Get available voices
   */
  getVoices(): VoiceInfo[] {
    return [
      { id: 'alloy', name: 'Alloy', gender: 'neutral', description: 'Balanced and versatile voice' },
      { id: 'echo', name: 'Echo', gender: 'male', description: 'Warm and engaging male voice' },
      { id: 'fable', name: 'Fable', gender: 'female', description: 'Expressive British accent' },
      { id: 'onyx', name: 'Onyx', gender: 'male', description: 'Deep and authoritative voice' },
      { id: 'nova', name: 'Nova', gender: 'female', description: 'Friendly and warm female voice' },
      { id: 'shimmer', name: 'Shimmer', gender: 'female', description: 'Clear and optimistic voice' }
    ];
  }

  /**
   * Synthesize text to speech
   */
  async synthesize(options: TTSOptions): Promise<TTSResult> {
    if (!this.openai) {
      throw new Error('TTS service not initialized - OPENAI_API_KEY missing');
    }

    const { text, voice = 'alloy', speed = 1.0, format = 'mp3' } = options;

    // Validate text
    if (!text || text.trim().length === 0) {
      throw new Error('Text is required');
    }

    if (text.length > this.maxTextLength) {
      throw new Error(`Text exceeds maximum length of ${this.maxTextLength} characters`);
    }

    // Validate speed
    const validSpeed = Math.max(0.25, Math.min(4.0, speed));

    const startTime = Date.now();

    try {
      console.log(`[TTS] Synthesizing ${text.length} chars with voice: ${voice}, speed: ${validSpeed}`);

      const response = await this.openai.audio.speech.create({
        model: 'tts-1',
        voice: voice,
        input: text,
        speed: validSpeed,
        response_format: format
      });

      // Get audio buffer from response
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = Buffer.from(arrayBuffer);

      const processingTimeMs = Date.now() - startTime;
      console.log(`[TTS] Synthesis complete: ${audioBuffer.length} bytes in ${processingTimeMs}ms`);

      return {
        audio: audioBuffer,
        format,
        voice,
        textLength: text.length,
        processingTimeMs
      };
    } catch (error: any) {
      console.error('[TTS] Synthesis failed:', error);
      throw new Error(`TTS synthesis failed: ${error.message}`);
    }
  }

  /**
   * Get TTS settings from database
   */
  async getSettings(): Promise<{
    enabled: boolean;
    voice: TTSVoice;
    speed: number;
  }> {
    const enabled = await settingsService.getSetting('voiceSettings.enableVoiceOutput') === 'true';
    const voice = (await settingsService.getSetting('voiceSettings.ttsVoice') || 'alloy') as TTSVoice;
    const speed = parseFloat(await settingsService.getSetting('voiceSettings.ttsSpeed') || '1.0');

    return { enabled, voice, speed };
  }

  /**
   * Estimate processing cost (approximate)
   */
  estimateCost(textLength: number): number {
    // OpenAI TTS pricing: $0.015 per 1K characters
    return (textLength / 1000) * 0.015;
  }
}

export const ttsService = new TTSService();
