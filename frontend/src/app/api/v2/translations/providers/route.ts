import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Translation providers configuration
    const providers = {
      google: {
        name: 'Google Translate',
        hasApiKey: !!process.env.GOOGLE_TRANSLATE_API_KEY,
        costPerChar: 0.00002,
        model: null,
        supportedLanguages: ['tr', 'en', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'zh', 'ja', 'ko', 'el', 'th', 'ar']
      },
      deepl: {
        name: 'DeepL',
        hasApiKey: !!process.env.DEEPL_API_KEY,
        costPerChar: 0.000006,
        model: null,
        supportedLanguages: ['tr', 'en', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'zh', 'ja', 'el', 'th']
      },
      openai: {
        name: 'OpenAI',
        hasApiKey: !!process.env.OPENAI_API_KEY,
        costPerToken: 0.000002,
        model: 'gpt-3.5-turbo',
        supportedLanguages: ['tr', 'en', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'zh', 'ja', 'ko', 'el', 'th', 'ar']
      }
    };

    return NextResponse.json({
      success: true,
      providers
    });
  } catch (error) {
    console.error('Error getting translation providers:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}