/**
 * Fix stuck migrations - Run this on production server
 *
 * Usage:
 *   cd /var/www/vergilex/backend
 *   node scripts/fix-stuck-migrations.js
 */

const { Pool } = require('pg');
const Redis = require('redis');

// Get connection from environment or use defaults
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:umut@localhost:5432/lsemb'
});

const redis = Redis.createClient({
  url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}/${process.env.REDIS_DB || 0}`
});

async function main() {
  try {
    console.log('Connecting to database...');
    await redis.connect();

    // 1. Check for stuck migrations
    console.log('\n=== Checking for stuck migrations ===');
    const stuckResult = await pool.query(`
      SELECT migration_id, table_name, status, processed_records, total_records, started_at
      FROM migration_history
      WHERE status = 'processing'
      ORDER BY started_at DESC
    `);

    console.log(`Found ${stuckResult.rows.length} stuck migrations:`);
    stuckResult.rows.forEach(row => {
      const progress = row.total_records > 0
        ? ((row.processed_records / row.total_records) * 100).toFixed(1)
        : '0';
      console.log(`  - ${row.table_name}: ${row.processed_records}/${row.total_records} (${progress}%)`);
    });

    if (stuckResult.rows.length === 0) {
      console.log('No stuck migrations found.');
      return;
    }

    // 2. Update stuck migrations to 'paused' status
    console.log('\n=== Updating stuck migrations to paused ===');
    const updateResult = await pool.query(`
      UPDATE migration_history
      SET status = 'paused',
          completed_at = NOW()
      WHERE status = 'processing'
      RETURNING migration_id, table_name
    `);

    console.log(`Updated ${updateResult.rowCount} migrations to 'paused' status`);

    // 3. Clear Redis embedding state
    console.log('\n=== Clearing Redis embedding state ===');
    const keysToDelete = [
      'embedding:progress',
      'embedding:status',
      'migration:progress'
    ];

    for (const key of keysToDelete) {
      await redis.del(key);
      console.log(`  Deleted: ${key}`);
    }

    // 4. Show summary
    console.log('\n=== Summary ===');
    console.log('Stuck migrations have been paused.');
    console.log('You can now resume embedding from the UI or restart fresh.');
    console.log('\nNext steps:');
    console.log('1. Go to the Migrations > Embeddings page in the UI');
    console.log('2. Select tables with pending embeddings');
    console.log('3. Click "Migration Başlat" to start embedding');

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await pool.end();
    await redis.quit();
  }
}

main();
