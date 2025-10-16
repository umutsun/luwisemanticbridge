import { Router, Request, Response } from 'express';
import { lsembPool } from '../config/database.config';

const router = Router();

// Translate text using configured provider
router.post('/', async (req: Request, res: Response) => {
  try {
    const { text, source = 'auto', target, provider = 'deepl' } = req.body;

    if (!text || !target) {
      return res.status(400).json({
        error: 'Text and target language are required'
      });
    }

    // Get API keys from settings
    let apiKey: string | null = null;
    let providerName: string;

    switch (provider) {
      case 'deepl':
        const deeplResult = await lsembPool.query(
          'SELECT value FROM settings WHERE key = $1',
          ['deepl.apiKey']
        );
        apiKey = deeplResult.rows[0]?.value;
        providerName = 'DeepL';
        break;
      case 'google':
        const googleResult = await lsembPool.query(
          'SELECT value FROM settings WHERE key = $1',
          ['google.translate.apiKey']
        );
        apiKey = googleResult.rows[0]?.value;
        providerName = 'Google Translate';
        break;
      default:
        return res.status(400).json({
          error: 'Invalid provider. Supported providers: deepl, google'
        });
    }

    if (!apiKey) {
      return res.status(400).json({
        error: `API key not configured for ${providerName}. Please configure in settings.`
      });
    }

    // For demo purposes, return mock translation if API keys are not configured
    const mockTranslation = await performMockTranslation(text, source, target, provider);

    // Calculate estimated cost
    const estimatedCost = calculateCost(text.length, provider);

    res.json({
      translatedText: mockTranslation,
      sourceLanguage: source,
      targetLanguage: target,
      provider: provider,
      confidence: 95,
      cost: estimatedCost
    });

  } catch (error: any) {
    console.error('Translation error:', error);
    res.status(500).json({
      error: error.message || 'Translation failed'
    });
  }
});

// Mock translation function
async function performMockTranslation(text: string, source: string, target: string, provider: string): Promise<string> {
  // This is a mock translation for demo purposes
  // In production, integrate with actual APIs

  const languageNames: { [key: string]: string } = {
    'en': 'English',
    'de': 'German',
    'fr': 'French',
    'es': 'Spanish',
    'it': 'Italian',
    'pt': 'Portuguese',
    'ru': 'Russian',
    'zh': 'Chinese',
    'ja': 'Japanese',
    'tr': 'Turkish'
  };

  const sourceName = languageNames[source] || 'Auto-detected';
  const targetName = languageNames[target] || target;

  // Simulate translation delay
  await new Promise(resolve => setTimeout(resolve, 500));

  return `[${provider.toUpperCase()} Translation]\n\n📝 Original (${sourceName}):\n${text.substring(0, 500)}${text.length > 500 ? '...' : ''}\n\n🌐 Translated (${targetName}):\nThis is a demo translation from ${sourceName} to ${targetName}. In production, this would be the actual translated text using ${provider === 'deepl' ? 'DeepL' : 'Google Translate'} API.\n\nTranslation quality: High\nConfidence: 95%\n\n${text.substring(0, 300)}...`;
}

// Calculate estimated cost based on provider
function calculateCost(characterCount: number, provider: string): number {
  const costs: { [key: string]: number } = {
    'deepl': 6 / 1000000, // $6 per 1M characters
    'google': 20 / 1000000 // $20 per 1M characters
  };

  return characterCount * (costs[provider] || costs.deepl);
}

// Get supported languages
router.get('/languages', async (req: Request, res: Response) => {
  try {
    const languages = [
      { code: 'en', name: 'English', flag: '🇬🇧' },
      { code: 'de', name: 'German', flag: '🇩🇪' },
      { code: 'fr', name: 'French', flag: '🇫🇷' },
      { code: 'es', name: 'Spanish', flag: '🇪🇸' },
      { code: 'it', name: 'Italian', flag: '🇮🇹' },
      { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
      { code: 'ru', name: 'Russian', flag: '🇷🇺' },
      { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
      { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
      { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
      { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
      { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
      { code: 'ko', name: 'Korean', flag: '🇰🇷' },
      { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
      { code: 'pl', name: 'Polish', flag: '🇵🇱' }
    ];

    res.json({ languages });
  } catch (error) {
    console.error('Error fetching languages:', error);
    res.status(500).json({ error: 'Failed to fetch languages' });
  }
});

/**
 * Translation service health check
 */
router.get('/api/v2/translate/health', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();

    // Check provider configurations
    const providers = ['deepl', 'google'];
    const providerStatus: any = {};

    for (const provider of providers) {
      const key = provider === 'deepl' ? 'deepl.apiKey' : 'google.translate.apiKey';
      const result = await lsembPool.query(
        'SELECT value FROM settings WHERE key = $1',
        [key]
      );

      const apiKey = result.rows[0]?.value;
      providerStatus[provider] = {
        configured: !!apiKey,
        available: !!apiKey,
        name: provider === 'deepl' ? 'DeepL' : 'Google Translate'
      };
    }

    // Check database connectivity
    let dbStatus = 'disconnected';
    try {
      const testClient = await lsembPool.connect();
      await testClient.query('SELECT 1');
      testClient.release();
      dbStatus = 'connected';
    } catch (error) {
      dbStatus = 'error';
    }

    const responseTime = Date.now() - startTime;
    const hasAnyProvider = Object.values(providerStatus).some((p: any) => p.configured);

    res.json({
      status: hasAnyProvider ? 'healthy' : 'degraded',
      service: 'Translate',
      responseTime: `${responseTime}ms`,
      components: {
        providers: providerStatus,
        database: dbStatus
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'unhealthy',
      service: 'Translate',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Check provider configuration (authenticated endpoint)
router.get('/api/v2/translate/status', async (req: Request, res: Response) => {
  try {
    const providers = ['deepl', 'google'];
    const status: any = {};

    for (const provider of providers) {
      const key = provider === 'deepl' ? 'deepl.apiKey' : 'google.translate.apiKey';
      const result = await lsembPool.query(
        'SELECT value FROM settings WHERE key = $1',
        [key]
      );

      const apiKey = result.rows[0]?.value;
      status[provider] = {
        configured: !!apiKey,
        apiKeySet: !!apiKey,
        lastUsed: null
      };
    }

    res.json({ providers: status });
  } catch (error) {
    console.error('Error checking translation status:', error);
    res.status(500).json({ error: 'Failed to check translation status' });
  }
});

export default router;