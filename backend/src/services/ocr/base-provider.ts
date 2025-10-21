/**
 * Base OCR Provider
 * Tüm OCR provider'ların inherit edeceği abstract class
 */

import { IOCRProvider, OCRResult, OCROptions, OCRProviderConfig, OCRProviderType } from './types';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../../utils/logger';

export abstract class BaseOCRProvider implements IOCRProvider {
  abstract readonly name: OCRProviderType;
  abstract readonly enabled: boolean;

  protected config: OCRProviderConfig;
  protected startTime: number = 0;

  constructor(config: OCRProviderConfig) {
    this.config = config;
  }

  /**
   * Provider hazır mı kontrol et (override edilebilir)
   */
  async isReady(): Promise<boolean> {
    return this.enabled && !!this.config.apiKey;
  }

  /**
   * Image preprocessing - kalite artırma
   */
  protected async preprocessImage(filePath: string): Promise<{ path: string; cleanup: boolean }> {
    try {
      const image = sharp(filePath);
      const metadata = await image.metadata();

      // Eğer görsel zaten yüksek kalitedeyse preprocessing'e gerek yok
      if (metadata.width && metadata.width >= 1024 && metadata.height && metadata.height >= 1024) {
        return { path: filePath, cleanup: false };
      }

      // Optimize edilmiş görsel oluştur
      const optimizedPath = filePath.replace(/(\.[^.]+)$/, '_ocr_optimized$1');

      await image
        .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
        .normalize()
        .sharpen()
        .toFile(optimizedPath);

      return { path: optimizedPath, cleanup: true };
    } catch (error) {
      logger.warn(`Image preprocessing başarısız, orijinal görsel kullanılıyor: ${error.message}`);
      return { path: filePath, cleanup: false };
    }
  }

  /**
   * Dosyayı base64'e çevir
   */
  protected async fileToBase64(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    return buffer.toString('base64');
  }

  /**
   * Dosya hash'i hesapla (cache key için)
   */
  protected async calculateFileHash(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    return crypto.createHash('md5').update(buffer).digest('hex');
  }

  /**
   * MIME type'ı dosya uzantısından belirle
   */
  protected getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.tiff': 'image/tiff',
      '.pdf': 'application/pdf'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Görsel boyutlarını al
   */
  protected async getImageDimensions(filePath: string): Promise<{ width: number; height: number }> {
    try {
      const metadata = await sharp(filePath).metadata();
      return {
        width: metadata.width || 0,
        height: metadata.height || 0
      };
    } catch {
      return { width: 0, height: 0 };
    }
  }

  /**
   * Timer başlat
   */
  protected startTimer(): void {
    this.startTime = Date.now();
  }

  /**
   * İşlem süresini hesapla
   */
  protected getProcessingTime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Cleanup temporary files
   */
  protected async cleanup(...filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }

  // Abstract methods - her provider implement etmeli
  abstract processImage(filePath: string, options?: OCROptions): Promise<OCRResult>;
  abstract processPDF(filePath: string, options?: OCROptions): Promise<OCRResult>;
  abstract processBase64Image(base64Data: string, mimeType: string, options?: OCROptions): Promise<OCRResult>;
  abstract getConfig(): OCRProviderConfig;
  abstract estimateCost(fileSize: number, pageCount?: number): Promise<number>;
}
