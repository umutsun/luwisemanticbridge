import { Router, Request, Response } from 'express';
import { LLMManager } from '../services/llm-manager.service';
import { lsembPool } from '../config/database.config';
import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = Router();
const llmManager = LLMManager.getInstance();

// Model pricing per 1M tokens (input/output) in USD
// NOTE: Claude 3.5 Sonnet was RETIRED by Anthropic on October 28, 2025
const MODEL_PRICING: Record<string, Record<string, { input: number; output: number }>> = {
  anthropic: {
    'claude-sonnet-4-5-20250929': { input: 3, output: 15 },  // Claude Sonnet 4.5
    'claude-opus-4-20250514': { input: 15, output: 75 },     // Claude Opus 4
    'claude-3-5-sonnet-20241022': { input: 3, output: 15 },  // RETIRED - kept for backwards compat
    'claude-3-opus-20240229': { input: 15, output: 75 },     // RETIRED
    'claude-3-sonnet-20240229': { input: 3, output: 15 },    // RETIRED
    'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
  },
  openai: {
    'gpt-4o': { input: 2.5, output: 10 },
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    'gpt-4': { input: 30, output: 60 },
    'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  },
  google: {
    'gemini-2.0-flash-exp': { input: 0.1, output: 0.4 },
    'gemini-1.5-flash': { input: 0.075, output: 0.3 },
    'gemini-1.5-pro': { input: 1.25, output: 5 },
    'gemini-pro': { input: 0.5, output: 1.5 },
  },
  deepseek: {
    'deepseek-chat': { input: 0.14, output: 0.28 },
    'deepseek-coder': { input: 0.14, output: 0.28 },
  },
  grok: {
    'grok-beta': { input: 5, output: 15 },
    'grok-vision-beta': { input: 5, output: 15 },
  },
  voyage: {
    'voyage-3': { input: 0.06, output: 0 },
    'voyage-3-lite': { input: 0.02, output: 0 },
    'voyage-code-3': { input: 0.06, output: 0 },
    'voyage-finance-2': { input: 0.12, output: 0 },
    'voyage-law-2': { input: 0.12, output: 0 },
  },
  cohere: {
    'embed-multilingual-v3.0': { input: 0.10, output: 0 },
    'embed-english-v3.0': { input: 0.10, output: 0 },
    'embed-multilingual-light-v3.0': { input: 0.10, output: 0 },
    'embed-english-light-v3.0': { input: 0.10, output: 0 },
  },
  jina: {
    'jina-reranker-v2-base-multilingual': { input: 0.02, output: 0 },
    'jina-reranker-v1-base-en': { input: 0.02, output: 0 },
    'jina-colbert-v2': { input: 0.02, output: 0 },
  }
};

// Calculate cost based on token usage and model pricing
function calculateCost(provider: string, model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[provider]?.[model];
  if (!pricing) return 0;

  const inputCost = (inputTokens / 1000000) * pricing.input;
  const outputCost = (outputTokens / 1000000) * pricing.output;
  return inputCost + outputCost;
}

// Test API key for specific provider
router.post('/test/:provider', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    const { apiKey, model } = req.body;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'API key is required'
      });
    }

    const startTime = Date.now();
    let testResult: any = {};

    switch (provider) {
      case 'openai':
        try {
          console.log(`Testing OpenAI with model: ${model || 'gpt-4o-mini'}`);
          const openai = new OpenAI({ apiKey });

          // Test with models list first
          const modelsResponse = await openai.models.list();
          console.log('OpenAI models list retrieved successfully');

          const testModel = model || 'gpt-4o-mini';

          // Test with a simple chat completion
          const chatResponse = await openai.chat.completions.create({
            model: testModel,
            messages: [{ role: 'user', content: 'Test message' }],
            max_tokens: 5
          });

          const responseTime = Date.now() - startTime;
          console.log('OpenAI chat completion successful:', chatResponse);

          const inputTokens = chatResponse.usage?.prompt_tokens || 0;
          const outputTokens = chatResponse.usage?.completion_tokens || 0;
          const cost = calculateCost('openai', testModel, inputTokens, outputTokens);

          testResult = {
            success: true,
            model: testModel,
            responseTime,
            usage: {
              promptTokens: inputTokens,
              completionTokens: outputTokens,
              totalTokens: chatResponse.usage?.total_tokens || 0
            },
            cost,
            message: 'API connection successful'
          };
        } catch (error: any) {
          console.error('OpenAI API validation error:', error);

          // Provide more specific error messages
          let errorMessage = error.message || 'OpenAI API validation failed';

          if (error.message?.includes('API key')) {
            errorMessage = 'Invalid OpenAI API key. Please check your API key.';
          } else if (error.message?.includes('quota')) {
            errorMessage = 'OpenAI API quota exceeded. Please check your billing.';
          } else if (error.message?.includes('model')) {
            errorMessage = 'OpenAI model not available. Using fallback model.';
          } else if (error.message?.includes('401')) {
            errorMessage = 'Invalid OpenAI API key format or authentication failed.';
          }

          testResult = {
            success: false,
            error: errorMessage,
            type: error.type || 'openai_api_error',
            details: {
              code: error.status,
              status: error.statusText
            }
          };
        }
        break;

      case 'anthropic':
        try {
          const anthropic = new Anthropic({ apiKey });
          // NOTE: Claude 3.5 Sonnet RETIRED Oct 28, 2025 - use Claude Sonnet 4.5
          const testModel = model || 'claude-sonnet-4-5-20250929';

          const response = await anthropic.messages.create({
            model: testModel,
            max_tokens: 5,
            messages: [{ role: 'user', content: 'Test message' }]
          });

          const responseTime = Date.now() - startTime;
          const inputTokens = response.usage?.input_tokens || 0;
          const outputTokens = response.usage?.output_tokens || 0;
          const cost = calculateCost('anthropic', testModel, inputTokens, outputTokens);

          testResult = {
            success: true,
            model: testModel,
            responseTime,
            usage: {
              inputTokens,
              outputTokens
            },
            cost,
            message: 'API connection successful'
          };
        } catch (error: any) {
          testResult = {
            success: false,
            error: error.message || 'Anthropic API validation failed',
            type: error.type || 'unknown'
          };
        }
        break;

      case 'google':
        try {
          console.log(` Google AI validation starting with API key: ${apiKey?.substring(0, 10)}...`);

          // Validate API key format
          if (!apiKey || !apiKey.startsWith('AIza')) {
            throw new Error('Invalid Google AI API key format. Key should start with "AIza". Get your key from https://aistudio.google.com/apikey');
          }

          const genAI = new GoogleGenerativeAI(apiKey);

          // Try different model names in order of preference (updated for 2025)
          const modelNames = [
            'gemini-2.0-flash-exp',
            'gemini-1.5-flash',
            'gemini-1.5-pro',
            'gemini-pro'
          ];

          const testModel = model || modelNames[0];
          console.log(` Testing Google AI with model: ${testModel}`);

          const modelInstance = genAI.getGenerativeModel({ model: testModel });
          console.log(' Model instance created, sending test message...');

          const response = await modelInstance.generateContent('Hello, this is a test message.');

          console.log(' Google AI response received');
          const responseTime = Date.now() - startTime;

          // Try to get usage info if available
          const usage = response.response?.usageMetadata ? {
            promptTokenCount: response.response.usageMetadata.promptTokenCount || 0,
            candidatesTokenCount: response.response.usageMetadata.candidatesTokenCount || 0,
            totalTokenCount: response.response.usageMetadata.totalTokenCount || 0
          } : {
            promptTokenCount: 0,
            candidatesTokenCount: 0,
            totalTokenCount: 1 // At least 1 token was used
          };

          const cost = calculateCost('google', testModel, usage.promptTokenCount, usage.candidatesTokenCount);

          testResult = {
            success: true,
            model: testModel,
            responseTime,
            usage: {
              inputTokens: usage.promptTokenCount,
              outputTokens: usage.candidatesTokenCount,
              totalTokens: usage.totalTokenCount
            },
            cost,
            message: 'API connection successful'
          };
        } catch (error: any) {
          console.error('Google AI API validation error:', error);

          // Provide more specific error messages
          let errorMessage = error.message || 'Google AI API validation failed';

          if (error.message?.includes('API key') || error.message?.includes('API_KEY_INVALID')) {
            errorMessage = 'Invalid Google AI API key. Get a valid key from https://aistudio.google.com/apikey';
          } else if (error.message?.includes('quota') || error.message?.includes('RESOURCE_EXHAUSTED')) {
            errorMessage = 'Google AI API quota exceeded. Please check your billing or wait.';
          } else if (error.message?.includes('not found') || error.message?.includes('NOT_FOUND')) {
            errorMessage = 'Google AI model not found. Try gemini-1.5-flash or gemini-pro.';
          } else if (error.message?.includes('permission') || error.message?.includes('PERMISSION_DENIED')) {
            errorMessage = 'Permission denied. Enable Generative Language API in Google Cloud Console.';
          } else if (error.message?.includes('AIza')) {
            errorMessage = error.message; // Pass through our custom format validation error
          }

          testResult = {
            success: false,
            error: errorMessage,
            type: error.type || 'google_api_error',
            details: {
              code: error.status,
              status: error.statusText,
              originalError: error.message
            }
          };
        }
        break;

      case 'deepseek':
        try {
          const deepseek = new OpenAI({
            apiKey,
            baseURL: 'https://api.deepseek.com'
          });

          const testModel = model || 'deepseek-chat';

          const response = await deepseek.chat.completions.create({
            model: testModel,
            messages: [{ role: 'user', content: 'Test' }],
            max_tokens: 5
          });

          const responseTime = Date.now() - startTime;

          const inputTokens = response.usage?.prompt_tokens || 0;
          const outputTokens = response.usage?.completion_tokens || 0;
          const cost = calculateCost('deepseek', testModel, inputTokens, outputTokens);

          testResult = {
            success: true,
            model: testModel,
            responseTime,
            usage: {
              promptTokens: inputTokens,
              completionTokens: outputTokens,
              totalTokens: response.usage?.total_tokens || 0
            },
            cost,
            message: 'API connection successful'
          };
        } catch (error: any) {
          testResult = {
            success: false,
            error: error.message || 'DeepSeek API validation failed',
            type: error.type || 'unknown'
          };
        }
        break;

      case 'grok':
      case 'xai':
        try {
          console.log(`Testing Grok/xAI with API key: ${apiKey?.substring(0, 10)}...`);

          // xAI/Grok uses OpenAI-compatible API
          const grok = new OpenAI({
            apiKey,
            baseURL: 'https://api.x.ai/v1'
          });

          const testModel = model || 'grok-beta';

          const response = await grok.chat.completions.create({
            model: testModel,
            messages: [{ role: 'user', content: 'Test' }],
            max_tokens: 5
          });

          const responseTime = Date.now() - startTime;

          const inputTokens = response.usage?.prompt_tokens || 0;
          const outputTokens = response.usage?.completion_tokens || 0;

          testResult = {
            success: true,
            model: testModel,
            responseTime,
            usage: {
              promptTokens: inputTokens,
              completionTokens: outputTokens,
              totalTokens: response.usage?.total_tokens || 0
            },
            cost: 0, // xAI pricing not yet public
            message: 'Grok/xAI API connection successful'
          };
        } catch (error: any) {
          console.error('Grok/xAI API validation error:', error);
          testResult = {
            success: false,
            error: error.message || 'Grok/xAI API validation failed',
            type: error.type || 'xai_api_error'
          };
        }
        break;

      case 'deepl':
        try {
          console.log(`Testing DeepL API with key format: ${apiKey ? apiKey.substring(0, 10) + '...' : 'none'}`);

          // Determine which endpoint to use based on model/plan
          const isProPlan = model === 'deepl-pro' || false;
          const deeplEndpoint = isProPlan ?
            'https://api.deepl.com/v2/translate' :
            'https://api-free.deepl.com/v2/translate';

          console.log(`Using DeepL endpoint: ${deeplEndpoint}`);

          // Test with usage API first (more reliable for validation)
          const usageResponse = await fetch(`${deeplEndpoint.replace('/translate', '/usage')}`, {
            method: 'POST',
            headers: {
              'Authorization': `DeepL-Auth-Key ${apiKey}`,
              'Content-Type': 'application/json',
            }
          });

          let usageValid = false;
          if (usageResponse.ok) {
            const usageData = await usageResponse.json();
            usageValid = true;
            console.log('DeepL usage API successful:', usageData);
          }

          // Also test translation API
          const response = await fetch(deeplEndpoint, {
            method: 'POST',
            headers: {
              'Authorization': `DeepL-Auth-Key ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text: ['Hello'],
              target_lang: 'ES'
            })
          });

          const responseTime = Date.now() - startTime;
          console.log(`DeepL translation API response status: ${response.status}`);

          if (response.ok) {
            const data = await response.json();
            testResult = {
              success: true,
              model: model || 'deepl-free',
              responseTime,
              usage: {
                inputTokens: 1,
                outputTokens: 1,
                totalTokens: 2,
                usageChecked: usageValid
              },
              translatedText: data.translations?.[0]?.text,
              message: 'API connection successful',
              endpoint: deeplEndpoint
            };
          } else {
            const errorData = await response.json().catch(() => ({}));
            console.error('DeepL API error response:', errorData);

            // Provide more specific error messages
            let errorMessage = 'DeepL API validation failed';
            if (response.status === 403) {
              errorMessage = 'Invalid DeepL API key. Please check your API key and plan type.';
            } else if (response.status === 429) {
              errorMessage = 'DeepL API quota exceeded. Please check your usage limits.';
            } else if (response.status === 401) {
              errorMessage = 'DeepL API authentication failed. Check your API key format.';
            } else if (errorData.message) {
              errorMessage = errorData.message;
            } else if (errorData.error) {
              errorMessage = errorData.error;
            }

            throw new Error(errorMessage);
          }
        } catch (error: any) {
          console.error('DeepL API validation error:', error);
          testResult = {
            success: false,
            error: error.message || 'DeepL API validation failed',
            type: error.type || 'deepl_api_error',
            details: {
              suggestion: 'Make sure your API key is correct and matches your DeepL plan (Free vs Pro)'
            }
          };
        }
        break;

      case 'googleTranslate':
        try {
          // For Google Translate, we'll test the API with a simple translation
          const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${apiKey}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              q: 'Hello',
              target: 'es',
              format: 'text'
            })
          });

          const responseTime = Date.now() - startTime;

          if (response.ok) {
            const data = await response.json();
            testResult = {
              success: true,
              model: 'google-translate',
              responseTime,
              usage: {
                inputTokens: 1,
                outputTokens: 1,
                totalTokens: 2
              },
              translatedText: data.data?.translations?.[0]?.translatedText,
              message: 'API connection successful'
            };
          } else {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || 'Google Translate API validation failed');
          }
        } catch (error: any) {
          testResult = {
            success: false,
            error: error.message || 'Google Translate API validation failed',
            type: error.type || 'unknown'
          };
        }
        break;

      case 'huggingface':
        try {
          // For HuggingFace, we'll check if the API key can access the API
          const response = await fetch('https://api-inference.huggingface.co/models/distilbert-base-uncased', {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            method: 'POST',
            body: JSON.stringify({ inputs: 'Test' })
          });

          const responseTime = Date.now() - startTime;

          if (response.ok) {
            testResult = {
              success: true,
              model: model || 'distilbert-base-uncased',
              responseTime,
              message: 'API connection successful'
            };
          } else {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'HuggingFace API validation failed');
          }
        } catch (error: any) {
          testResult = {
            success: false,
            error: error.message || 'HuggingFace API validation failed',
            type: error.type || 'unknown'
          };
        }
        break;

      case 'openrouter':
        try {
          console.log(`Testing OpenRouter with model: ${model || 'openai/gpt-4o-mini'}`);

          // OpenRouter uses OpenAI-compatible API format
          const openrouter = new OpenAI({
            apiKey,
            baseURL: 'https://openrouter.ai/api/v1',
            defaultHeaders: {
              'HTTP-Referer': 'https://localhost:3000',
              'X-Title': 'Alice Semantic Bridge API Validation'
            }
          });

          const testModel = model || 'openai/gpt-4o-mini';

          // Test with models list first
          const modelsResponse = await openrouter.models.list();
          console.log('OpenRouter models list retrieved successfully');

          // Test with a simple chat completion
          const chatResponse = await openrouter.chat.completions.create({
            model: testModel,
            messages: [{ role: 'user', content: 'Test message' }],
            max_tokens: 5
          });

          const responseTime = Date.now() - startTime;
          console.log('OpenRouter chat completion successful:', chatResponse);

          testResult = {
            success: true,
            model: testModel,
            responseTime,
            usage: {
              promptTokens: chatResponse.usage?.prompt_tokens || 0,
              completionTokens: chatResponse.usage?.completion_tokens || 0,
              totalTokens: chatResponse.usage?.total_tokens || 0
            },
            message: 'API connection successful'
          };
        } catch (error: any) {
          console.error('OpenRouter API validation error:', error);

          // Provide more specific error messages
          let errorMessage = error.message || 'OpenRouter API validation failed';

          if (error.message?.includes('API key')) {
            errorMessage = 'Invalid OpenRouter API key. Please check your API key.';
          } else if (error.message?.includes('quota')) {
            errorMessage = 'OpenRouter API quota exceeded. Please check your billing.';
          } else if (error.message?.includes('model')) {
            errorMessage = 'OpenRouter model not available. Using fallback model.';
          } else if (error.message?.includes('401')) {
            errorMessage = 'Invalid OpenRouter API key format or authentication failed.';
          }

          testResult = {
            success: false,
            error: errorMessage,
            type: error.type || 'openrouter_api_error',
            details: {
              code: error.status,
              status: error.statusText
            }
          };
        }
        break;

      case 'voyage':
        try {
          console.log(`Testing Voyage AI with API key: ${apiKey?.substring(0, 10)}...`);

          // Voyage AI uses their own API endpoint
          const voyageResponse = await fetch('https://api.voyageai.com/v1/embeddings', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              input: ['Test message'],
              model: model || 'voyage-3'
            })
          });

          const responseTime = Date.now() - startTime;

          if (voyageResponse.ok) {
            const data = await voyageResponse.json();
            testResult = {
              success: true,
              model: model || 'voyage-3',
              responseTime,
              usage: {
                inputTokens: data.usage?.total_tokens || 1,
                outputTokens: 0,
                totalTokens: data.usage?.total_tokens || 1
              },
              message: 'API connection successful'
            };
          } else {
            const errorData = await voyageResponse.json().catch(() => ({}));
            let errorMessage = 'Voyage AI API validation failed';

            if (voyageResponse.status === 401) {
              errorMessage = 'Invalid Voyage AI API key. Get your key from https://dash.voyageai.com/';
            } else if (voyageResponse.status === 429) {
              errorMessage = 'Voyage AI API rate limit exceeded.';
            } else if (errorData.detail) {
              errorMessage = errorData.detail;
            }

            throw new Error(errorMessage);
          }
        } catch (error: any) {
          console.error('Voyage AI API validation error:', error);
          testResult = {
            success: false,
            error: error.message || 'Voyage AI API validation failed',
            type: 'voyage_api_error'
          };
        }
        break;

      case 'cohere':
        try {
          console.log(`Testing Cohere with API key: ${apiKey?.substring(0, 10)}...`);

          // Cohere API for embeddings
          const cohereResponse = await fetch('https://api.cohere.ai/v1/embed', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              texts: ['Test message'],
              model: model || 'embed-multilingual-v3.0',
              input_type: 'search_query'
            })
          });

          const responseTime = Date.now() - startTime;

          if (cohereResponse.ok) {
            const data = await cohereResponse.json();
            testResult = {
              success: true,
              model: model || 'embed-multilingual-v3.0',
              responseTime,
              usage: {
                inputTokens: data.meta?.billed_units?.input_tokens || 1,
                outputTokens: 0,
                totalTokens: data.meta?.billed_units?.input_tokens || 1
              },
              message: 'API connection successful'
            };
          } else {
            const errorData = await cohereResponse.json().catch(() => ({}));
            let errorMessage = 'Cohere API validation failed';

            if (cohereResponse.status === 401) {
              errorMessage = 'Invalid Cohere API key. Get your key from https://dashboard.cohere.com/api-keys';
            } else if (cohereResponse.status === 429) {
              errorMessage = 'Cohere API rate limit exceeded.';
            } else if (errorData.message) {
              errorMessage = errorData.message;
            }

            throw new Error(errorMessage);
          }
        } catch (error: any) {
          console.error('Cohere API validation error:', error);
          testResult = {
            success: false,
            error: error.message || 'Cohere API validation failed',
            type: 'cohere_api_error'
          };
        }
        break;

      case 'jina':
        try {
          console.log(`Testing Jina AI with API key: ${apiKey?.substring(0, 10)}...`);

          // Jina Reranker API validation
          const jinaResponse = await fetch('https://api.jina.ai/v1/rerank', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: model || 'jina-reranker-v2-base-multilingual',
              query: 'Test query',
              documents: ['Test document 1', 'Test document 2'],
              top_n: 2
            })
          });

          const responseTime = Date.now() - startTime;

          if (jinaResponse.ok) {
            const data = await jinaResponse.json();
            testResult = {
              success: true,
              model: model || 'jina-reranker-v2-base-multilingual',
              responseTime,
              usage: {
                inputTokens: data.usage?.total_tokens || 10,
                outputTokens: 0,
                totalTokens: data.usage?.total_tokens || 10
              },
              message: 'Jina Reranker API connection successful'
            };
          } else {
            const errorData = await jinaResponse.json().catch(() => ({}));
            let errorMessage = 'Jina AI API validation failed';

            if (jinaResponse.status === 401) {
              errorMessage = 'Invalid Jina API key. Get your key from https://jina.ai/';
            } else if (jinaResponse.status === 429) {
              errorMessage = 'Jina API rate limit exceeded.';
            } else if (jinaResponse.status === 402) {
              errorMessage = 'Jina API quota exhausted. Check your plan at https://jina.ai/';
            } else if (errorData.detail) {
              errorMessage = errorData.detail;
            } else if (errorData.message) {
              errorMessage = errorData.message;
            }

            throw new Error(errorMessage);
          }
        } catch (error: any) {
          console.error('Jina AI API validation error:', error);
          testResult = {
            success: false,
            error: error.message || 'Jina AI API validation failed',
            type: 'jina_api_error'
          };
        }
        break;

      default:
        return res.status(400).json({
          success: false,
          error: `Provider ${provider} not supported`
        });
    }

    // Save validation result to database
    if (testResult.success) {
      try {
        await lsembPool.query(
          'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
          [`${provider}.apiKey`, apiKey]
        );

        // Save validation status and metadata
        await lsembPool.query(
          'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
          [`${provider}.status`, 'active']
        );

        await lsembPool.query(
          'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
          [`${provider}.verifiedDate`, new Date().toISOString()]
        );

        // Save token usage info
        if (testResult.usage) {
          await lsembPool.query(
            'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
            [`lastTestTokens.provider`, provider]
          );
          await lsembPool.query(
            'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
            [`lastTestTokens.model`, testResult.model]
          );
          await lsembPool.query(
            'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
            [`lastTestTokens.total`, testResult.usage.totalTokens || testResult.usage.inputTokens + testResult.usage.outputTokens]
          );
          await lsembPool.query(
            'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
            [`lastTestTokens.testedAt`, new Date().toISOString()]
          );
        }
      } catch (dbError) {
        console.error('Failed to save API key to database:', dbError);
      }
    }

    res.json({
      success: testResult.success,
      provider,
      ...testResult,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error(`API validation error for ${req.params.provider}:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'API validation failed',
      provider: req.params.provider
    });
  }
});

// Get provider status from LLM Manager
router.get('/status', async (req: Request, res: Response) => {
  try {
    const status = await llmManager.getProviderStatus();
    res.json({
      success: true,
      providers: status,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error getting provider status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get provider status'
    });
  }
});

// Get available models for a provider
router.get('/models/:provider', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;

    const models = {
      openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
      anthropic: ['claude-sonnet-4-5-20250929', 'claude-opus-4-20250514', 'claude-haiku-4-5-20251001'],  // Claude 4.x series (3.x RETIRED)
      google: ['gemini-2.0-flash-exp', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'],
      deepseek: ['deepseek-chat', 'deepseek-coder'],
      deepl: ['deepl-free', 'deepl-pro'],
      googleTranslate: ['google-translate'],
      huggingface: ['sentence-transformers/all-MiniLM-L6-v2', 'distilbert-base-uncased', 'bert-base-uncased'],
      openrouter: ['openai/gpt-4o', 'openai/gpt-4o-mini', 'openai/gpt-4-turbo', 'anthropic/claude-3.5-sonnet', 'meta-llama/llama-3.1-8b-instruct', 'google/gemini-pro-1.5'],
      voyage: ['voyage-3', 'voyage-3-lite', 'voyage-code-3', 'voyage-finance-2', 'voyage-law-2'],
      cohere: ['embed-multilingual-v3.0', 'embed-english-v3.0', 'embed-multilingual-light-v3.0', 'embed-english-light-v3.0'],
      jina: ['jina-reranker-v2-base-multilingual', 'jina-reranker-v1-base-en', 'jina-colbert-v2']
    };

    const providerModels = models[provider as keyof typeof models] || [];

    res.json({
      success: true,
      provider,
      models: providerModels
    });
  } catch (error: any) {
    console.error(`Error getting models for ${req.params.provider}:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get models'
    });
  }
});

export default router;