import { Router, Request, Response } from 'express';
import pool from '../config/database';

const router = Router();

// Get chatbot settings
router.get('/settings', async (req: Request, res: Response) => {
  try {
    // Get chatbot settings, app settings, AND RAG settings from main settings table
    const result = await pool.query(`
      SELECT key, value FROM settings
      WHERE key IN (
        'chatbot', 'app.name', 'app.description',
        'ragSettings.minResults', 'ragSettings.maxResults',
        'ragSettings.similarityThreshold', 'ragSettings.minSourcesToShow', 'ragSettings.maxSourcesToShow'
      )
    `);

    let chatbotData: any = {};
    let appName = '';
    let appDescription = '';

    // RAG settings
    let ragMinResults = 7;
    let ragMaxResults = 15;
    let ragSimilarityThreshold = 0.7;
    let ragMinSourcesToShow = 7;
    let ragMaxSourcesToShow = 15;

    // Parse the results
    for (const row of result.rows) {
      if (row.key === 'chatbot') {
        const rawValue = row.value;
        chatbotData = typeof rawValue === 'string' ? JSON.parse(rawValue) : (rawValue || {});
      } else if (row.key === 'app.name') {
        appName = row.value;
      } else if (row.key === 'app.description') {
        appDescription = row.value;
      } else if (row.key === 'ragSettings.minResults') {
        ragMinResults = parseInt(row.value) || 7;
      } else if (row.key === 'ragSettings.maxResults') {
        ragMaxResults = parseInt(row.value) || 15;
      } else if (row.key === 'ragSettings.similarityThreshold') {
        ragSimilarityThreshold = parseFloat(row.value) || 0.7;
      } else if (row.key === 'ragSettings.minSourcesToShow') {
        ragMinSourcesToShow = parseInt(row.value) || ragMinResults;
      } else if (row.key === 'ragSettings.maxSourcesToShow') {
        ragMaxSourcesToShow = parseInt(row.value) || ragMaxResults;
      }
    }

    // Log RAG settings for debugging
    console.log(`📊 [Chatbot] RAG: min=${ragMinResults}, max=${ragMaxResults}, threshold=${ragSimilarityThreshold}`);

    // Use app.name/description as primary, fallback to chatbot.title/subtitle, then to defaults
    const finalTitle = appName || chatbotData.title || 'Luwi Semantic Bridge';
    const finalSubtitle = appDescription || chatbotData.subtitle || 'Context Engine';

    // Simplified log - only log if title exists
    if (finalTitle) {
      console.log(` [Chatbot] ${finalTitle}`);
    }

    // Default values if not set
    // Note: maxResults/minResults are in RAG settings (ragSettings.maxResults, ragSettings.minResults)

    // IMPORTANT: Validate and clean placeholder text
    const defaultPlaceholder = 'Sorunuzu yazın...';
    let cleanPlaceholder = defaultPlaceholder;

    if (chatbotData.placeholder && typeof chatbotData.placeholder === 'string') {
      const placeholder = chatbotData.placeholder.trim();

      // Check if placeholder looks valid (reasonable length, no duplicates)
      const isDuplicated = placeholder.toLowerCase().split('sorunuzu').length > 2;
      const isReasonableLength = placeholder.length > 5 && placeholder.length < 100;
      const hasValidChars = /^[\w\sğüşıöçĞÜŞİÖÇ.,!?-]+$/.test(placeholder);

      if (!isDuplicated && isReasonableLength && hasValidChars) {
        cleanPlaceholder = placeholder;
      } else {
        console.warn(`️ Invalid placeholder detected: "${placeholder}", using default`);
      }
    }

    const defaultSettings = {
      title: finalTitle,
      subtitle: finalSubtitle,
      logoUrl: chatbotData.logoUrl || '',
      greeting: chatbotData.greeting || '',
      welcomeMessage: chatbotData.welcomeMessage || chatbotData.openingMessage || '',
      placeholder: cleanPlaceholder,
      primaryColor: chatbotData.primaryColor || '#3B82F6',
      suggestionQuestions: chatbotData.suggestionQuestions || [],
      enableSuggestions: chatbotData.enableSuggestions !== undefined ? chatbotData.enableSuggestions : true,
      autoGenerateSuggestions: chatbotData.autoGenerateSuggestions !== undefined ? chatbotData.autoGenerateSuggestions : true,
      maxResponseLength: chatbotData.maxResponseLength || 1000,
      maxQuestionLength: chatbotData.maxQuestionLength || 500,
      questionTemplate: chatbotData.questionTemplate || 'Yaptığımız konuşmaya göre, şunu da merak ediyor olabilirsiniz: {question}',
      autoGenerateQuestions: chatbotData.autoGenerateQuestions || false,
      // Chat Input Features
      enablePdfUpload: chatbotData.enablePdfUpload || false,
      enableVoiceInput: chatbotData.enableVoiceInput || false,
      enableVoiceOutput: chatbotData.enableVoiceOutput || false,
      // Source Interaction Features
      enableSourceClick: chatbotData.enableSourceClick !== undefined ? chatbotData.enableSourceClick : true,
      enableSourceQuestionGeneration: chatbotData.enableSourceQuestionGeneration !== undefined ? chatbotData.enableSourceQuestionGeneration : true,
      // Keyword Highlighting
      enableKeywordHighlighting: chatbotData.enableKeywordHighlighting !== undefined ? chatbotData.enableKeywordHighlighting : true,
      // Response Schema (dynamic format configuration)
      responseSchemaId: chatbotData.responseSchemaId || 'vergilex-article',
      // Custom response schema (if defined in database)
      responseSchema: chatbotData.responseSchema || null,
      // Add app settings for login page
      app: {
        name: finalTitle,
        description: finalSubtitle
      },
      // RAG settings for source count
      ragSettings: {
        minResults: ragMinResults,
        maxResults: ragMaxResults,
        similarityThreshold: ragSimilarityThreshold,
        minSourcesToShow: ragMinSourcesToShow,
        maxSourcesToShow: ragMaxSourcesToShow
      }
    };

    // Log removed - already logged above

    res.json(defaultSettings);
  } catch (error) {
    console.error('Error fetching chatbot settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update chatbot settings
router.post('/settings', async (req: Request, res: Response) => {
  try {
    const settings = req.body;

    // Update chatbot settings in main settings table
    await pool.query(
      `INSERT INTO settings (key, value, category, description, updated_at)
       VALUES ('chatbot', $1, 'chatbot', 'Chatbot configuration and customization', CURRENT_TIMESTAMP)
       ON CONFLICT (key)
       DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
      [JSON.stringify(settings)]
    );

    console.log(` [Chatbot] Saved: ${settings.title || 'Untitled'}`);

    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Error updating chatbot settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Reset to default settings
router.delete('/settings', async (req: Request, res: Response) => {
  try {
    await pool.query(`DELETE FROM settings WHERE key = 'chatbot'`);
    res.json({ success: true, message: 'Settings reset to default' });
  } catch (error) {
    console.error('Error resetting settings:', error);
    res.status(500).json({ error: 'Failed to reset settings' });
  }
});

export default router;