#!/usr/bin/env node
/**
 * Test pgai Extension Installation
 * Tests if pgai extension is properly installed and working
 */

const { Pool } = require('pg');
require('dotenv').config({ path: '../.env.lsemb' });

const pool = new Pool({
  host: process.env.POSTGRES_HOST || '91.99.229.96',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'lsemb',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '',
  ssl: false
});

async function testPgAI() {
  const client = await pool.connect();

  try {
    console.log('🔍 Testing pgai extension...\n');

    // 1. Check if pgai schema exists (pgai installs as schema, not extension)
    console.log('1️⃣ Checking if pgai is installed...');
    const schemaCheck = await client.query(`
      SELECT nspname FROM pg_namespace WHERE nspname = 'ai'
    `);

    if (schemaCheck.rows.length === 0) {
      console.log('❌ pgai NOT found (ai schema does not exist)');
      console.log('\nTo install pgai, run:');
      console.log('pgai install --db-url="postgresql://postgres:PASSWORD@localhost/lsemb"');
      return;
    }

    console.log('✅ pgai is installed (ai schema exists)\n');

    // 2. Check available ai functions
    console.log('2️⃣ Checking available ai.* functions...');
    const funcCheck = await client.query(`
      SELECT
        n.nspname as schema,
        p.proname as function_name,
        pg_get_function_identity_arguments(p.oid) as arguments
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'ai'
      ORDER BY p.proname
      LIMIT 20
    `);

    if (funcCheck.rows.length === 0) {
      console.log('⚠️ No ai.* functions found');
    } else {
      console.log(`✅ Found ${funcCheck.rows.length} ai functions (showing first 20):`);
      funcCheck.rows.forEach(row => {
        console.log(`   - ai.${row.function_name}(${row.arguments || ''})`);
      });
      console.log();
    }

    // 3. Check for vectorizer-related functions
    console.log('3️⃣ Checking vectorizer functions...');
    const vectorizerCheck = await client.query(`
      SELECT
        p.proname as function_name
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'ai'
        AND p.proname LIKE '%vectorizer%'
      ORDER BY p.proname
    `);

    if (vectorizerCheck.rows.length === 0) {
      console.log('⚠️ No vectorizer functions found');
      console.log('   pgai may not support automatic vectorizers in this version\n');
    } else {
      console.log(`✅ Found ${vectorizerCheck.rows.length} vectorizer functions:`);
      vectorizerCheck.rows.forEach(row => {
        console.log(`   - ai.${row.function_name}`);
      });
      console.log();
    }

    // 4. Check for embedding functions
    console.log('4️⃣ Checking embedding functions...');
    const embeddingCheck = await client.query(`
      SELECT
        p.proname as function_name
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'ai'
        AND (p.proname LIKE '%embedding%' OR p.proname LIKE '%openai%')
      ORDER BY p.proname
    `);

    if (embeddingCheck.rows.length === 0) {
      console.log('⚠️ No embedding functions found\n');
    } else {
      console.log(`✅ Found ${embeddingCheck.rows.length} embedding-related functions:`);
      embeddingCheck.rows.forEach(row => {
        console.log(`   - ai.${row.function_name}`);
      });
      console.log();
    }

    // 5. Test a simple embedding function if available
    console.log('5️⃣ Testing embedding generation...');
    try {
      // Check if we can call embedding functions
      const testQuery = await client.query(`
        SELECT EXISTS(
          SELECT 1
          FROM pg_proc p
          JOIN pg_namespace n ON p.pronamespace = n.oid
          WHERE n.nspname = 'ai'
            AND p.proname = 'openai_embed'
        ) as has_openai_embed
      `);

      if (testQuery.rows[0].has_openai_embed) {
        console.log('✅ ai.openai_embed() function is available');
        console.log('   Note: Actual embedding generation requires OpenAI API key\n');
      } else {
        console.log('⚠️ ai.openai_embed() function not found');
        console.log('   This version may use different embedding functions\n');
      }
    } catch (error) {
      console.log(`⚠️ Could not test embedding: ${error.message}\n`);
    }

    // 6. Check if vectorizer table exists
    console.log('6️⃣ Checking for vectorizer management tables...');
    const vectorizerTableCheck = await client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'ai'
        AND tablename LIKE '%vectorizer%'
      ORDER BY tablename
    `);

    if (vectorizerTableCheck.rows.length === 0) {
      console.log('⚠️ No vectorizer management tables found\n');
    } else {
      console.log(`✅ Found ${vectorizerTableCheck.rows.length} vectorizer tables:`);
      vectorizerTableCheck.rows.forEach(row => {
        console.log(`   - ai.${row.tablename}`);
      });
      console.log();
    }

    // Summary
    console.log('═══════════════════════════════════════');
    console.log('📊 PGAI TEST SUMMARY');
    console.log('═══════════════════════════════════════');
    console.log(`✅ Extension installed: Yes`);
    console.log(`✅ AI functions available: ${funcCheck.rows.length}`);
    console.log(`${vectorizerCheck.rows.length > 0 ? '✅' : '⚠️'} Vectorizer support: ${vectorizerCheck.rows.length > 0 ? 'Yes' : 'Limited/No'}`);
    console.log(`${embeddingCheck.rows.length > 0 ? '✅' : '⚠️'} Embedding functions: ${embeddingCheck.rows.length > 0 ? 'Yes' : 'No'}`);
    console.log('═══════════════════════════════════════\n');

    if (vectorizerCheck.rows.length > 0) {
      console.log('💡 Next steps:');
      console.log('   1. Configure OpenAI API key in database settings');
      console.log('   2. Create a vectorizer for unified_embeddings table');
      console.log('   3. Enable automatic embedding generation');
    } else {
      console.log('💡 Note:');
      console.log('   This pgai version may not include automatic vectorizers.');
      console.log('   You can still use embedding functions manually.');
    }

  } catch (error) {
    console.error('❌ Error testing pgai:', error.message);
    console.error(error);
  } finally {
    client.release();
    await pool.end();
  }
}

testPgAI();
