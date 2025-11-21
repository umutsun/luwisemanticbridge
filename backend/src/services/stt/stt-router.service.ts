/**
 * STT (Speech-to-Text) Router Service
 * Smart provider selection with fallback chain (Google → Whisper)
 *
 * Features:
 * - Settings-based active STT provider selection
 * - Automatic fallback chain (Google → Whisper)
 * - Cost tracking
 * - Provider health monitoring
 */

import { ISTTProvider, STTResult, STTOptions, STTProviderType, STTProviderConfig } from './types';
import { GoogleProvider } from './providers/google.provider';
import { WhisperProvider } from './providers/whisper.provider';
import { settingsService } from '../settings.service';
import { logger } from '../../utils/logger';

interface STTSettings {
  activeProvider: STTProviderType;
  fallbackEnabled: boolean;
  fallbackProvider: STTProviderType;
}

export class STTRouterService {
  private static instance: STTRouterService;
  private providers: Map<STTProviderType, ISTTProvider> = new Map();
  private defaultFallbackChain: STTProviderType[] = [
    'google',    // Primary: Best quality, diarization support
    'whisper',   // Fallback: Free, reliable
  ];

  private constructor() {
    this.initializeProviders();
  }

  public static getInstance(): STTRouterService {
    if (!STTRouterService.instance) {
      STTRouterService.instance = new STTRouterService();
    }
    return STTRouterService.instance;
  }

  /**
   * Initialize all STT providers
   */
  private async initializeProviders(): Promise<void> {
    try {
      // Google Speech-to-Text
      this.providers.set('google', new GoogleProvider({
        enabled: true,
      }));

      // Whisper
      this.providers.set('whisper', new WhisperProvider({
        enabled: true,
      }));

      logger.info('✅ STT Router - All providers initialized');
    } catch (error) {
      logger.error('❌ STT Router - Provider initialization error:', error);
    }
  }

  /**
   * Get STT settings from database
   */
  private async getSTTSettings(): Promise<STTSettings> {
    try {
      const settings = await settingsService.getAllSettings();

      return {
        activeProvider: (settings.stt_active_provider as STTProviderType) || 'google',
        fallbackEnabled: settings.stt_fallback_enabled !== false, // Default true
        fallbackProvider: (settings.stt_fallback_provider as STTProviderType) || 'whisper',
      };
    } catch (error) {
      logger.warn('⚠️ Settings not available, using defaults');
      return {
        activeProvider: 'google',
        fallbackEnabled: true,
        fallbackProvider: 'whisper',
      };
    }
  }

  /**
   * Main transcription function
   */
  async transcribe(
    audioPath: string,
    options: STTOptions = {}
  ): Promise<STTResult> {
    const startTime = Date.now();

    try {
      // Get settings
      const settings = await this.getSTTSettings();

      // Select provider
      const selectedProvider = options.provider || settings.activeProvider;
      const provider = await this.selectProvider(selectedProvider);

      logger.info(`🎤 STT starting: ${audioPath} (Provider: ${provider})`);

      // Transcribe with fallback chain
      const result = await this.transcribeWithFallback(
        audioPath,
        provider,
        options,
        settings
      );

      logger.info(`✅ STT completed (${Date.now() - startTime}ms)`);
      return result;

    } catch (error) {
      logger.error('❌ STT Router error:', error);
      throw error;
    }
  }

  /**
   * Transcribe audio buffer
   */
  async transcribeBuffer(
    audioBuffer: Buffer,
    options: STTOptions = {}
  ): Promise<STTResult> {
    const startTime = Date.now();

    try {
      // Get settings
      const settings = await this.getSTTSettings();

      // Select provider
      const selectedProvider = options.provider || settings.activeProvider;
      const provider = await this.selectProvider(selectedProvider);

      logger.info(`🎤 STT starting: buffer (Provider: ${provider})`);

      // Transcribe with fallback chain
      const result = await this.transcribeBufferWithFallback(
        audioBuffer,
        provider,
        options,
        settings
      );

      logger.info(`✅ STT completed (${Date.now() - startTime}ms)`);
      return result;

    } catch (error) {
      logger.error('❌ STT Router error:', error);
      throw error;
    }
  }

  /**
   * Transcribe with fallback chain
   */
  private async transcribeWithFallback(
    audioPath: string,
    primaryProvider: STTProviderType,
    options: STTOptions,
    settings: STTSettings
  ): Promise<STTResult> {
    // Build fallback chain
    const chain: STTProviderType[] = [primaryProvider];

    if (settings.fallbackEnabled) {
      // Add fallback provider if different
      if (settings.fallbackProvider !== primaryProvider) {
        chain.push(settings.fallbackProvider);
      }

      // Add Whisper as last resort if not in chain
      if (!chain.includes('whisper')) {
        chain.push('whisper');
      }
    }

    logger.debug(`STT Fallback Chain: ${chain.join(' → ')}`);

    // Try each provider in chain
    let lastError: Error | null = null;

    for (const providerName of chain) {
      try {
        const result = await this.executeTranscribe(audioPath, providerName, options);

        // Mark if fallback was used
        if (providerName !== primaryProvider) {
          result.metadata.fallbackUsed = true;
          result.metadata.primaryProvider = primaryProvider;
          logger.warn(`⚠️ Fallback used: ${primaryProvider} → ${providerName}`);
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        logger.error(`❌ Provider ${providerName} failed:`, error.message);

        // Continue to next provider in chain
        continue;
      }
    }

    // All providers failed
    throw new Error(`All STT providers failed. Last error: ${lastError?.message}`);
  }

  /**
   * Transcribe buffer with fallback chain
   */
  private async transcribeBufferWithFallback(
    audioBuffer: Buffer,
    primaryProvider: STTProviderType,
    options: STTOptions,
    settings: STTSettings
  ): Promise<STTResult> {
    // Build fallback chain
    const chain: STTProviderType[] = [primaryProvider];

    if (settings.fallbackEnabled) {
      if (settings.fallbackProvider !== primaryProvider) {
        chain.push(settings.fallbackProvider);
      }
      if (!chain.includes('whisper')) {
        chain.push('whisper');
      }
    }

    logger.debug(`STT Fallback Chain: ${chain.join(' → ')}`);

    // Try each provider
    let lastError: Error | null = null;

    for (const providerName of chain) {
      try {
        const result = await this.executeTranscribeBuffer(audioBuffer, providerName, options);

        if (providerName !== primaryProvider) {
          result.metadata.fallbackUsed = true;
          result.metadata.primaryProvider = primaryProvider;
          logger.warn(`⚠️ Fallback used: ${primaryProvider} → ${providerName}`);
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        logger.error(`❌ Provider ${providerName} failed:`, error.message);
        continue;
      }
    }

    throw new Error(`All STT providers failed. Last error: ${lastError?.message}`);
  }

  /**
   * Execute transcription with specific provider
   */
  private async executeTranscribe(
    audioPath: string,
    providerName: STTProviderType,
    options: STTOptions
  ): Promise<STTResult> {
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new Error(`Provider not found: ${providerName}`);
    }

    // Check if provider is ready
    const isReady = await provider.isReady();
    if (!isReady) {
      throw new Error(`Provider not ready: ${providerName}`);
    }

    return await provider.transcribe(audioPath, options);
  }

  /**
   * Execute buffer transcription with specific provider
   */
  private async executeTranscribeBuffer(
    audioBuffer: Buffer,
    providerName: STTProviderType,
    options: STTOptions
  ): Promise<STTResult> {
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new Error(`Provider not found: ${providerName}`);
    }

    const isReady = await provider.isReady();
    if (!isReady) {
      throw new Error(`Provider not ready: ${providerName}`);
    }

    return await provider.transcribeBuffer(audioBuffer, options);
  }

  /**
   * Smart provider selection
   */
  private async selectProvider(requested: STTProviderType): Promise<STTProviderType> {
    // If auto, select based on availability
    if (requested === 'auto') {
      // Try Google first (best quality)
      const googleReady = await this.isProviderReady('google');
      if (googleReady) return 'google';

      // Fall back to Whisper
      const whisperReady = await this.isProviderReady('whisper');
      if (whisperReady) return 'whisper';

      throw new Error('No STT providers available');
    }

    return requested;
  }

  /**
   * Check if provider is ready
   */
  private async isProviderReady(providerName: STTProviderType): Promise<boolean> {
    const provider = this.providers.get(providerName);
    if (!provider) return false;

    try {
      return await provider.isReady();
    } catch {
      return false;
    }
  }

  /**
   * Get available providers and their status
   */
  async getAvailableProviders(): Promise<Array<{
    name: STTProviderType;
    enabled: boolean;
    ready: boolean;
    config: STTProviderConfig;
  }>> {
    const result: Array<any> = [];

    for (const [name, provider] of this.providers.entries()) {
      const ready = await provider.isReady();

      result.push({
        name,
        enabled: provider.enabled,
        ready,
        config: provider.getConfig(),
      });
    }

    return result;
  }

  /**
   * Get supported languages for a provider
   */
  async getSupportedLanguages(providerName?: STTProviderType): Promise<Record<string, string>> {
    const provider = providerName
      ? this.providers.get(providerName)
      : this.providers.get('google'); // Default to Google

    if (!provider) {
      return { 'tr-TR': 'Turkish', 'en-US': 'English' };
    }

    return await provider.getSupportedLanguages();
  }
}

export const sttRouterService = STTRouterService.getInstance();
