const { Pool } = require('pg');
const Redis = require('ioredis');
require('dotenv').config();

// Database connections
const sourcePool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL || 'postgresql://postgres:postgres@localhost:5432/postgres'
});

const targetPool = new Pool({
  host: process.env.ASEMB_DB_HOST || 'localhost',
  port: parseInt(process.env.ASEMB_DB_PORT || '5432'),
  database: process.env.ASEMB_DB_NAME || 'asemb',
  user: process.env.ASEMB_DB_USER || 'postgres',
  password: process.env.ASEMB_DB_PASSWORD || 'postgres'
});

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: parseInt(process.env.REDIS_DB || '2')
});

async function fixEmbeddingCounts() {
  try {
    console.log('🔍 Checking actual embedding counts...');

    // Get counts from unified_embeddings
    const embeddedResult = await targetPool.query(`
      SELECT source_table, COUNT(*) as count
      FROM unified_embeddings
      WHERE source_type = 'database'
      GROUP BY source_table
    `);

    const embeddedCounts = {};
    embeddedResult.rows.forEach(row => {
      embeddedCounts[row.source_table] = parseInt(row.count);
    });

    console.log('Embedded counts:', embeddedCounts);

    // Get total records from source tables
    const sourceCounts = {};

    // Check each table
    const tables = [
      { name: 'ozelgeler', display: 'Özelgeler', column: '"Icerik"' },
      { name: 'makaleler', display: 'Makaleler', column: '"Icerik"' },
      { name: 'sorucevap', display: 'Soru-Cevap', column: 'CONCAT("Soru", \' \', "Cevap")' },
      { name: 'danistaykararlari', display: 'Danıştay Kararları', column: '"Icerik"' },
      { name: 'chat_history', display: 'Sohbet Geçmişi', column: 'message' }
    ];

    for (const table of tables) {
      try {
        const result = await sourcePool.query(`
          SELECT COUNT(*) as total
          FROM public."${table.name}"
          WHERE ${table.column.includes('CONCAT') ? 'TRUE' : `${table.column} IS NOT NULL`}
        `);
        sourceCounts[table.display] = parseInt(result.rows[0].total);
      } catch (err) {
        console.error(`Error counting ${table.name}:`, err);
        sourceCounts[table.display] = 0;
      }
    }

    console.log('Source counts:', sourceCounts);

    // Calculate correct progress
    let totalEmbedded = 0;
    let totalRecords = 0;

    const progressData = {};

    for (const [display, embedded] of Object.entries(embeddedCounts)) {
      const source = sourceCounts[display] || 0;
      totalEmbedded += embedded;
      totalRecords += source;

      progressData[display] = {
        total: source,
        embedded: embedded,
        percentage: source > 0 ? Math.round((embedded / source) * 100) : 0
      };
    }

    const overallPercentage = totalRecords > 0 ? Math.round((totalEmbedded / totalRecords) * 100) : 0;

    console.log('Overall progress:', {
      totalEmbedded,
      totalRecords,
      percentage: overallPercentage
    });

    // Update Redis with correct progress
    const migrationProgress = {
      status: 'paused',
      current: totalEmbedded,
      total: totalRecords,
      percentage: overallPercentage,
      currentTable: null,
      error: null,
      tokensUsed: 0,
      estimatedCost: 0,
      startTime: Date.now(),
      estimatedTimeRemaining: null,
      processedTables: [],
      currentBatch: 0,
      totalBatches: 0,
      newlyEmbedded: totalEmbedded
    };

    await redis.set('migration:progress', JSON.stringify(migrationProgress), 'EX', 7 * 24 * 60 * 60);
    console.log('✅ Updated Redis with correct progress');

    // Also update embedding:progress for SSE
    await redis.set('embedding:progress', JSON.stringify({
      status: 'paused',
      current: totalEmbedded,
      total: totalRecords,
      percentage: overallPercentage,
      currentTable: null,
      error: null,
      startTime: Date.now(),
      newlyEmbedded: totalEmbedded,
      errorCount: 0
    }));

    console.log('✅ Updated embedding:progress for SSE');

    console.log('\n📊 Summary:');
    console.log('================================');
    console.log(`Total Records: ${totalRecords.toLocaleString()}`);
    console.log(`Total Embedded: ${totalEmbedded.toLocaleString()}`);
    console.log(`Overall Progress: ${overallPercentage}%`);
    console.log('\nPer Table:');
    for (const [table, data] of Object.entries(progressData)) {
      console.log(`${table}: ${data.embedded.toLocaleString()} / ${data.total.toLocaleString()} (${data.percentage}%)`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixEmbeddingCounts();