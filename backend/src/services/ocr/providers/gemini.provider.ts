/**
 * Gemini OCR Provider
 * Google Gemini 2.0 Flash kullanarak OCR işlemleri
 * Hızlı, ucuz ve güçlü alternatif
 */

import { BaseOCRProvider } from '../base-provider';
import { OCRResult, OCROptions, OCRProviderConfig, OCRProviderType } from '../types';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../../../utils/logger';
import { settingsService } from '../../settings.service';

export class GeminiProvider extends BaseOCRProvider {
  readonly name: OCRProviderType = 'gemini';
  readonly enabled: boolean = true;

  private client: GoogleGenerativeAI | null = null;
  private model: string = 'gemini-2.0-flash-exp';

  constructor(config: OCRProviderConfig) {
    super(config);
    if (config.model) this.model = config.model;
  }

  /**
   * Gemini client'ı initialize et
   */
  private async getClient(): Promise<GoogleGenerativeAI> {
    if (this.client) return this.client;

    const apiKey = this.config.apiKey || await settingsService.getApiKey('gemini_api_key');

    if (!apiKey) {
      throw new Error('Gemini API key bulunamadı');
    }

    this.client = new GoogleGenerativeAI(apiKey);
    return this.client;
  }

  async isReady(): Promise<boolean> {
    try {
      const apiKey = this.config.apiKey || await settingsService.getApiKey('gemini_api_key');
      return !!apiKey;
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
      const client = await this.getClient();
      const model = client.getGenerativeModel({ model: this.model });

      // Image preprocessing
      const { path: processedPath, cleanup } = await this.preprocessImage(filePath);

      // Base64'e çevir
      const base64Image = await this.fileToBase64(processedPath);
      const mimeType = this.getMimeType(filePath);

      // OCR prompt
      const prompt = options.prompt || this.getDefaultPrompt(options.language);

      // Gemini Vision API çağrısı
      const result = await model.generateContent([
        {
          inlineData: {
            data: base64Image,
            mimeType
          }
        },
        prompt
      ]);

      // Cleanup
      if (cleanup) await this.cleanup(processedPath);

      const response = await result.response;
      const extractedText = response.text();

      // Token kullanımı (Gemini'de usageMetadata var)
      const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

      // Görsel boyutları
      const dimensions = await this.getImageDimensions(filePath);

      return {
        text: extractedText.trim(),
        confidence: this.calculateConfidence(extractedText),
        metadata: {
          provider: this.name,
          model: this.model,
          processingTimeMs: this.getProcessingTime(),
          tokensUsed,
          cost: this.calculateCost(tokensUsed),
          imageFormat: mimeType,
          imageSize: dimensions
        }
      };
    } catch (error) {
      logger.error('Gemini Vision OCR hatası:', error);
      throw new Error(`Gemini Vision OCR başarısız: ${error.message}`);
    }
  }

  /**
   * PDF OCR işleme
   */
  async processPDF(filePath: string, options: OCROptions = {}): Promise<OCRResult> {
    this.startTimer();

    try {
      const client = await this.getClient();
      const model = client.getGenerativeModel({ model: this.model });

      // PDF'i base64'e çevir
      const base64PDF = await this.fileToBase64(filePath);

      // OCR prompt
      const prompt = options.prompt || this.getDefaultPrompt(options.language);

      // Gemini PDF desteği (beta)
      const result = await model.generateContent([
        {
          inlineData: {
            data: base64PDF,
            mimeType: 'application/pdf'
          }
        },
        prompt
      ]);

      const response = await result.response;
      const extractedText = response.text();
      const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

      return {
        text: extractedText.trim(),
        confidence: this.calculateConfidence(extractedText),
        metadata: {
          provider: this.name,
          model: this.model,
          processingTimeMs: this.getProcessingTime(),
          tokensUsed,
          cost: this.calculateCost(tokensUsed),
          imageFormat: 'application/pdf'
        }
      };
    } catch (error) {
      logger.error('Gemini Vision PDF OCR hatası:', error);
      throw new Error(`Gemini Vision PDF OCR başarısız: ${error.message}`);
    }
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
      const client = await this.getClient();
      const model = client.getGenerativeModel({ model: this.model });

      const prompt = options.prompt || this.getDefaultPrompt(options.language);

      const result = await model.generateContent([
        {
          inlineData: {
            data: base64Data,
            mimeType
          }
        },
        prompt
      ]);

      const response = await result.response;
      const extractedText = response.text();
      const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

      return {
        text: extractedText.trim(),
        confidence: this.calculateConfidence(extractedText),
        metadata: {
          provider: this.name,
          model: this.model,
          processingTimeMs: this.getProcessingTime(),
          tokensUsed,
          cost: this.calculateCost(tokensUsed),
          imageFormat: mimeType
        }
      };
    } catch (error) {
      logger.error('Gemini Vision base64 OCR hatası:', error);
      throw new Error(`Gemini Vision OCR başarısız: ${error.message}`);
    }
  }

  /**
   * Provider config'i döndür
   */
  getConfig(): OCRProviderConfig {
    return {
      ...this.config,
      model: this.model,
      supportedFormats: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'],
      maxFileSize: 20 * 1024 * 1024, // 20MB
      costPerToken: 0.00000015 // Gemini 2.0 Flash çok ucuz!
    };
  }

  /**
   * Maliyet tahmini
   */
  async estimateCost(fileSize: number, pageCount: number = 1): Promise<number> {
    // Gemini token hesaplama
    const estimatedTokens = pageCount * 1000;
    return this.calculateCost(estimatedTokens);
  }

  /**
   * Default OCR prompt
   */
  private getDefaultPrompt(language?: string): string {
    const langInstruction = language
      ? `Lütfen ${language} dilindeki tüm metni çıkar.`
      : 'Lütfen tüm metni orijinal dilinde çıkar.';

    return `${langInstruction}

Bu görseldeki TÜM metni mükemmel doğrulukla çevir.

İçermesi gerekenler:
- Okuma sırasına göre tüm metin içeriği
- Biçimlendirme, satır sonları ve yapıyı koru
- Tablo verileri varsa dahil et
- Orijinal noktalama ve boşlukları koru

SADECE çıkarılan metni döndür, açıklama veya ek yorum ekleme.`;
  }

  /**
   * Confidence hesaplama
   */
  private calculateConfidence(text: string): number {
    if (!text || text.length < 10) return 0.6;
    if (text.length > 100) return 0.95;
    if (text.length > 50) return 0.88;
    return 0.78;
  }

  /**
   * Maliyet hesaplama (Gemini çok ucuz!)
   */
  private calculateCost(tokens: number): number {
    const costPerToken = 0.00000015; // ~$0.15 / 1M tokens
    return tokens * costPerToken;
  }
}
