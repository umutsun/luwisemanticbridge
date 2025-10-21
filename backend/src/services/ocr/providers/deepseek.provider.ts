/**
 * DeepSeek OCR Provider (via Replicate)
 * DeepSeek-VL modeli Replicate API üzerinden kullanılıyor
 * Yenilikçi OCR yaklaşımı
 */

import { BaseOCRProvider } from '../base-provider';
import { OCRResult, OCROptions, OCRProviderConfig, OCRProviderType } from '../types';
import axios from 'axios';
import { logger } from '../../../utils/logger';
import { settingsService } from '../../settings.service';

interface ReplicateResponse {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed';
  output?: string | string[];
  error?: string;
}

export class DeepSeekProvider extends BaseOCRProvider {
  readonly name: OCRProviderType = 'deepseek';
  readonly enabled: boolean = true;

  private apiKey: string | null = null;
  private modelVersion: string = 'deepseek-ai/deepseek-vl-7b-base';
  private baseUrl: string = 'https://api.replicate.com/v1';

  constructor(config: OCRProviderConfig) {
    super(config);
    if (config.baseUrl) this.baseUrl = config.baseUrl;
  }

  /**
   * API key'i al
   */
  private async getApiKey(): Promise<string> {
    if (this.apiKey) return this.apiKey;

    const key = this.config.apiKey || await settingsService.getApiKey('replicate_api_key');

    if (!key) {
      throw new Error('Replicate API key bulunamadı');
    }

    this.apiKey = key;
    return this.apiKey;
  }

  async isReady(): Promise<boolean> {
    try {
      const key = this.config.apiKey || await settingsService.getApiKey('replicate_api_key');
      return !!key;
    } catch {
      return false;
    }
  }

  /**
   * Görsel OCR işleme
   */
  async processImage(filePath: string, options: OCROptions = {}): Promise<OCRResult> {
    this.startTimer();

    try {
      const apiKey = await this.getApiKey();

      // Image preprocessing
      const { path: processedPath, cleanup } = await this.preprocessImage(filePath);

      // Base64'e çevir
      const base64Image = await this.fileToBase64(processedPath);
      const mimeType = this.getMimeType(filePath);
      const dataUri = `data:${mimeType};base64,${base64Image}`;

      // OCR prompt
      const prompt = options.prompt || this.getDefaultPrompt();

      // Replicate API çağrısı
      const predictionResponse = await axios.post(
        `${this.baseUrl}/predictions`,
        {
          version: this.modelVersion,
          input: {
            image: dataUri,
            prompt: prompt,
            max_tokens: 2048
          }
        },
        {
          headers: {
            'Authorization': `Token ${apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const predictionId = predictionResponse.data.id;

      // Prediction sonucunu bekle (polling)
      const result = await this.waitForPrediction(predictionId, apiKey);

      // Cleanup
      if (cleanup) await this.cleanup(processedPath);

      const extractedText = Array.isArray(result.output)
        ? result.output.join('\n')
        : result.output || '';

      // Görsel boyutları
      const dimensions = await this.getImageDimensions(filePath);

      return {
        text: extractedText.trim(),
        confidence: this.calculateConfidence(extractedText),
        metadata: {
          provider: this.name,
          model: this.modelVersion,
          processingTimeMs: this.getProcessingTime(),
          imageFormat: mimeType,
          imageSize: dimensions,
          predictionId
        }
      };
    } catch (error) {
      logger.error('DeepSeek Vision OCR hatası:', error);
      throw new Error(`DeepSeek Vision OCR başarısız: ${error.message}`);
    }
  }

  /**
   * PDF OCR - şimdilik desteklenmiyor
   */
  async processPDF(filePath: string, options: OCROptions = {}): Promise<OCRResult> {
    throw new Error('DeepSeek Vision için PDF desteği henüz eklenmedi. PDF\'i görsellere ayırın.');
  }

  /**
   * Base64 image OCR
   */
  async processBase64Image(
    base64Data: string,
    mimeType: string,
    options: OCROptions = {}
  ): Promise<OCRResult> {
    this.startTimer();

    try {
      const apiKey = await this.getApiKey();
      const dataUri = `data:${mimeType};base64,${base64Data}`;
      const prompt = options.prompt || this.getDefaultPrompt();

      const predictionResponse = await axios.post(
        `${this.baseUrl}/predictions`,
        {
          version: this.modelVersion,
          input: {
            image: dataUri,
            prompt: prompt,
            max_tokens: 2048
          }
        },
        {
          headers: {
            'Authorization': `Token ${apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const predictionId = predictionResponse.data.id;
      const result = await this.waitForPrediction(predictionId, apiKey);

      const extractedText = Array.isArray(result.output)
        ? result.output.join('\n')
        : result.output || '';

      return {
        text: extractedText.trim(),
        confidence: this.calculateConfidence(extractedText),
        metadata: {
          provider: this.name,
          model: this.modelVersion,
          processingTimeMs: this.getProcessingTime(),
          imageFormat: mimeType,
          predictionId
        }
      };
    } catch (error) {
      logger.error('DeepSeek Vision base64 OCR hatası:', error);
      throw new Error(`DeepSeek Vision OCR başarısız: ${error.message}`);
    }
  }

  /**
   * Prediction sonucunu bekle (polling ile)
   */
  private async waitForPrediction(
    predictionId: string,
    apiKey: string,
    maxAttempts: number = 60
  ): Promise<ReplicateResponse> {
    for (let i = 0; i < maxAttempts; i++) {
      const response = await axios.get(
        `${this.baseUrl}/predictions/${predictionId}`,
        {
          headers: {
            'Authorization': `Token ${apiKey}`
          }
        }
      );

      const prediction: ReplicateResponse = response.data;

      if (prediction.status === 'succeeded') {
        return prediction;
      }

      if (prediction.status === 'failed') {
        throw new Error(`Prediction failed: ${prediction.error || 'Unknown error'}`);
      }

      // 1 saniye bekle
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error('Prediction timeout - işlem çok uzun sürdü');
  }

  /**
   * Provider config
   */
  getConfig(): OCRProviderConfig {
    return {
      ...this.config,
      model: this.modelVersion,
      supportedFormats: ['image/jpeg', 'image/png', 'image/webp'],
      maxFileSize: 10 * 1024 * 1024, // 10MB
      costPerImage: 0.0026 // ~$0.0026 per run
    };
  }

  /**
   * Maliyet tahmini
   */
  async estimateCost(fileSize: number, pageCount: number = 1): Promise<number> {
    return pageCount * 0.0026; // Fixed cost per image
  }

  /**
   * Default OCR prompt
   */
  private getDefaultPrompt(): string {
    return `<image> Describe this image in detail. Extract all visible text exactly as it appears, preserving formatting and structure.`;
  }

  /**
   * Confidence hesaplama
   */
  private calculateConfidence(text: string): number {
    if (!text || text.length < 10) return 0.5;
    if (text.length > 100) return 0.90;
    if (text.length > 50) return 0.82;
    return 0.72;
  }
}
