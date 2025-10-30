#!/usr/bin/env node
/**
 * Install pgai Extension
 * Installs the ai extension in the PostgreSQL database
 */

const { Pool } = require('pg');
require('dotenv').config({ path: '../../.env.lsemb' });

const pool = new Pool({
  host: process.env.POSTGRES_HOST || '91.99.229.96',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'lsemb',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '',
  ssl: false
});

async function installPgAI() {
  const client = await pool.connect();

  try {
    console.log('🔧 Installing pgai extension...\n');

    // Install the ai extension
    console.log('1️⃣ Creating ai extension...');
    await client.query('CREATE EXTENSION IF NOT EXISTS ai CASCADE');
    console.log('✅ ai extension installed successfully\n');

    // Verify installation
    console.log('2️⃣ Verifying installation...');
    const result = await client.query(`
      SELECT extname, extversion
      FROM pg_extension
      WHERE extname = 'ai'
    `);

    if (result.rows.length > 0) {
      console.log(`✅ Extension verified: ai v${result.rows[0].extversion}\n`);
    } else {
      console.log('❌ Extension not found after installation\n');
      return;
    }

    // Check available functions
    console.log('3️⃣ Checking available functions...');
    const funcResult = await client.query(`
      SELECT COUNT(*) as func_count
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'ai'
    `);

    console.log(`✅ Found ${funcResult.rows[0].func_count} ai.* functions\n`);

    // List some key functions
    console.log('4️⃣ Key functions available:');
    const keyFuncs = await client.query(`
      SELECT p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'ai'
        AND (
          p.proname LIKE '%embedding%'
          OR p.proname LIKE '%vectorizer%'
          OR p.proname LIKE '%openai%'
        )
      ORDER BY p.proname
      LIMIT 20
    `);

    if (keyFuncs.rows.length > 0) {
      keyFuncs.rows.forEach(row => {
        console.log(`   - ai.${row.proname}`);
      });
      console.log();
    }

    console.log('═══════════════════════════════════════');
    console.log('✅ PGAI INSTALLATION COMPLETE');
    console.log('═══════════════════════════════════════');
    console.log('Next steps:');
    console.log('1. Configure OpenAI API key');
    console.log('2. Create vectorizers for tables');
    console.log('3. Start automatic embedding generation');
    console.log();

  } catch (error) {
    console.error('❌ Error installing pgai:', error.message);
    if (error.message.includes('could not open extension control file')) {
      console.log('\n💡 The pgai extension files are not available on the database server.');
      console.log('   Please install pgai on the PostgreSQL server first.');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

installPgAI();
