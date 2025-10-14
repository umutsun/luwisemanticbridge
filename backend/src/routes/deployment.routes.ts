import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const router = Router();

// Read .env.lsemb file and check if setup is needed
router.post('/read-env', async (req: Request, res: Response) => {
  try {
    const envFile = path.join(process.cwd(), '.env.lsemb');

    if (!fs.existsSync(envFile)) {
      return res.json({
        exists: false,
        message: '.env.lsemb file not found. Please create it first.',
        required: ['POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_HOST']
      });
    }

    const envContent = fs.readFileSync(envFile, 'utf8');
    const envVars: any = {};

    // Parse all environment variables
    envContent.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && !key.startsWith('#')) {
        envVars[key.trim()] = valueParts.join('=').trim();
      }
    });

    // Check required variables
    const required = ['POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_HOST'];
    const missing = required.filter(key => !envVars[key] || envVars[key].includes('your_'));

    if (missing.length > 0) {
      return res.json({
        exists: true,
        configured: false,
        envVars,
        missing,
        message: `Please configure these variables: ${missing.join(', ')}`
      });
    }

    res.json({
      exists: true,
      configured: true,
      envVars,
      message: 'Environment configured successfully'
    });
  } catch (error: any) {
    console.error('Environment read error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Initialize deployment with all steps
router.post('/initialize', async (req: Request, res: Response) => {
  try {
    const { envVars, admin, llmProvider, llmApiKey } = req.body;

    // Step 1: Create/update environment files
    await createEnvironmentFiles(envVars);

    // Step 2: Create database if not exists
    const dbPool = new Pool({
      host: envVars.POSTGRES_HOST,
      port: parseInt(envVars.POSTGRES_PORT) || 5432,
      user: envVars.POSTGRES_USER,
      password: envVars.POSTGRES_PASSWORD,
      database: 'postgres' // Connect to default database first
    });

    // Create database if not exists
    await dbPool.query(`CREATE DATABASE "${envVars.POSTGRES_DB}"`);
    await dbPool.end();

    // Step 3: Create tables and initialize schema
    const asembPool = new Pool({
      host: envVars.POSTGRES_HOST,
      port: parseInt(envVars.POSTGRES_PORT) || 5432,
      user: envVars.POSTGRES_USER,
      password: envVars.POSTGRES_PASSWORD,
      database: envVars.POSTGRES_DB
    });

    // Run setup scripts
    await runSetupScripts(asembPool);

    // Step 4: Initialize default settings
    await initializeDefaultSettings(asembPool, envVars, llmProvider, llmApiKey);

    // Step 5: Create admin user
    const hashedPassword = await bcrypt.hash(admin.password, 10);
    await asembPool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (email) DO NOTHING`,
      [admin.email, hashedPassword, admin.firstName, admin.lastName, 'admin', true]
    );

    await asembPool.end();

    res.json({
      success: true,
      message: 'Deployment initialized successfully',
      redirect: '/login'
    });
  } catch (error: any) {
    console.error('Deployment initialization error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Validate LLM API key
router.post('/validate-llm', async (req: Request, res: Response) => {
  try {
    const { provider, apiKey } = req.body;

    if (!apiKey) {
      return res.json({ valid: false, error: 'API key is required' });
    }

    let isValid = false;
    let error = '';

    if (provider === 'openai') {
      // Test OpenAI API
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      isValid = response.ok;
      if (!isValid) error = 'Invalid OpenAI API key';
    } else if (provider === 'claude') {
      // Test Anthropic API
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }]
        })
      });
      isValid = response.ok;
      if (!isValid) error = 'Invalid Anthropic API key';
    } else if (provider === 'gemini') {
      // Test Google Gemini API
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      isValid = response.ok;
      if (!isValid) error = 'Invalid Gemini API key';
    }

    res.json({ valid: isValid, error });
  } catch (error: any) {
    res.json({ valid: false, error: error.message });
  }
});

// Check if admin exists
router.get('/check-admin', async (req: Request, res: Response) => {
  try {
    const envFile = path.join(process.cwd(), '.env.lsemb');

    if (!fs.existsSync(envFile)) {
      return res.json({ adminExists: false, databaseConnected: false, envConfigured: false });
    }

    const envContent = fs.readFileSync(envFile, 'utf8');
    const envVars: any = {};

    envContent.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && !key.startsWith('#')) {
        envVars[key.trim()] = valueParts.join('=').trim();
      }
    });

    if (!envVars.POSTGRES_DB || !envVars.POSTGRES_USER || !envVars.POSTGRES_PASSWORD) {
      return res.json({ adminExists: false, databaseConnected: false, envConfigured: false });
    }

    const asembPool = new Pool({
      host: envVars.POSTGRES_HOST,
      port: parseInt(envVars.POSTGRES_PORT) || 5432,
      user: envVars.POSTGRES_USER,
      password: envVars.POSTGRES_PASSWORD,
      database: envVars.POSTGRES_DB
    });

    const result = await asembPool.query(
      'SELECT id, email, first_name FROM users WHERE role = $1 LIMIT 1',
      ['admin']
    );

    await asembPool.end();

    res.json({
      adminExists: result.rows.length > 0,
      admin: result.rows[0] || null,
      databaseConnected: true,
      envConfigured: true
    });
  } catch (error: any) {
    // If database is not connected, return false
    if (error.code === 'ECONNREFUSED' || error.code === '3D000') {
      res.json({ adminExists: false, admin: null, databaseConnected: false, envConfigured: true });
    } else {
      res.json({ adminExists: false, admin: null, databaseConnected: false, envConfigured: false });
    }
  }
});

// Helper functions
async function createEnvironmentFiles(envVars: any) {
  const envFile = path.join(process.cwd(), '.env.lsemb');
  let envContent = '';

  // Read existing content
  if (fs.existsSync(envFile)) {
    envContent = fs.readFileSync(envFile, 'utf8');
  }

  // Update variables
  Object.entries(envVars).forEach(([key, value]) => {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
  });

  fs.writeFileSync(envFile, envContent);

  // Also update .env file for the application
  const appEnvFile = path.join(process.cwd(), '.env');
  let appEnvContent = '';

  if (fs.existsSync(appEnvFile)) {
    appEnvContent = fs.readFileSync(appEnvFile, 'utf8');
  }

  // Copy essential variables
  ['POSTGRES_HOST', 'POSTGRES_PORT', 'POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD'].forEach(key => {
    if (envVars[key]) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(appEnvContent)) {
        appEnvContent = appEnvContent.replace(regex, `${key}=${envVars[key]}`);
      } else {
        appEnvContent += `\n${key}=${envVars[key]}`;
      }
    }
  });

  fs.writeFileSync(appEnvFile, appEnvContent);
}

async function runSetupScripts(pool: Pool) {
  // Create users table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      role VARCHAR(50) DEFAULT 'user',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Create settings table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id SERIAL PRIMARY KEY,
      key VARCHAR(255) UNIQUE NOT NULL,
      value TEXT,
      category VARCHAR(100),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Create other necessary tables...
  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255),
      content TEXT,
      file_path VARCHAR(500),
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS embeddings (
      id SERIAL PRIMARY KEY,
      document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
      chunk_text TEXT NOT NULL,
      embedding vector(1536),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Enable pgvector extension
  await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
}

async function initializeDefaultSettings(pool: Pool, envVars: any, llmProvider: string, llmApiKey: string) {
  const defaultSettings = [
    // App settings
    ['app.name', envVars.SITE_TITLE || 'Luwi Semantic Bridge', 'app'],
    ['app.description', envVars.SITE_DESCRIPTION || 'AI-Powered Knowledge Management System', 'app'],
    ['app.version', '1.0.0', 'app'],
    ['app.locale', 'tr', 'app'],

    // Database settings
    ['database.host', envVars.POSTGRES_HOST, 'database'],
    ['database.port', envVars.POSTGRES_PORT, 'database'],
    ['database.name', envVars.POSTGRES_DB, 'database'],
    ['database.user', envVars.POSTGRES_USER, 'database'],

    // LLM settings based on provider
    ...(llmProvider === 'openai' ? [
      ['openai.api_key', llmApiKey, 'llm'],
      ['llm.active_provider', 'openai', 'llm'],
      ['llm.active_model', 'gpt-4-turbo-preview', 'llm']
    ] : llmProvider === 'claude' ? [
      ['anthropic.api_key', llmApiKey, 'llm'],
      ['llm.active_provider', 'claude', 'llm'],
      ['llm.active_model', 'claude-3-5-sonnet-20241022', 'llm']
    ] : [
      ['gemini.api_key', llmApiKey, 'llm'],
      ['llm.active_provider', 'gemini', 'llm'],
      ['llm.active_model', 'gemini-pro', 'llm']
    ])
  ];

  for (const [key, value, category] of defaultSettings) {
    await pool.query(
      `INSERT INTO settings (key, value, category) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, value, category]
    );
  }
}

export default router;