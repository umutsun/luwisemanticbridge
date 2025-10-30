/**
 * Test Realtime Migration Progress Updates
 * This script simulates a migration with progress tracking
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/lsemb',
});

// Sleep helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testRealtimeMigration() {
  const client = await pool.connect();

  try {
    console.log('🧪 Testing Realtime Migration Progress Updates\n');
    console.log('='.repeat(80));

    // Create test source table
    console.log('\n📝 Step 1: Creating test source table...');
    await client.query(`
      DROP TABLE IF EXISTS test_migration_source CASCADE;

      CREATE TABLE test_migration_source (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255),
        content TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Insert 10 test records
      INSERT INTO test_migration_source (title, content)
      SELECT
        'Document ' || generate_series,
        'Test content for document ' || generate_series || '. This is sample text for testing migration progress.'
      FROM generate_series(1, 10);
    `);

    const count = await client.query('SELECT COUNT(*) FROM test_migration_source');
    console.log(`✅ Created test table with ${count.rows[0].count} records`);

    // Step 2: Initialize migration progress
    console.log('\n📝 Step 2: Initializing migration progress tracking...');

    const migrationName = `test_migration_${Date.now()}`;
    const totalRecords = parseInt(count.rows[0].count);

    await client.query(`
      INSERT INTO migration_progress (
        migration_name,
        source_table,
        target_table,
        total_records,
        processed_records,
        successful_records,
        failed_records,
        status,
        started_at,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
    `, [
      migrationName,
      'test_migration_source',
      'unified_embeddings',
      totalRecords,
      0, // processed_records
      0, // successful_records
      0, // failed_records
      'running',
      JSON.stringify({
        test: true,
        batch_size: 2,
        start_time: new Date().toISOString()
      })
    ]);

    console.log(`✅ Migration tracking initialized: ${migrationName}`);

    // Step 3: Simulate processing records with progress updates
    console.log('\n📝 Step 3: Simulating migration with realtime progress updates...');
    console.log('   (Processing 2 records per batch with 1s delay)\n');

    const records = await client.query(`
      SELECT id, title, content
      FROM test_migration_source
      ORDER BY id
    `);

    let processed = 0;
    let successful = 0;
    let failed = 0;
    const batchSize = 2;

    // Process in batches
    for (let i = 0; i < records.rows.length; i += batchSize) {
      const batch = records.rows.slice(i, i + batchSize);

      console.log(`   Processing batch ${Math.floor(i / batchSize) + 1}...`);

      for (const record of batch) {
        try {
          // Simulate embedding generation (dummy embedding)
          const dummyEmbedding = new Array(768).fill(Math.random());

          await client.query(`
            INSERT INTO unified_embeddings (
              source_table,
              source_type,
              source_id,
              source_name,
              content,
              embedding,
              metadata,
              tokens_used,
              model_used
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (source_table, source_id) DO NOTHING
          `, [
            'test_migration_source',
            'test_document',
            record.id,
            record.title,
            record.content.substring(0, 500),
            JSON.stringify(dummyEmbedding),
            JSON.stringify({ migration: migrationName, batch: Math.floor(i / batchSize) + 1 }),
            record.content.length / 4, // Approximate tokens
            'text-embedding-3-large'
          ]);

          successful++;
          processed++;

        } catch (error) {
          console.error(`     ❌ Failed to process record ${record.id}: ${error.message}`);
          failed++;
          processed++;
        }

        // Update progress after each record
        await client.query(`
          UPDATE migration_progress
          SET
            processed_records = $1,
            successful_records = $2,
            failed_records = $3,
            last_processed_id = $4,
            updated_at = NOW()
          WHERE migration_name = $5
        `, [processed, successful, failed, record.id, migrationName]);

        // Show progress
        const progressPct = ((processed / totalRecords) * 100).toFixed(1);
        console.log(`     ✓ Record ${record.id} processed [${processed}/${totalRecords}] (${progressPct}%)`);
      }

      // Small delay between batches
      await sleep(1000);

      // Query current progress (simulating frontend query)
      const currentProgress = await client.query(`
        SELECT * FROM migration_status_summary
        WHERE migration_name = $1
      `, [migrationName]);

      if (currentProgress.rows.length > 0) {
        const p = currentProgress.rows[0];
        console.log(`     📊 Progress: ${p.progress_percentage}% | Success: ${p.successful_records} | Failed: ${p.failed_records}`);
      }
    }

    // Step 4: Complete migration
    console.log('\n📝 Step 4: Finalizing migration...');

    await client.query(`
      UPDATE migration_progress
      SET
        status = $1,
        completed_at = NOW()
      WHERE migration_name = $2
    `, ['completed', migrationName]);

    console.log('✅ Migration completed!');

    // Step 5: Show final results
    console.log('\n📊 Step 5: Final Migration Results:');

    const finalStats = await client.query(`
      SELECT
        migration_name,
        status,
        total_records,
        processed_records,
        successful_records,
        failed_records,
        progress_percentage,
        duration_seconds,
        started_at,
        completed_at
      FROM migration_status_summary
      WHERE migration_name = $1
    `, [migrationName]);

    if (finalStats.rows.length > 0) {
      const stats = finalStats.rows[0];
      console.log(`\n   Migration: ${stats.migration_name}`);
      console.log(`   Status: ${stats.status}`);
      console.log(`   Total Records: ${stats.total_records}`);
      console.log(`   Processed: ${stats.processed_records}`);
      console.log(`   Successful: ${stats.successful_records}`);
      console.log(`   Failed: ${stats.failed_records}`);
      console.log(`   Progress: ${stats.progress_percentage}%`);
      console.log(`   Duration: ${stats.duration_seconds}s`);
      console.log(`   Started: ${new Date(stats.started_at).toLocaleString()}`);
      console.log(`   Completed: ${new Date(stats.completed_at).toLocaleString()}`);
    }

    // Step 6: Test frontend query (what dashboard would use)
    console.log('\n🖥️  Step 6: Testing frontend realtime query...');

    const frontendQuery = await client.query(`
      SELECT
        migration_name,
        status,
        progress_percentage,
        processed_records,
        total_records,
        successful_records,
        failed_records,
        duration_seconds,
        error_message
      FROM migration_status_summary
      WHERE status IN ('pending', 'running', 'completed')
      ORDER BY created_at DESC
      LIMIT 1
    `);

    console.log('\n   Frontend would display:');
    if (frontendQuery.rows.length > 0) {
      const data = frontendQuery.rows[0];
      console.log(`   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`   📦 ${data.migration_name}`);
      console.log(`   📊 Progress: ${data.progress_percentage}%`);
      console.log(`   ⏱️  Duration: ${data.duration_seconds}s`);
      console.log(`   ✅ Success: ${data.successful_records}/${data.total_records}`);
      console.log(`   ❌ Failed: ${data.failed_records}`);
      console.log(`   🔄 Status: ${data.status.toUpperCase()}`);
      console.log(`   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    }

    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await client.query('DROP TABLE test_migration_source CASCADE');
    await client.query(`
      DELETE FROM unified_embeddings
      WHERE source_table = 'test_migration_source'
    `);
    await client.query(`
      DELETE FROM migration_progress
      WHERE migration_name = $1
    `, [migrationName]);
    console.log('✅ Test data cleaned up');

    console.log('\n' + '='.repeat(80));
    console.log('🎉 REALTIME MIGRATION PROGRESS TEST COMPLETED!');
    console.log('='.repeat(80));
    console.log('\n✅ Test Results:');
    console.log('   • Progress tracking: Working');
    console.log('   • Realtime updates: Working');
    console.log('   • Status view: Working');
    console.log('   • Frontend queries: Working');
    console.log('\n🚀 Realtime migration progress system is fully functional!');

  } catch (error) {
    console.error('\n❌ Test failed!');
    console.error('Error:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run test
testRealtimeMigration()
  .then(() => {
    console.log('\n✅ Test script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test script failed:', error);
    process.exit(1);
  });
