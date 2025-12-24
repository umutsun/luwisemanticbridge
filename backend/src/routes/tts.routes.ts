/**
 * TTS (Text-to-Speech) Routes
 * OpenAI TTS API endpoints
 */

import { Router, Request, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.middleware';
import { ttsService } from '../services/tts/tts.service';
import { settingsService } from '../services/settings.service';

const router = Router();

/**
 * POST /api/v2/tts/synthesize
 * Convert text to speech
 */
router.post('/api/v2/tts/synthesize', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if TTS is enabled
    const enabled = await settingsService.getSetting('voiceSettings.enableVoiceOutput') === 'true';
    if (!enabled) {
      return res.status(403).json({ error: 'Voice output is not enabled' });
    }

    // Check if service is ready
    if (!ttsService.isReady()) {
      return res.status(503).json({ error: 'TTS service not available' });
    }

    const { text, voice, speed } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Get default settings
    const settings = await ttsService.getSettings();

    // Synthesize
    const result = await ttsService.synthesize({
      text: text.trim(),
      voice: voice || settings.voice,
      speed: speed !== undefined ? speed : settings.speed,
      format: 'mp3'
    });

    // Set response headers
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': result.audio.length.toString(),
      'X-TTS-Voice': result.voice,
      'X-TTS-Processing-Time': result.processingTimeMs.toString()
    });

    // Send audio buffer
    res.send(result.audio);

    console.log(`[TTS] Synthesized ${result.textLength} chars -> ${result.audio.length} bytes in ${result.processingTimeMs}ms`);

  } catch (error: any) {
    console.error('[TTS] Synthesis error:', error);
    res.status(500).json({
      error: 'TTS synthesis failed',
      details: error.message
    });
  }
});

/**
 * GET /api/v2/tts/voices
 * Get available TTS voices
 */
router.get('/api/v2/tts/voices', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const voices = ttsService.getVoices();
    const settings = await ttsService.getSettings();

    res.json({
      voices,
      defaultVoice: settings.voice,
      defaultSpeed: settings.speed
    });
  } catch (error: any) {
    console.error('[TTS] Get voices error:', error);
    res.status(500).json({ error: 'Failed to get voices' });
  }
});

/**
 * GET /api/v2/tts/health
 * TTS service health check
 */
router.get('/api/v2/tts/health', async (req: Request, res: Response) => {
  try {
    const isReady = ttsService.isReady();
    const enabled = await settingsService.getSetting('voiceSettings.enableVoiceOutput') === 'true';

    res.json({
      status: isReady ? 'healthy' : 'unhealthy',
      service: 'TTS',
      enabled,
      ready: isReady,
      provider: 'openai',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'unhealthy',
      service: 'TTS',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
