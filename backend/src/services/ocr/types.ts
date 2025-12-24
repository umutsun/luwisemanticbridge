/**
 * OCR Provider Types & Interfaces
 * Multi-provider OCR sistemi için type tanımlamaları
 */

export type OCRProviderType = 'openai' | 'gemini' | 'deepseek' | 'tesseract' | 'auto';

export interface OCRResult {
  text: string;
  confidence: number;
  metadata: OCRMetadata;
}

export interface OCRMetadata {
  provider: OCRProviderType;
  model?: string;
  processingTimeMs: number;
  tokensUsed?: number;
  cost?: number;
  imageFormat?: string;
  imageSize?: { width: number; height: number };
  pageCount?: number;
  cacheHit?: boolean;
  fallbackUsed?: boolean;
  [key: string]: any;
}

export interface OCROptions {
  provider?: OCRProviderType;
  language?: string;
  prompt?: string;
  detailLevel?: 'low' | 'high' | 'auto';
  maxPages?: number;
  enhanceImage?: boolean;
  skipCache?: boolean; // Skip Redis cache (for ephemeral processing like chat PDF)
}

export interface OCRProviderConfig {
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  maxFileSize?: number;
  supportedFormats?: string[];
  costPerImage?: number;
  costPerToken?: number;
}

export interface OCRCacheEntry {
  result: OCRResult;
  timestamp: number;
  fileHash: string;
  provider: OCRProviderType;
}

/**
 * OCR Provider Interface
 * Tüm OCR provider'ları bu interface'i implement etmeli
 */
export interface IOCRProvider {
  readonly name: OCRProviderType;
  readonly enabled: boolean;

  /**
   * Provider hazır mı kontrol et
   */
  isReady(): Promise<boolean>;

  /**
   * Görsel dosyadan OCR
   */
  processImage(
    filePath: string,
    options?: OCROptions
  ): Promise<OCRResult>;

  /**
   * PDF dosyadan OCR
   */
  processPDF(
    filePath: string,
    options?: OCROptions
  ): Promise<OCRResult>;

  /**
   * Base64 encoded image'den OCR
   */
  processBase64Image(
    base64Data: string,
    mimeType: string,
    options?: OCROptions
  ): Promise<OCRResult>;

  /**
   * Provider configuration'ı al
   */
  getConfig(): OCRProviderConfig;

  /**
   * Maliyet hesapla
   */
  estimateCost(fileSize: number, pageCount?: number): Promise<number>;
}
