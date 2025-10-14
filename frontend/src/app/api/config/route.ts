import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

// Correctly resolve the path to the root config directory
const configFilePath = path.resolve(process.cwd(), '..', 'config', 'config.json');

const defaultConfig = {
  app: {
    name: 'Alice Semantic Bridge',
    description: 'AI-Powered Knowledge Management System',
    version: '1.0.0',
    locale: 'tr'
  },
  database: {
    host: 'localhost',
    port: 5432,
    name: 'alice_semantic_bridge',
    user: 'postgres',
    password: 'postgres',
    ssl: false,
    maxConnections: 20,
  },
  redis: {
    host: 'localhost',
    port: 6379,
    password: '',
    db: 0,
  },
  openai: {
    apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY || '',
    model: 'gpt-4-turbo-preview',
    embeddingModel: 'text-embedding-3-small',
    maxTokens: 4096,
    temperature: 0.7,
  },
  anthropic: {
    apiKey: process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || '',
    model: 'claude-3-5-sonnet-20241022',
    maxTokens: 4096,
  },
  deepseek: {
    apiKey: process.env.NEXT_PUBLIC_DEEPSEEK_API_KEY || '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-coder',
  },
  ollama: {
    baseUrl: 'http://localhost:11434',
    model: 'llama2',
    embeddingModel: 'nomic-embed-text',
  },
  huggingface: {
    apiKey: process.env.NEXT_PUBLIC_HUGGINGFACE_API_KEY || '',
    model: 'sentence-transformers/all-MiniLM-L6-v2',
    endpoint: 'https://api-inference.huggingface.co/models/',
  },
  n8n: {
    url: 'http://localhost:5678',
    apiKey: '',
  },
  scraper: {
    timeout: 30000,
    maxConcurrency: 3,
    userAgent: 'ASB Web Scraper',
  },
  embeddings: {
    chunkSize: 1000,
    chunkOverlap: 200,
    batchSize: 10,
    provider: 'openai',
  },
  dataSource: {
    useLocalDb: true,
    localDbPercentage: 100,
    externalApiPercentage: 0,
    hybridMode: false,
    prioritySource: 'local',
  },
  llmSettings: {
    temperature: 0.1,
    topP: 0.9,
    maxTokens: 2048,
    presencePenalty: 0,
    frequencyPenalty: 0,
    ragWeight: 95,
    llmKnowledgeWeight: 5,
    streamResponse: true,
    systemPrompt: 'Sen bir RAG asistanısın. SADECE verilen context\'ten cevap ver.',
    activeChatModel: 'openai/gpt-4-turbo-preview',
    activeEmbeddingModel: 'openai/text-embedding-3-small',
    responseStyle: 'professional',
    language: 'tr',
  }
};

const isObject = (item: any) => {
  return (item && typeof item === 'object' && !Array.isArray(item));
};

const deepMerge = (target: any, source: any) => {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
};


// Helper function to read the config file
async function readConfig() {
  try {
    const fs = await import('fs/promises');
    await fs.access(configFilePath);
    const fileContent = await fs.readFile(configFilePath, 'utf-8');
    const parsedContent = fileContent ? JSON.parse(fileContent) : {};
    // Ensure the config always has all the default keys
    return deepMerge(defaultConfig, parsedContent);
  } catch (error) {
    // If the file doesn't exist or is invalid, write the default config and return it
    await writeConfig(defaultConfig);
    return defaultConfig;
  }
}

// Helper function to write to the config file
async function writeConfig(data: any) {
  try {
    const fs = await import('fs/promises');
    const dirPath = path.dirname(configFilePath);
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(configFilePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to write config file:', error);
    throw new Error('Failed to write configuration.');
  }
}

export async function GET() {
  try {
    const config = await readConfig();
    // Add loading text from environment variables
    const loadingText = process.env.LOADING_TEXT || 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';

    return NextResponse.json({
      ...config,
      loadingText
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to read configuration' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    // Read the latest config first to merge with it
    const currentConfig = await readConfig();
    const newConfig = deepMerge(currentConfig, body);
    
    await writeConfig(newConfig);
    
    return NextResponse.json({
      success: true,
      message: 'Configuration updated successfully',
      config: newConfig
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update configuration' },
      { status: 500 }
    );
  }
}
