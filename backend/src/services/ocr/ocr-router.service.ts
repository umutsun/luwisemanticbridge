/**
 * OCR Router Service
 * Akıllı provider seçimi, fallback chain ve cache yönetimi
 *
 * Özellikler:
 * - Settings'den active OCR model seçimi
 * - Otomatik fallback chain (primary → fallback → tesseract)
 * - Redis cache entegrasyonu
 * - Maliyet tracking
 * - Provider health monitoring
 */

import { IOCRProvider, OCRResult, OCROptions, OCRProviderType, OCRProviderConfig } from './types';
import { OpenAIProvider } from './providers/openai.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { DeepSeekProvider } from './providers/deepseek.provider';
import { ocrService } from '../ocr.service';
import { ocrCacheService } from './ocr-cache.service';
import { settingsService } from '../settings.service';
import { logger } from '../../utils/logger';
import fs from 'fs/promises';
import path from 'path';

interface OCRSettings {
  activeProvider: OCRProviderType;
  fallbackEnabled: boolean;
  fallbackProvider: OCRProviderType;
  cacheEnabled: boolean;
  cacheTTL: number;
}

export class OCRRouterService {
  private static instance: OCRRouterService;
  private providers: Map<OCRProviderType, IOCRProvider> = new Map();
  private defaultFallbackChain: OCRProviderType[] = [
    'gemini',     // En ucuz ve hızlı
    'openai',     // En güvenilir
    'deepseek',   // Yenilikçi
    'tesseract'   // Son çare (ücretsiz)
  ];

  private constructor() {
    this.initializeProviders();
  }

  public static getInstance(): OCRRouterService {
    if (!OCRRouterService.instance) {
      OCRRouterService.instance = new OCRRouterService();
    }
    return OCRRouterService.instance;
  }

  /**
   * Provider'ları initialize et
   */
  private async initializeProviders(): Promise<void> {
    try {
      // OpenAI
      this.providers.set('openai', new OpenAIProvider({
        enabled: true,
        supportedFormats: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      }));

      // Gemini
      this.providers.set('gemini', new GeminiProvider({
        enabled: true,
        model: 'gemini-2.0-flash-exp',
        supportedFormats: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
      }));

      // DeepSeek
      this.providers.set('deepseek', new DeepSeekProvider({
        enabled: true,
        supportedFormats: ['image/jpeg', 'image/png', 'image/webp']
      }));

      logger.info('✅ OCR Router - Tüm provider\'lar initialize edildi');
    } catch (error) {
      logger.error('❌ OCR Router - Provider initialization hatası:', error);
    }
  }

  /**
   * Settings'den OCR ayarlarını al
   */
  private async getOCRSettings(): Promise<OCRSettings> {
    try {
      const settings = await settingsService.getAllSettings();

      return {
        activeProvider: (settings.ocr_active_provider as OCRProviderType) || 'auto',
        fallbackEnabled: settings.ocr_fallback_enabled !== false, // Default true
        fallbackProvider: (settings.ocr_fallback_provider as OCRProviderType) || 'tesseract',
        cacheEnabled: settings.ocr_cache_enabled !== false, // Default true
        cacheTTL: settings.ocr_cache_ttl || 7 * 24 * 60 * 60 // 7 gün
      };
    } catch (error) {
      logger.warn('Settings okunamadı, default değerler kullanılıyor');
      return {
        activeProvider: 'auto',
        fallbackEnabled: true,
        fallbackProvider: 'tesseract',
        cacheEnabled: true,
        cacheTTL: 7 * 24 * 60 * 60
      };
    }
  }

  /**
   * Ana OCR işleme fonksiyonu
   */
  async processDocument(
    filePath: string,
    options: OCROptions = {}
  ): Promise<OCRResult> {
    const startTime = Date.now();

    try {
      // Settings'den ayarları al
      const settings = await this.getOCRSettings();

      // Dosya hash'i hesapla (cache key için)
      const fileBuffer = await fs.readFile(filePath);
      const fileHash = ocrCacheService.calculateFileHash(fileBuffer);

      // Provider seçimi
      const selectedProvider = options.provider || settings.activeProvider;
      const provider = await this.selectProvider(selectedProvider, filePath);

      logger.info(`📄 OCR başlatılıyor: ${path.basename(filePath)} (Provider: ${provider})`);

      // Cache kontrolü
      if (settings.cacheEnabled) {
        const cached = await ocrCacheService.get(fileHash, provider, options.prompt);

        if (cached) {
          await ocrCacheService.recordHit();
          logger.info(`⚡ Cache HIT - OCR atlandı (${Date.now() - startTime}ms)`);
          return cached;
        }

        await ocrCacheService.recordMiss();
      }

      // OCR işleme (fallback chain ile)
      const result = await this.processWithFallback(
        filePath,
        provider,
        options,
        settings
      );

      // Cache'e kaydet
      if (settings.cacheEnabled && result) {
        await ocrCacheService.set(
          fileHash,
          provider,
          result,
          options.prompt,
          settings.cacheTTL
        );
      }

      logger.info(`✅ OCR tamamlandı (${Date.now() - startTime}ms)`);
      return result;

    } catch (error) {
      logger.error('❌ OCR Router hatası:', error);
      throw error;
    }
  }

  /**
   * Fallback chain ile OCR işleme
   */
  private async processWithFallback(
    filePath: string,
    primaryProvider: OCRProviderType,
    options: OCROptions,
    settings: OCRSettings
  ): Promise<OCRResult> {
    // Fallback chain oluştur
    const chain: OCRProviderType[] = [primaryProvider];

    if (settings.fallbackEnabled) {
      // Fallback provider'ı ekle (primary ile aynı değilse)
      if (settings.fallbackProvider !== primaryProvider) {
        chain.push(settings.fallbackProvider);
      }

      // Son çare olarak tesseract ekle
      if (!chain.includes('tesseract')) {
        chain.push('tesseract');
      }
    }

    logger.debug(`OCR Fallback Chain: ${chain.join(' → ')}`);

    // Chain'i sırayla dene
    let lastError: Error | null = null;

    for (const providerName of chain) {
      try {
        const result = await this.executeOCR(filePath, providerName, options);

        // Fallback kullanıldıysa metadata'ya ekle
        if (providerName !== primaryProvider) {
          result.metadata.fallbackUsed = true;
          result.metadata.primaryProvider = primaryProvider;
          logger.warn(`⚠️ Fallback kullanıldı: ${primaryProvider} → ${providerName}`);
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        logger.error(`Provider ${providerName} başarısız:`, error.message);

        // Fallback zincirinde devam et
        continue;
      }
    }

    // Tüm provider'lar başarısız oldu
    throw new Error(`Tüm OCR provider'ları başarısız oldu. Son hata: ${lastError?.message}`);
  }

  /**
   * Belirli bir provider ile OCR yap
   */
  private async executeOCR(
    filePath: string,
    providerName: OCRProviderType,
    options: OCROptions
  ): Promise<OCRResult> {
    const ext = path.extname(filePath).toLowerCase();

    // Tesseract için özel işlem (mevcut OCRService)
    if (providerName === 'tesseract') {
      const tesseractResult = await ocrService.processDocument(filePath, ext);

      return {
        text: tesseractResult.text,
        confidence: tesseractResult.confidence,
        metadata: {
          provider: 'tesseract',
          processingTimeMs: 0,
          type: tesseractResult.type
        }
      };
    }

    // Vision provider'lar
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new Error(`Provider bulunamadı: ${providerName}`);
    }

    // Provider hazır mı kontrol et
    const isReady = await provider.isReady();
    if (!isReady) {
      throw new Error(`Provider hazır değil: ${providerName}`);
    }

    // Dosya tipine göre işlem
    if (ext === '.pdf') {
      return await provider.processPDF(filePath, options);
    } else {
      return await provider.processImage(filePath, options);
    }
  }

  /**
   * Akıllı provider seçimi
   */
  private async selectProvider(
    requested: OCRProviderType,
    filePath: string
  ): Promise<OCRProviderType> {
    // Manuel seçim yapıldıysa direkt kullan
    return requested;
  }

  /**
   * Provider hazır mı kontrol et
   */
  private async isProviderReady(providerName: OCRProviderType): Promise<boolean> {
    if (providerName === 'tesseract') return true; // Tesseract her zaman hazır

    const provider = this.providers.get(providerName);
    if (!provider) return false;

    try {
      return await provider.isReady();
    } catch {
      return false;
    }
  }

  /**
   * Mevcut provider'ları ve durumlarını listele
   */
  async getAvailableProviders(): Promise<Array<{
    name: OCRProviderType;
    enabled: boolean;
    ready: boolean;
    config: OCRProviderConfig;
  }>> {
    const result: Array<any> = [];

    for (const [name, provider] of this.providers.entries()) {
      const ready = await provider.isReady();

      result.push({
        name,
        enabled: provider.enabled,
        ready,
        config: provider.getConfig()
      });
    }

    // Tesseract'i ekle
    result.push({
      name: 'tesseract',
      enabled: true,
      ready: true,
      config: {
        enabled: true,
        supportedFormats: ['.jpg', '.png', '.pdf', '.tiff'],
        costPerImage: 0
      }
    });

    return result;
  }

  /**
   * Cache istatistiklerini al
   */
  async getCacheStats() {
    return await ocrCacheService.getStats();
  }

  /**
   * Cache'i temizle
   */
  async clearCache(fileHash?: string, provider?: OCRProviderType) {
    return await ocrCacheService.clear(fileHash, provider);
  }
}

export const ocrRouterService = OCRRouterService.getInstance();
