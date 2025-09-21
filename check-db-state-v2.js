const { Pool } = require('pg');

// Source database connection
const sourcePool = new Pool({
  host: '91.99.229.96',
  port: 5432,
  database: 'rag_chatbot',
  user: 'postgres',
  password: 'Semsiye!22',
  ssl: false
});

// ASEMB database connection
const asembPool = new Pool({
  host: '91.99.229.96',
  port: 5432,
  database: 'asemb',
  user: 'postgres',
  password: 'Semsiye!22',
  ssl: false
});

async function checkDatabaseState() {
  console.log('=== DATABASE STATE CHECK V2 ===\n');

  try {
    // Check if unified_embeddings table exists in ASEMB
    const tableCheck = await asembPool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'unified_embeddings'
      )
    `);

    if (tableCheck.rows[0].exists) {
      console.log('UNIFIED_EMBEDDINGS table exists in ASEMB');

      // Check total embeddings by source_table
      const embeddingsByTable = await asembPool.query(`
        SELECT source_table, COUNT(*) as count
        FROM unified_embeddings
        GROUP BY source_table
        ORDER BY count DESC
      `);

      console.log('\nEmbeddings by table:');
      embeddingsByTable.rows.forEach(row => {
        console.log(`  ${row.source_table}: ${row.count}`);
      });

      // Check actual embedded counts using the correct source_table names
      const ozelgelerEmbedded = await asembPool.query(`
        SELECT COUNT(*) FROM unified_embeddings
        WHERE source_table = 'ozelgeler'
      `);

      const makalelerEmbedded = await asembPool.query(`
        SELECT COUNT(*) FROM unified_embeddings
        WHERE source_table = 'makaleler'
      `);

      console.log(`\nActual embedded counts:`);
      console.log(`  ozelgeler: ${ozelgelerEmbedded.rows[0].count}`);
      console.log(`  makaleler: ${makalelerEmbedded.rows[0].count}`);

    } else {
      console.log('UNIFIED_EMBEDDINGS table does NOT exist in ASEMB');

      // Check if there are any embedding-related tables
      const allTables = await asembPool.query(`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename LIKE '%embed%'
      `);

      console.log('\nTables with "embed" in name:');
      allTables.rows.forEach(row => {
        console.log(`  ${row.tablename}`);
      });
    }

  } catch (error) {
    console.error('Error checking ASEMB:', error.message);
  }

  console.log('\n---\n');

  // Check Redis progress data
  try {
    const Redis = require('ioredis');
    const redis = new Redis({
      host: 'localhost',
      port: 6379,
      db: 0
    });

    const progressData = await redis.get('embedding:progress');
    if (progressData) {
      const progress = JSON.parse(progressData);
      console.log('REDIS PROGRESS DATA:');
      console.log(JSON.stringify(progress, null, 2));
    } else {
      console.log('No progress data found in Redis');
    }

    await redis.quit();
  } catch (error) {
    console.error('Error checking Redis:', error.message);
  }

  // Close pools
  await sourcePool.end();
  await asembPool.end();
}

checkDatabaseState().catch(console.error);