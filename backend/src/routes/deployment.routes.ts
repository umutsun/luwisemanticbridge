import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { asembPool } from '../config/database.config';
import bcrypt from 'bcryptjs';

const router = Router();

// Environment file management endpoint
router.post('/env-update', async (req: Request, res: Response) => {
  try {
    const { envVars } = req.body;
    const envFile = path.join(process.cwd(), '.env.lsemb');
    let envContent = '';

    // Read existing .env.lsemb or create new
    if (fs.existsSync(envFile)) {
      envContent = fs.readFileSync(envFile, 'utf8');
    }

    // Update environment variables
    Object.entries(envVars).forEach(([key, value]: [string, string]) => {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        envContent += `\n${key}=${value}`;
      }
    });

    // Write updated .env file
    fs.writeFileSync(envFile, envContent);

    res.json({ success: true, message: 'Environment variables updated' });
  } catch (error: any) {
    console.error('Environment update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get current environment variables (without sensitive data)
router.get('/env-current', async (req: Request, res: Response) => {
  try {
    const envFile = path.join(process.cwd(), '.env.lsemb');

    if (!fs.existsSync(envFile)) {
      return res.json({
        exists: false,
        vars: {
          POSTGRES_HOST: 'localhost',
          POSTGRES_PORT: '5432',
          POSTGRES_DB: '',
          POSTGRES_USER: '',
          SITE_TITLE: 'Luwi Semantic Bridge',
          SITE_DESCRIPTION: 'AI-Powered Knowledge Management System'
        }
      });
    }

    const envContent = fs.readFileSync(envFile, 'utf8');
    const vars: any = {};

    // Parse environment variables (excluding passwords and API keys)
    envContent.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && !key.includes('PASSWORD') && !key.includes('API_KEY')) {
        vars[key] = valueParts.join('=');
      }
    });

    res.json({ exists: true, vars });
  } catch (error: any) {
    console.error('Environment read error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Initialize default settings
router.post('/init-defaults', async (req: Request, res: Response) => {
  try {
    const { settings } = req.body;

    // Initialize default settings in database
    const defaultSettings = {
      app: {
        name: settings.SITE_TITLE || 'Luwi Semantic Bridge',
        description: settings.SITE_DESCRIPTION || 'AI-Powered Knowledge Management System',
        version: '1.0.0',
        locale: 'tr'
      },
      database: {
        host: settings.POSTGRES_HOST || 'localhost',
        port: parseInt(settings.POSTGRES_PORT) || 5432,
        name: settings.POSTGRES_DB || '',
        user: settings.POSTGRES_USER || '',
        ssl: false,
        maxConnections: 20
      },
      openai: {
        apiKey: settings.OPENAI_API_KEY || '',
        model: 'gpt-4-turbo-preview',
        embeddingModel: 'text-embedding-3-small',
        maxTokens: 4096,
        temperature: 0.7
      },
      anthropic: {
        apiKey: settings.ANTHROPIC_API_KEY || '',
        model: 'claude-3-5-sonnet-20241022',
        maxTokens: 4096
      },
      llmSettings: {
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 4096,
        presencePenalty: 0,
        frequencyPenalty: 0,
        ragWeight: 0.7,
        llmKnowledgeWeight: 0.3,
        streamResponse: true,
        systemPrompt: 'Sen yapay zeka destekli bir asistansiniz...',
        activeChatModel: 'gpt-4-turbo-preview',
        activeEmbeddingModel: 'text-embedding-3-small',
        responseStyle: 'professional',
        language: 'tr'
      }
    };

    // Save to database
    const { SettingsService } = await import('../services/settings.service');
    const settingsService = new SettingsService(asembPool);

    await settingsService.saveAllSettings(defaultSettings);

    res.json({ success: true, message: 'Default settings initialized' });
  } catch (error: any) {
    console.error('Default settings init error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create first admin user
router.post('/create-admin', async (req: Request, res: Response) => {
  try {
    const { admin } = req.body;

    // Check if admin user already exists
    const existingAdmin = await asembPool.query(
      'SELECT id FROM users WHERE email = $1',
      [admin.email]
    );

    if (existingAdmin.rows.length > 0) {
      return res.status(400).json({ error: 'Admin user already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(admin.password, 10);

    // Create admin user
    const result = await asembPool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING id, email, role`,
      [admin.email, hashedPassword, admin.firstName, admin.lastName, 'admin', true]
    );

    res.json({
      success: true,
      message: 'Admin user created',
      user: {
        id: result.rows[0].id,
        email: result.rows[0].email,
        role: result.rows[0].role
      }
    });
  } catch (error: any) {
    console.error('Admin creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check if admin exists
router.get('/check-admin', async (req: Request, res: Response) => {
  try {
    const result = await asembPool.query(
      'SELECT id, email, first_name FROM users WHERE role = $1 LIMIT 1',
      ['admin']
    );

    res.json({
      adminExists: result.rows.length > 0,
      admin: result.rows[0] || null
    });
  } catch (error: any) {
    // If database is not connected, return false
    if (error.code === 'ECONNREFUSED' || error.code === '3D000') {
      res.json({ adminExists: false, admin: null, databaseConnected: false });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

export default router;