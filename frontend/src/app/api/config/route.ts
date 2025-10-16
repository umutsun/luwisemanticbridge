import { NextResponse } from 'next/server';

// Configuration values from .env.lsemb
export async function GET() {
  try {
    // Return configuration values that are safe to expose to the frontend
    const config = {
      splashScreenType: process.env.NEXT_PUBLIC_SPLASH_SCREEN_TYPE || process.env.SPLASH_SCREEN_TYPE || 'minimal',
      loadingText: process.env.NEXT_PUBLIC_LOADING_TEXT || process.env.LOADING_TEXT || 'Loading system... semantic analysis in progress...',
      appName: process.env.NEXT_PUBLIC_APP_NAME || process.env.APP_NAME || 'Luwi Semantic Bridge',
      appDescription: process.env.NEXT_PUBLIC_APP_DESCRIPTION || process.env.APP_DESCRIPTION || 'Yapay zeka destekli anlamsal arama platformu'
    };

    return NextResponse.json(config);
  } catch (error) {
    console.error('Config API error:', error);
    return NextResponse.json(
      { error: 'Failed to load configuration' },
      { status: 500 }
    );
  }
}