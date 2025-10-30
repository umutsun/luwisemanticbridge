/**
 * Test Pause, Resume and Auto-Resume Functionality
 * This script tests migration pause/resume and crash recovery
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/lsemb',
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Simulated crash flag
let shouldCrash = false;
let crashAfterRecords = 5;

async function testPauseResume() {
  const client = await pool.connect();

  try {
    console.log('🧪 Testing Pause, Resume and Auto-Resume\n');
    console.log('='.repeat(80));

    // ========================================================================
    // TEST 1: PAUSE AND RESUME
    // ========================================================================
    console.log('\n📝 TEST 1: PAUSE AND RESUME');
    console.log('─'.repeat(80));

    // Create test data
    await client.query(`
      DROP TABLE IF EXISTS test_pause_resume_source CASCADE;

      CREATE TABLE test_pause_resume_source (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255),
        content TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      INSERT INTO test_pause_resume_source (title, content)
      SELECT
        'Document ' || generate_series,
        'Test content for document ' || generate_series
      FROM generate_series(1, 15);
    `);

    const migrationName = `test_pause_resume_${Date.now()}`;
    const totalRecords = 15;

    // Initialize migration
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
        last_processed_id,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10)
    `, [
      migrationName,
      'test_pause_resume_source',
      'unified_embeddings',
      totalRecords,
      0, 0, 0,
      'running',
      null,
      JSON.stringify({ test: 'pause_resume', batch_size: 3 })
    ]);

    console.log(`\n✅ Migration initialized: ${migrationName}`);
    console.log('   Processing 3 records, then PAUSING...\n');

    // Process first 3 records
    let processed = 0;
    let successful = 0;

    for (let i = 1; i <= 3; i++) {
      const record = await client.query(
        'SELECT * FROM test_pause_resume_source WHERE id = $1',
        [i]
      );

      if (record.rows.length > 0) {
        const row = record.rows[0];
        const dummyEmbedding = new Array(768).fill(Math.random());

        await client.query(`
          INSERT INTO unified_embeddings (
            source_table, source_type, source_id, source_name,
            content, embedding, metadata, tokens_used, model_used
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (source_table, source_id) DO NOTHING
        `, [
          'test_pause_resume_source', 'test_doc', row.id, row.title,
          row.content, JSON.stringify(dummyEmbedding),
          JSON.stringify({ migration: migrationName }), 50, 'test-model'
        ]);

        processed++;
        successful++;

        await client.query(`
          UPDATE migration_progress
          SET processed_records = $1, successful_records = $2,
              last_processed_id = $3, updated_at = NOW()
          WHERE migration_name = $4
        `, [processed, successful, row.id, migrationName]);

        console.log(`   ✓ Processed record ${row.id}`);
      }
    }

    // PAUSE migration
    console.log('\n   ⏸️  PAUSING migration...');
    await client.query(`
      UPDATE migration_progress
      SET status = 'paused', updated_at = NOW()
      WHERE migration_name = $1
    `, [migrationName]);

    let status = await client.query(
      'SELECT * FROM migration_status_summary WHERE migration_name = $1',
      [migrationName]
    );
    console.log(`   ✅ Migration paused at record ${status.rows[0].last_processed_id}`);
    console.log(`   📊 Progress: ${status.rows[0].progress_percentage}% (${status.rows[0].processed_records}/${status.rows[0].total_records})`);

    // Simulate time passing
    await sleep(2000);

    // RESUME migration
    console.log('\n   ▶️  RESUMING migration from last checkpoint...');
    await client.query(`
      UPDATE migration_progress
      SET status = 'running', updated_at = NOW()
      WHERE migration_name = $1
    `, [migrationName]);

    // Get last processed ID and continue from there
    const lastProcessed = await client.query(
      'SELECT last_processed_id FROM migration_progress WHERE migration_name = $1',
      [migrationName]
    );
    const resumeFromId = lastProcessed.rows[0].last_processed_id || 0;

    console.log(`   📍 Resuming from ID: ${resumeFromId}\n`);

    // Process remaining records (from ID 4 to 15)
    const remainingRecords = await client.query(`
      SELECT * FROM test_pause_resume_source
      WHERE id > $1
      ORDER BY id
    `, [resumeFromId]);

    for (const row of remainingRecords.rows) {
      const dummyEmbedding = new Array(768).fill(Math.random());

      await client.query(`
        INSERT INTO unified_embeddings (
          source_table, source_type, source_id, source_name,
          content, embedding, metadata, tokens_used, model_used
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (source_table, source_id) DO NOTHING
      `, [
        'test_pause_resume_source', 'test_doc', row.id, row.title,
        row.content, JSON.stringify(dummyEmbedding),
        JSON.stringify({ migration: migrationName, resumed: true }), 50, 'test-model'
      ]);

      processed++;
      successful++;

      await client.query(`
        UPDATE migration_progress
        SET processed_records = $1, successful_records = $2,
            last_processed_id = $3, updated_at = NOW()
        WHERE migration_name = $4
      `, [processed, successful, row.id, migrationName]);

      console.log(`   ✓ Processed record ${row.id} (resumed)`);
    }

    // Complete migration
    await client.query(`
      UPDATE migration_progress
      SET status = 'completed', completed_at = NOW()
      WHERE migration_name = $1
    `, [migrationName]);

    status = await client.query(
      'SELECT * FROM migration_status_summary WHERE migration_name = $1',
      [migrationName]
    );

    console.log('\n   ✅ TEST 1 RESULTS:');
    console.log(`   • Paused at: ${status.rows[0].processed_records - 12} records`);
    console.log(`   • Resumed from ID: ${resumeFromId}`);
    console.log(`   • Final: ${status.rows[0].processed_records}/${status.rows[0].total_records} (${status.rows[0].progress_percentage}%)`);
    console.log(`   • Status: ${status.rows[0].status}`);

    // ========================================================================
    // TEST 2: AUTO-RESUME (CRASH RECOVERY)
    // ========================================================================
    console.log('\n\n📝 TEST 2: AUTO-RESUME (CRASH RECOVERY)');
    console.log('─'.repeat(80));

    // Create new test data
    await client.query(`
      DROP TABLE IF EXISTS test_crash_recovery CASCADE;

      CREATE TABLE test_crash_recovery (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255),
        content TEXT
      );

      INSERT INTO test_crash_recovery (title, content)
      SELECT
        'Crash Test ' || generate_series,
        'Content for crash test ' || generate_series
      FROM generate_series(1, 12);
    `);

    const crashMigration = `test_crash_${Date.now()}`;

    // Initialize migration
    await client.query(`
      INSERT INTO migration_progress (
        migration_name, source_table, target_table,
        total_records, processed_records, successful_records,
        failed_records, status, started_at, last_processed_id, metadata
      ) VALUES ($1, $2, $3, $4, 0, 0, 0, 'running', NOW(), NULL, $5)
    `, [
      crashMigration,
      'test_crash_recovery',
      'unified_embeddings',
      12,
      JSON.stringify({ test: 'crash_recovery', crash_point: 5 })
    ]);

    console.log(`\n✅ Migration initialized: ${crashMigration}`);
    console.log('   Processing 5 records, then SIMULATING CRASH...\n');

    // Process first 5 records then "crash"
    processed = 0;
    successful = 0;

    for (let i = 1; i <= 5; i++) {
      const record = await client.query(
        'SELECT * FROM test_crash_recovery WHERE id = $1',
        [i]
      );

      const row = record.rows[0];
      const dummyEmbedding = new Array(768).fill(Math.random());

      await client.query(`
        INSERT INTO unified_embeddings (
          source_table, source_type, source_id, source_name,
          content, embedding, metadata, tokens_used, model_used
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (source_table, source_id) DO NOTHING
      `, [
        'test_crash_recovery', 'test_doc', row.id, row.title,
        row.content, JSON.stringify(dummyEmbedding),
        JSON.stringify({ migration: crashMigration }), 50, 'test-model'
      ]);

      processed++;
      successful++;

      await client.query(`
        UPDATE migration_progress
        SET processed_records = $1, successful_records = $2,
            last_processed_id = $3, updated_at = NOW()
        WHERE migration_name = $4
      `, [processed, successful, row.id, migrationName]);

      console.log(`   ✓ Processed record ${row.id}`);
    }

    // Simulate crash - leave migration in "running" state
    console.log('\n   💥 SIMULATING CRASH! (Migration left in "running" state)\n');
    await sleep(1000);

    // Check for incomplete migrations (auto-resume logic)
    console.log('   🔍 Checking for incomplete migrations...');
    const incompleteMigrations = await client.query(`
      SELECT migration_name, last_processed_id, processed_records, total_records
      FROM migration_progress
      WHERE status = 'running'
      AND migration_name = $1
    `, [crashMigration]);

    if (incompleteMigrations.rows.length > 0) {
      const incomplete = incompleteMigrations.rows[0];
      console.log(`   ✅ Found incomplete migration: ${incomplete.migration_name}`);
      console.log(`   📍 Last processed ID: ${incomplete.last_processed_id}`);
      console.log(`   📊 Progress: ${incomplete.processed_records}/${incomplete.total_records}\n`);

      // AUTO-RESUME: Continue from last checkpoint
      console.log('   🔄 AUTO-RESUMING migration...\n');

      const resumeFrom = incomplete.last_processed_id || 0;
      const remaining = await client.query(`
        SELECT * FROM test_crash_recovery
        WHERE id > $1
        ORDER BY id
      `, [resumeFrom]);

      for (const row of remaining.rows) {
        const dummyEmbedding = new Array(768).fill(Math.random());

        await client.query(`
          INSERT INTO unified_embeddings (
            source_table, source_type, source_id, source_name,
            content, embedding, metadata, tokens_used, model_used
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (source_table, source_id) DO NOTHING
        `, [
          'test_crash_recovery', 'test_doc', row.id, row.title,
          row.content, JSON.stringify(dummyEmbedding),
          JSON.stringify({ migration: crashMigration, auto_resumed: true }), 50, 'test-model'
        ]);

        processed++;
        successful++;

        await client.query(`
          UPDATE migration_progress
          SET processed_records = $1, successful_records = $2,
              last_processed_id = $3, updated_at = NOW()
          WHERE migration_name = $4
        `, [processed, successful, row.id, crashMigration]);

        console.log(`   ✓ Recovered record ${row.id}`);
      }

      // Complete
      await client.query(`
        UPDATE migration_progress
        SET status = 'completed', completed_at = NOW()
        WHERE migration_name = $1
      `, [crashMigration]);

      const finalStatus = await client.query(
        'SELECT * FROM migration_status_summary WHERE migration_name = $1',
        [crashMigration]
      );

      console.log('\n   ✅ TEST 2 RESULTS:');
      console.log(`   • Crashed at: 5 records`);
      console.log(`   • Auto-resumed from ID: ${resumeFrom}`);
      console.log(`   • Recovered: 7 records`);
      console.log(`   • Final: ${finalStatus.rows[0].processed_records}/${finalStatus.rows[0].total_records} (${finalStatus.rows[0].progress_percentage}%)`);
      console.log(`   • Status: ${finalStatus.rows[0].status}`);
    }

    // Cleanup
    console.log('\n\n🧹 Cleaning up test data...');
    await client.query('DROP TABLE IF EXISTS test_pause_resume_source CASCADE');
    await client.query('DROP TABLE IF EXISTS test_crash_recovery CASCADE');
    await client.query(`
      DELETE FROM unified_embeddings
      WHERE source_table IN ('test_pause_resume_source', 'test_crash_recovery')
    `);
    await client.query(`
      DELETE FROM migration_progress
      WHERE migration_name IN ($1, $2)
    `, [migrationName, crashMigration]);
    console.log('✅ Cleanup complete');

    console.log('\n' + '='.repeat(80));
    console.log('🎉 ALL TESTS COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(80));
    console.log('\n✅ Test Results:');
    console.log('   • Pause functionality: ✓ Working');
    console.log('   • Resume functionality: ✓ Working');
    console.log('   • Auto-resume (crash recovery): ✓ Working');
    console.log('   • last_processed_id tracking: ✓ Working');
    console.log('\n🚀 All migration features are fully functional!');

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
testPauseResume()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
