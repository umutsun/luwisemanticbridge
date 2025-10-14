import { Router, Request, Response } from 'express';
import { MultiProjectSetup } from '../scripts/multi-project-setup';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();
const setup = MultiProjectSetup.getInstance();

// Check if setup is required
router.get('/status', async (req: Request, res: Response) => {
  try {
    const isSetupRequired = setup.isSetupRequired();
    const config = setup.loadProjectConfig();

    // Check if .env.lsemb file exists and has required values
    const envFile = path.join(process.cwd(), '.env.lsemb');
    let envConfigured = false;
    let databaseConnected = false;
    let adminUserExists = false;

    if (fs.existsSync(envFile)) {
      const envContent = fs.readFileSync(envFile, 'utf8');
      const requiredVars = ['POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD'];
      envConfigured = requiredVars.every(function(variable) {
        return envContent.includes(variable + '=') && !envContent.includes(variable + '=your_');
      });

      // If environment is configured, check database connection and admin user
      if (envConfigured) {
        try {
          // Import database pool dynamically to avoid issues when not configured
          const { asembPool } = await import('../config/database.config');

          // Test database connection
          const dbTest = await asembPool.query('SELECT 1');
          databaseConnected = true;

          // Check if admin user exists
          const adminCheck = await asembPool.query(
            'SELECT id FROM users WHERE email = $1 AND role = $2',
            [process.env.ADMIN_EMAIL || 'admin@luwi.dev', 'admin']
          );
          adminUserExists = adminCheck.rows.length > 0;

        } catch (dbError) {
          console.log('Database not ready or admin user not found:', dbError);
          databaseConnected = false;
          adminUserExists = false;
        }
      }
    }

    // Setup is complete only if: env configured AND database connected AND admin user exists
    const setupComplete = envConfigured && databaseConnected && adminUserExists;

    res.json({
      setupRequired: !setupComplete,
      setupComplete: setupComplete,
      envConfigured: envConfigured,
      databaseConnected: databaseConnected,
      adminUserExists: adminUserExists,
      project: {
        name: config.projectName,
        domain: config.domain,
        dbName: config.dbName,
        dbUser: config.dbUser,
        title: 'Luwi Semantic Bridge',
        description: 'AI-Powered Knowledge Management System'
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Save configuration and update .env file
router.post('/configure', async (req: Request, res: Response) => {
  try {
    const { database, admin, apiKeys, site } = req.body;

    // Read existing .env.lsemb or create new
    const envFile = path.join(process.cwd(), '.env.lsemb');
    let envContent = '';

    if (fs.existsSync(envFile)) {
      envContent = fs.readFileSync(envFile, 'utf8');
    }

    // Update database configuration
    envContent = updateEnvVar(envContent, 'POSTGRES_HOST', database.host);
    envContent = updateEnvVar(envContent, 'POSTGRES_PORT', database.port);
    envContent = updateEnvVar(envContent, 'POSTGRES_DB', database.name);
    envContent = updateEnvVar(envContent, 'POSTGRES_USER', database.user);
    envContent = updateEnvVar(envContent, 'POSTGRES_PASSWORD', database.password);

    // Update site configuration
    envContent = updateEnvVar(envContent, 'SITE_TITLE', site.title);
    envContent = updateEnvVar(envContent, 'SITE_DESCRIPTION', site.description);
    envContent = updateEnvVar(envContent, 'SITE_LOGO_URL', site.logoUrl);

    // Write updated .env file
    fs.writeFileSync(envFile, envContent);

    // Save API keys to database (if database is configured)
    if (database.name && database.password) {
      const config = setup.loadProjectConfig();
      config.dbName = database.name;
      config.dbUser = database.user;
      config.dbPassword = database.password;

      try {
        await setup.saveApiKeys(config, apiKeys);
      } catch (error) {
        // Database might not be ready yet, that's OK
        console.log('Could not save API keys to database yet:', error);
      }
    }

    // Save admin data to temp file for later
    const tempAdminFile = path.join(process.cwd(), 'setup-admin.json');
    fs.writeFileSync(tempAdminFile, JSON.stringify(admin, null, 2));

    res.json({ success: true, message: 'Configuration saved' });
  } catch (error: any) {
    console.error('Configuration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to update environment variable
function updateEnvVar(content: string, key: string, value: string): string {
  const regex = new RegExp('^' + key + '=.*$', 'm');
  if (regex.test(content)) {
    return content.replace(regex, key + '=' + value);
  } else {
    return content + '\n' + key + '=' + value + '\n';
  }
}

// Test database connection
router.post('/test-db', async (req: Request, res: Response) => {
  try {
    const { host, port, dbName, dbUser, dbPassword } = req.body;

    // Test connection with provided credentials
    const { Pool } = require('pg');
    const testPool = new Pool({
      host,
      port: parseInt(port),
      user: dbUser,
      password: dbPassword,
      database: dbName
    });

    const result = await testPool.query('SELECT 1');
    await testPool.end();

    // If successful, create/update database
    const config = setup.loadProjectConfig();
    config.dbPassword = dbPassword;

    await setup.createDatabase(config);
    await setup.initializeProjectDatabase(config);

    res.json({ success: true, message: 'Database connected and initialized' });
  } catch (error: any) {
    console.error('Database test failed:', error);
    res.status(400).json({
      success: false,
      error: 'Database connection failed. Please check your credentials.'
    });
  }
});

// Create admin user
router.post('/create-admin', async (req: Request, res: Response) => {
  try {
    const adminData = req.body;
    const config = setup.loadProjectConfig();

    await setup.createAdminUser(config, adminData);

    res.json({ success: true, message: 'Admin user created successfully' });
  } catch (error: any) {
    console.error('Admin creation failed:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to create admin user'
    });
  }
});

// Save API keys
router.post('/save-keys', async (req: Request, res: Response) => {
  try {
    const apiKeys = req.body;
    const config = setup.loadProjectConfig();

    await setup.saveApiKeys(config, apiKeys);

    res.json({ success: true, message: 'API keys saved successfully' });
  } catch (error: any) {
    console.error('API keys save failed:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to save API keys'
    });
  }
});

// Mark setup as complete
router.post('/complete', async (req: Request, res: Response) => {
  try {
    const config = setup.loadProjectConfig();
    setup.markSetupComplete(config);

    res.json({ success: true, message: 'Setup completed successfully' });
  } catch (error: any) {
    console.error('Setup completion failed:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to complete setup'
    });
  }
});

export default router;