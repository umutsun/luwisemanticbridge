import { Router, Request, Response } from 'express';
import { MultiProjectSetup } from '../scripts/multi-project-setup';

const router = Router();
const setup = MultiProjectSetup.getInstance();

// Check if setup is required
router.get('/status', async (req: Request, res: Response) => {
  try {
    const isSetupRequired = setup.isSetupRequired();
    const config = setup.loadProjectConfig();

    res.json({
      setupRequired: isSetupRequired,
      setupComplete: !isSetupRequired,
      project: {
        name: config.projectName,
        domain: config.domain,
        dbName: config.dbName,
        dbUser: config.dbUser
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

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