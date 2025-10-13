#!/usr/bin/env ts-node

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface ProjectConfig {
  projectName: string;
  domain: string;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  jwtSecret: string;
  encryptionKey: string;
}

export class MultiProjectSetup {
  private static instance: MultiProjectSetup;
  private config: ProjectConfig | null = null;

  static getInstance(): MultiProjectSetup {
    if (!MultiProjectSetup.instance) {
      MultiProjectSetup.instance = new MultiProjectSetup();
    }
    return MultiProjectSetup.instance;
  }

  // Read project configuration from environment
  loadProjectConfig(): ProjectConfig {
    if (this.config) {
      return this.config;
    }

    const projectName = process.env.PROJECT_NAME || 'lsemb';
    const domain = process.env.DOMAIN || 'lsemb.luwi.dev';
    const dbName = process.env.POSTGRES_DB || domain.replace(/\./g, '_');

    this.config = {
      projectName,
      domain,
      dbName,
      dbUser: process.env.POSTGRES_USER || dbName,
      dbPassword: process.env.POSTGRES_PASSWORD || this.generatePassword(),
      jwtSecret: process.env.JWT_SECRET || this.generateSecret(),
      encryptionKey: process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex')
    };

    return this.config;
  }

  // Create database for project
  async createDatabase(config: ProjectConfig): Promise<void> {
    const adminPool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      user: 'postgres', // Admin user
      password: process.env.POSTGRES_ADMIN_PASSWORD || 'postgres',
      database: 'postgres'
    });

    try {
      // Create database
      await adminPool.query(`CREATE DATABASE "${config.dbName}"`);
      console.log(`✅ Database ${config.dbName} created`);

      // Create user
      await adminPool.query(`CREATE USER "${config.dbUser}" WITH PASSWORD '${config.dbPassword}'`);
      console.log(`✅ User ${config.dbUser} created`);

      // Grant privileges
      await adminPool.query(`GRANT ALL PRIVILEGES ON DATABASE "${config.dbName}" TO "${config.dbUser}"`);
      console.log(`✅ Privileges granted`);

    } catch (error: any) {
      if (error.code === '42P04') {
        console.log(`ℹ️ Database ${config.dbName} already exists`);
      } else {
        throw error;
      }
    } finally {
      await adminPool.end();
    }
  }

  // Initialize project database
  async initializeProjectDatabase(config: ProjectConfig): Promise<void> {
    const projectPool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      user: config.dbUser,
      password: config.dbPassword,
      database: config.dbName
    });

    try {
      // Run database initialization
      await this.runMigrations(projectPool, config);
      console.log(`✅ Database initialized for ${config.projectName}`);
    } finally {
      await projectPool.end();
    }
  }

  // Create default admin user
  async createAdminUser(config: ProjectConfig, adminData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }): Promise<void> {
    const projectPool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      user: config.dbUser,
      password: config.dbPassword,
      database: config.dbName
    });

    try {
      const hashedPassword = await this.hashPassword(adminData.password);

      await projectPool.query(`
        INSERT INTO users (
          email,
          password_hash,
          first_name,
          last_name,
          role,
          is_active,
          email_verified,
          created_at
        ) VALUES ($1, $2, $3, $4, 'admin', true, true, NOW())
        ON CONFLICT (email) DO NOTHING
      `, [
        adminData.email,
        hashedPassword,
        adminData.firstName,
        adminData.lastName
      ]);

      console.log(`✅ Admin user created: ${adminData.email}`);
    } finally {
      await projectPool.end();
    }
  }

  // Save API keys for project
  async saveApiKeys(config: ProjectConfig, apiKeys: {
    openai?: string;
    claude?: string;
    gemini?: string;
    deepseek?: string;
  }): Promise<void> {
    const projectPool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      user: config.dbUser,
      password: config.dbPassword,
      database: config.dbName
    });

    try {
      // Save API keys to settings table
      for (const [provider, key] of Object.entries(apiKeys)) {
        if (key) {
          await projectPool.query(`
            INSERT INTO settings (key, value, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (key) DO UPDATE SET
              value = EXCLUDED.value,
              updated_at = NOW()
          `, [`${provider}.apiKey`, key]);
        }
      }

      console.log(`✅ API keys saved for ${config.projectName}`);
    } finally {
      await projectPool.end();
    }
  }

  // Run database migrations
  private async runMigrations(pool: Pool, config: ProjectConfig): Promise<void> {
    // Read and execute SQL migration files
    const migrationPath = path.join(__dirname, '../sql/init.sql');

    if (fs.existsSync(migrationPath)) {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      await pool.query(sql);
    }

    // Create project-specific tables if needed
    await this.createProjectTables(pool, config);
  }

  // Create project-specific tables
  private async createProjectTables(pool: Pool, config: ProjectConfig): Promise<void> {
    // Add project_id to existing tables for multi-tenancy
    const tables = [
      'users', 'conversations', 'messages', 'documents',
      'embeddings', 'scraped_data', 'settings'
    ];

    for (const table of tables) {
      try {
        await pool.query(`
          ALTER TABLE ${table}
          ADD COLUMN IF NOT EXISTS project_id VARCHAR(100) DEFAULT '${config.projectName}'
        `);
      } catch (error: any) {
        // Column might already exist
        if (error.code !== '42701') {
          console.warn(`Warning updating table ${table}:`, error.message);
        }
      }
    }
  }

  // Hash password
  private async hashPassword(password: string): Promise<string> {
    const bcrypt = require('bcrypt');
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  // Generate random password
  private generatePassword(): string {
    return crypto.randomBytes(32).toString('base64');
  }

  // Generate random secret
  private generateSecret(): string {
    return crypto.randomBytes(64).toString('base64');
  }

  // Create project configuration file
  createProjectConfigFile(config: ProjectConfig, outputPath: string): void {
    const configData = {
      project: {
        name: config.projectName,
        domain: config.domain,
        environment: 'production',
        version: '2.0.0'
      },
      database: {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        name: config.dbName,
        user: config.dbUser,
        password: config.dbPassword
      },
      security: {
        jwtSecret: config.jwtSecret,
        encryptionKey: config.encryptionKey
      },
      created: new Date().toISOString()
    };

    fs.writeFileSync(outputPath, JSON.stringify(configData, null, 2));
    console.log(`✅ Config file created: ${outputPath}`);
  }

  // Mark setup as complete
  markSetupComplete(config: ProjectConfig): void {
    const flagPath = path.join(process.cwd(), 'setup.flag');
    fs.writeFileSync(flagPath, `SETUP_COMPLETED=true\nTIMESTAMP=${new Date().toISOString()}\nPROJECT=${config.projectName}`);
    console.log(`✅ Setup marked as complete for ${config.projectName}`);
  }

  // Check if setup is required
  isSetupRequired(): boolean {
    const flagPath = path.join(process.cwd(), 'setup.flag');
    if (!fs.existsSync(flagPath)) {
      return true;
    }

    const flag = fs.readFileSync(flagPath, 'utf8');
    return flag.includes('SETUP_REQUIRED=true');
  }
}

// CLI interface for setup
if (require.main === module) {
  const setup = MultiProjectSetup.getInstance();
  const config = setup.loadProjectConfig();

  console.log(`🚀 Setting up ${config.projectName}...`);

  // Example: Create database
  setup.createDatabase(config)
    .then(() => setup.initializeProjectDatabase(config))
    .then(() => setup.markSetupComplete(config))
    .then(() => {
      console.log(`✅ Setup complete for ${config.projectName}`);
    })
    .catch(error => {
      console.error('❌ Setup failed:', error);
      process.exit(1);
    });
}