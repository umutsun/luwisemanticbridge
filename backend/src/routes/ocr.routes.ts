/**
 * OCR API Routes
 * Multi-provider OCR servisi için API endpoint'leri
 */

import express from 'express';
import multer from 'multer';
import { ocrRouterService } from '../services/ocr/ocr-router.service';
import { settingsService } from '../services/settings.service';
import { OCRProviderType, OCROptions } from '../services/ocr/types';
import { logger } from '../utils/logger';
import path from 'path';
import fs from 'fs/promises';

const router = express.Router();

// Multer konfigürasyonu - geçici dosya yükleme
const upload = multer({
  dest: 'uploads/temp-ocr/',
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/tiff',
      'image/bmp',
      'application/pdf'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Desteklenmeyen dosya tipi. Sadece görsel ve PDF dosyaları kabul edilir.'));
    }
  }
});

/**
 * POST /ocr/process
 * Görsel veya PDF dosyadan OCR işleme
 */
router.post('/process', upload.single('file'), async (req, res) => {
  let tempFilePath: string | null = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Dosya yüklenmedi'
      });
    }

    tempFilePath = req.file.path;

    // OCR options
    const options: OCROptions = {
      provider: (req.body.provider as OCRProviderType) || 'auto',
      language: req.body.language,
      prompt: req.body.prompt,
      detailLevel: req.body.detailLevel || 'high',
      maxPages: req.body.maxPages ? parseInt(req.body.maxPages) : undefined
    };

    logger.info(` OCR isteği alındı: ${req.file.originalname} (Provider: ${options.provider})`);

    // OCR işleme
    const result = await ocrRouterService.processDocument(tempFilePath, options);

    res.json({
      success: true,
      data: {
        text: result.text,
        confidence: result.confidence,
        metadata: result.metadata
      }
    });

  } catch (error: any) {
    logger.error('OCR process hatası:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    // Cleanup temp file
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath);
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  }
});

/**
 * GET /ocr/providers
 * Mevcut OCR provider'ları ve durumlarını listele
 */
router.get('/providers', async (req, res) => {
  try {
    const providers = await ocrRouterService.getAvailableProviders();

    res.json({
      success: true,
      data: providers
    });
  } catch (error: any) {
    logger.error('OCR providers listesi hatası:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /ocr/settings
 * OCR ayarlarını getir
 */
router.get('/settings', async (req, res) => {
  try {
    const settings = await settingsService.getOCRSettings();

    res.json({
      success: true,
      data: settings
    });
  } catch (error: any) {
    logger.error('OCR settings hatası:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /ocr/settings
 * OCR ayarlarını kaydet
 */
router.post('/settings', async (req, res) => {
  try {
    const { activeProvider, fallbackEnabled, fallbackProvider, cacheEnabled, cacheTTL } = req.body;

    const result = await settingsService.saveOCRSettings({
      activeProvider,
      fallbackEnabled,
      fallbackProvider,
      cacheEnabled,
      cacheTTL
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'OCR ayarları kaydedildi'
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error: any) {
    logger.error('OCR settings kaydetme hatası:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /ocr/cache/stats
 * Cache istatistiklerini getir
 */
router.get('/cache/stats', async (req, res) => {
  try {
    const stats = await ocrRouterService.getCacheStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    logger.error('OCR cache stats hatası:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /ocr/cache
 * Cache'i temizle
 */
router.delete('/cache', async (req, res) => {
  try {
    const { fileHash, provider } = req.query;

    const deletedCount = await ocrRouterService.clearCache(
      fileHash as string | undefined,
      provider as OCRProviderType | undefined
    );

    res.json({
      success: true,
      message: `${deletedCount} cache entry silindi`
    });
  } catch (error: any) {
    logger.error('OCR cache clear hatası:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /ocr/process-url
 * URL'den görsel indirip OCR işleme (opsiyonel)
 */
router.post('/process-url', async (req, res) => {
  try {
    const { imageUrl, provider, language, prompt } = req.body;

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        error: 'imageUrl gerekli'
      });
    }

    // URL'den görsel indir (axios ile)
    const axios = require('axios');
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });

    const tempFilePath = path.join('uploads/temp-ocr/', `url-${Date.now()}.jpg`);
    await fs.writeFile(tempFilePath, response.data);

    try {
      const options: OCROptions = {
        provider: provider || 'auto',
        language,
        prompt
      };

      const result = await ocrRouterService.processDocument(tempFilePath, options);

      res.json({
        success: true,
        data: {
          text: result.text,
          confidence: result.confidence,
          metadata: result.metadata
        }
      });
    } finally {
      // Cleanup
      await fs.unlink(tempFilePath).catch(() => {});
    }
  } catch (error: any) {
    logger.error('OCR process-url hatası:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
