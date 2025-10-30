/**
 * Whisper Speech-to-Text API Routes
 * Provides REST API endpoints for audio transcription
 */

import express, { Request, Response } from 'express';
import multer from 'multer';
import { whisperIntegrationService } from '../services/whisper-integration.service';

const router = express.Router();

// Configure multer for memory storage (files stored in RAM)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB max (Whisper limit)
  },
  fileFilter: (req, file, cb) => {
    // Accept audio files
    const allowedMimes = [
      'audio/webm',
      'audio/wav',
      'audio/mp3',
      'audio/mpeg',
      'audio/ogg',
      'audio/flac',
      'audio/m4a',
    ];

    if (allowedMimes.includes(file.mimetype) || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio files are allowed.'));
    }
  },
});

/**
 * POST /api/whisper/transcribe
 * Transcribe audio file to text
 */
router.post('/transcribe', upload.single('audio'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No audio file provided'
      });
    }

    const {
      language = 'tr',
      model = 'base',
      task = 'transcribe',
      temperature,
      initialPrompt
    } = req.body;

    console.log(`[Whisper API] Transcribe request: ${req.file.size} bytes, language=${language}`);

    const result = await whisperIntegrationService.transcribe(req.file.buffer, {
      language,
      model,
      task,
      temperature: temperature ? parseFloat(temperature) : undefined,
      initialPrompt,
      withTimestamps: false
    });

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('[Whisper API] Transcription error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Transcription failed',
      text: ''
    });
  }
});

/**
 * POST /api/whisper/transcribe-with-timestamps
 * Transcribe audio with word-level timestamps
 */
router.post('/transcribe-with-timestamps', upload.single('audio'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No audio file provided'
      });
    }

    const { language = 'tr', model = 'base' } = req.body;

    console.log(`[Whisper API] Timestamp transcribe: ${req.file.size} bytes`);

    const result = await whisperIntegrationService.transcribeWithTimestamps(
      req.file.buffer,
      language,
      model
    );

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('[Whisper API] Timestamp transcription error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Transcription failed',
      text: '',
      segments: []
    });
  }
});

/**
 * GET /api/whisper/health
 * Check Whisper service health
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const isHealthy = await whisperIntegrationService.checkHealth();

    res.json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      service: 'whisper',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/whisper/languages
 * Get supported languages
 */
router.get('/languages', async (req: Request, res: Response) => {
  try {
    const languages = await whisperIntegrationService.getSupportedLanguages();

    res.json({
      success: true,
      languages
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch languages'
    });
  }
});

/**
 * GET /api/whisper/model-info
 * Get Whisper model information
 */
router.get('/model-info', async (req: Request, res: Response) => {
  try {
    const { model = 'base' } = req.query;

    const info = await whisperIntegrationService.getModelInfo(model as string);

    if (!info) {
      return res.status(404).json({
        success: false,
        error: 'Model not found'
      });
    }

    res.json({
      success: true,
      ...info
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch model info'
    });
  }
});

export default router;
