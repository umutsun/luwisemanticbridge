/**
 * Migration Runner Utility
 * Runs SQL migrations on startup
 */

import pool from '../config/database';
import * as fs from 'fs';
import * as path from 'path';

export async function runMigration(migrationName: string): Promise<void> {
  const migrationPath = path.join(__dirname, '../migrations', migrationName);

  if (!fs.existsSync(migrationPath)) {
    console.log(`[Migration] File not found: ${migrationPath}`);
    return;
  }

  try {
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    await pool.query(sql);
    console.log(`[Migration] Successfully ran: ${migrationName}`);
  } catch (error: any) {
    // Ignore errors if table already exists
    if (error.code === '42P07') {
      console.log(`[Migration] Table already exists (skipping): ${migrationName}`);
    } else {
      console.error(`[Migration] Failed to run ${migrationName}:`, error.message);
    }
  }
}

export async function runAllMigrations(): Promise<void> {
  console.log('[Migration] Running pending migrations...');

  // Add migrations in order
  const migrations = [
    'create-import-jobs-table.sql'
  ];

  for (const migration of migrations) {
    await runMigration(migration);
  }

  console.log('[Migration] All migrations completed');
}
