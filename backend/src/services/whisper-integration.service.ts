/**
 * Whisper Speech-to-Text Integration Service
 * Communicates with Python Whisper microservice
 */

import FormData from 'form-data';
import fetch from 'node-fetch';
import { Readable } from 'stream';

interface WhisperTranscriptionResult {
  success: boolean;
  text: string;
  language?: string;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  model?: string;
  device?: string;
  error?: string;
}

interface WhisperTranscribeOptions {
  language?: string;
  model?: 'tiny' | 'base' | 'small' | 'medium' | 'large';
  task?: 'transcribe' | 'translate';
  temperature?: number;
  initialPrompt?: string;
  withTimestamps?: boolean;
}

export class WhisperIntegrationService {
  private pythonServiceUrl: string;
  private apiKey: string;

  constructor() {
    this.pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8001';
    this.apiKey = process.env.INTERNAL_API_KEY || 'dev-api-key';
  }

  /**
   * Check if Python Whisper service is available
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.pythonServiceUrl}/health`);
      return response.ok;
    } catch (error) {
      console.error('[WhisperIntegration] Health check failed:', error);
      return false;
    }
  }

  /**
   * Transcribe audio to text
   *
   * @param audioBuffer Audio file buffer
   * @param options Transcription options
   * @returns Transcription result
   */
  async transcribe(
    audioBuffer: Buffer,
    options: WhisperTranscribeOptions = {}
  ): Promise<WhisperTranscriptionResult> {
    try {
      const {
        language = 'tr',
        model = 'base',
        task = 'transcribe',
        temperature = 0.0,
        initialPrompt,
        withTimestamps = false
      } = options;

      console.log(`[WhisperIntegration] Transcribing audio: ${audioBuffer.length} bytes, language=${language}, model=${model}`);

      // Create form data
      const formData = new FormData();

      // Convert buffer to stream for form-data
      const audioStream = Readable.from(audioBuffer);
      formData.append('audio', audioStream, {
        filename: 'audio.webm',
        contentType: 'audio/webm',
      });

      formData.append('language', language);
      formData.append('model', model);
      formData.append('task', task);
      formData.append('temperature', temperature.toString());

      if (initialPrompt) {
        formData.append('initial_prompt', initialPrompt);
      }

      // Choose endpoint based on timestamp requirement
      const endpoint = withTimestamps
        ? '/api/python/whisper/transcribe-with-timestamps'
        : '/api/python/whisper/transcribe';

      const response = await fetch(`${this.pythonServiceUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'X-API-Key': this.apiKey,
          ...formData.getHeaders(),
        },
        body: formData as any,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Python service error: ${response.status} - ${errorText}`);
      }

      const result = await response.json() as WhisperTranscriptionResult;

      if (!result.success) {
        throw new Error(`Transcription failed: ${result.error || 'Unknown error'}`);
      }

      console.log(`[WhisperIntegration] ✅ Transcription completed: ${result.text.length} characters`);

      return result;

    } catch (error) {
      console.error('[WhisperIntegration] Transcription error:', error);
      return {
        success: false,
        text: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Transcribe audio with word-level timestamps
   * Useful for synchronized subtitles or detailed analysis
   */
  async transcribeWithTimestamps(
    audioBuffer: Buffer,
    language: string = 'tr',
    model: 'tiny' | 'base' | 'small' | 'medium' | 'large' = 'base'
  ): Promise<WhisperTranscriptionResult> {
    return this.transcribe(audioBuffer, {
      language,
      model,
      withTimestamps: true
    });
  }

  /**
   * Get supported languages
   */
  async getSupportedLanguages(): Promise<Record<string, string>> {
    try {
      const response = await fetch(
        `${this.pythonServiceUrl}/api/python/whisper/supported-languages`,
        {
          headers: { 'X-API-Key': this.apiKey }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch supported languages');
      }

      const data = await response.json() as { languages: Record<string, string> };
      return data.languages;

    } catch (error) {
      console.error('[WhisperIntegration] Error fetching languages:', error);
      return { tr: 'Turkish', en: 'English' };
    }
  }

  /**
   * Get model information
   */
  async getModelInfo(model: string = 'base'): Promise<any> {
    try {
      const response = await fetch(
        `${this.pythonServiceUrl}/api/python/whisper/model-info?model=${model}`,
        {
          headers: { 'X-API-Key': this.apiKey }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch model info');
      }

      return await response.json();

    } catch (error) {
      console.error('[WhisperIntegration] Error fetching model info:', error);
      return null;
    }
  }
}

// Export singleton instance
export const whisperIntegrationService = new WhisperIntegrationService();
