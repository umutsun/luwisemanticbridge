/**
 * OpenAI OCR Provider
 * GPT-4o kullanarak OCR işlemleri
 */

import { BaseOCRProvider } from '../base-provider';
import { OCRResult, OCROptions, OCRProviderConfig, OCRProviderType } from '../types';
import OpenAI from 'openai';
import { logger } from '../../../utils/logger';
import { settingsService } from '../../settings.service';

export class OpenAIProvider extends BaseOCRProvider {
  readonly name: OCRProviderType = 'openai';
  readonly enabled: boolean = true;

  private client: OpenAI | null = null;
  private model: string = 'gpt-4o';

  constructor(config: OCRProviderConfig) {
    super(config);
  }

  /**
   * OpenAI client'ı initialize et
   */
  private async getClient(): Promise<OpenAI> {
    if (this.client) return this.client;

    const apiKey = this.config.apiKey || await settingsService.getApiKey('openai_api_key');

    if (!apiKey) {
      throw new Error('OpenAI API key bulunamadı');
    }

    this.client = new OpenAI({ apiKey });
    return this.client;
  }

  async isReady(): Promise<boolean> {
    try {
      const apiKey = this.config.apiKey || await settingsService.getApiKey('openai_api_key');
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

      // Image preprocessing
      const { path: processedPath, cleanup } = await this.preprocessImage(filePath);

      // Base64'e çevir
      const base64Image = await this.fileToBase64(processedPath);
      const mimeType = this.getMimeType(filePath);

      // OCR prompt
      const prompt = options.prompt || this.getDefaultPrompt(options.language);

      // OpenAI Vision API çağrısı
      const response = await client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                  detail: options.detailLevel || 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 4096,
        temperature: 0.0
      });

      // Cleanup
      if (cleanup) await this.cleanup(processedPath);

      const extractedText = response.choices[0]?.message?.content || '';
      const tokensUsed = response.usage?.total_tokens || 0;

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
      logger.error('OpenAI Vision OCR hatası:', error);
      throw new Error(`OpenAI Vision OCR başarısız: ${error.message}`);
    }
  }

  /**
   * PDF OCR işleme (sayfa sayfa)
   */
  async processPDF(filePath: string, options: OCROptions = {}): Promise<OCRResult> {
    // PDF → Images dönüşümü gerekli (pdf-poppler veya pdf2image)
    // Şimdilik placeholder implementation
    throw new Error('OpenAI Vision için PDF desteği henüz eklenmedi. Lütfen PDF\'i görsel olarak yükleyin.');
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
      const prompt = options.prompt || this.getDefaultPrompt(options.language);

      const response = await client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Data}`,
                  detail: options.detailLevel || 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 4096,
        temperature: 0.0
      });

      const extractedText = response.choices[0]?.message?.content || '';
      const tokensUsed = response.usage?.total_tokens || 0;

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
      logger.error('OpenAI Vision base64 OCR hatası:', error);
      throw new Error(`OpenAI Vision OCR başarısız: ${error.message}`);
    }
  }

  /**
   * Provider config'i döndür
   */
  getConfig(): OCRProviderConfig {
    return {
      ...this.config,
      model: this.model,
      supportedFormats: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      maxFileSize: 20 * 1024 * 1024, // 20MB
      costPerToken: 0.000005 // $5 / 1M tokens (approximate)
    };
  }

  /**
   * Maliyet tahmini
   */
  async estimateCost(fileSize: number, pageCount: number = 1): Promise<number> {
    // Vision token hesaplama (yaklaşık)
    // High detail: ~1000-2000 token per image
    const estimatedTokens = pageCount * 1500;
    return this.calculateCost(estimatedTokens);
  }

  /**
   * Default OCR prompt
   */
  private getDefaultPrompt(language?: string): string {
    const langInstruction = language
      ? `Extract all text in ${language} language.`
      : 'Extract all text preserving the original language.';

    return `${langInstruction}

Please transcribe ALL visible text from this image with perfect accuracy.
Include:
- All text content in reading order
- Preserve formatting, line breaks, and structure
- Include table data if present
- Maintain original punctuation and spacing

Return ONLY the extracted text, no explanations or additional commentary.`;
  }

  /**
   * Confidence hesaplama (basit heuristic)
   */
  private calculateConfidence(text: string): number {
    if (!text || text.length < 10) return 0.5;
    if (text.length > 100) return 0.95;
    if (text.length > 50) return 0.85;
    return 0.75;
  }

  /**
   * Maliyet hesaplama
   */
  private calculateCost(tokens: number): number {
    const costPerToken = 0.000005; // $5 / 1M tokens
    return tokens * costPerToken;
  }
}
