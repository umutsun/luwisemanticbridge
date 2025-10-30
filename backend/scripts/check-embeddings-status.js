#!/usr/bin/env node
const { Pool } = require('pg');
require('dotenv').config({ path: '../../.env.lsemb' });

const pool = new Pool({
  host: process.env.POSTGRES_HOST || '91.99.229.96',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'lsemb',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD
});

async function checkEmbeddings() {
  const client = await pool.connect();

  try {
    console.log('🔍 Checking Embeddings Status\n');
    console.log('═════════════════════════════════════\n');

    // Count by source table
    const countByTable = await client.query(`
      SELECT
        source_table,
        COUNT(*) as count
      FROM unified_embeddings
      GROUP BY source_table
      ORDER BY source_table
    `);

    console.log('📊 Current Embeddings Count:');
    let totalEmbedded = 0;
    countByTable.rows.forEach(row => {
      console.log(`  - ${row.source_table}: ${row.count}`);
      totalEmbedded += parseInt(row.count);
    });
    console.log(`  TOTAL: ${totalEmbedded}\n`);

    // Source table counts
    const sources = ['danistaykararlari', 'makaleler', 'ozelgeler', 'sorucevap'];

    console.log('📋 Source Tables vs Embedded:');
    for (const table of sources) {
      const sourceCount = await client.query(`SELECT COUNT(*) FROM "${table}"`);
      const embeddedCount = countByTable.rows.find(r => r.source_table === table)?.count || 0;
      const pending = parseInt(sourceCount.rows[0].count) - parseInt(embeddedCount);
      console.log(`  - ${table}: ${sourceCount.rows[0].count} total | ${embeddedCount} embedded | ${pending} pending`);
    }

    console.log('\n🔧 Indexes on unified_embeddings:');
    const indexes = await client.query(`
      SELECT
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename = 'unified_embeddings'
      ORDER BY indexname
    `);

    if (indexes.rows.length === 0) {
      console.log('  ⚠️ No indexes found!');
    } else {
      indexes.rows.forEach(idx => {
        const def = idx.indexdef.toLowerCase();
        let type = 'Standard';
        if (def.includes('diskann')) type = '✅ DiskANN (pgvectorscale)';
        else if (def.includes('ivfflat')) type = 'IVFFlat';
        else if (def.includes('hnsw')) type = 'HNSW';
        else if (def.includes('btree')) type = 'B-Tree';
        else if (def.includes('unique')) type = 'Unique';

        console.log(`  - ${idx.indexname}: ${type}`);
      });
    }

    // Check for any data corruption
    console.log('\n⚙️  Data Integrity Check:');
    const integrity = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN embedding IS NULL THEN 1 END) as null_embeddings,
        COUNT(CASE WHEN array_length(embedding, 1) IS NULL THEN 1 END) as empty_embeddings,
        MIN(array_length(embedding, 1)) as min_dim,
        MAX(array_length(embedding, 1)) as max_dim
      FROM unified_embeddings
    `);

    const int = integrity.rows[0];
    console.log(`  - Total embeddings: ${int.total}`);
    console.log(`  - NULL embeddings: ${int.null_embeddings} ${int.null_embeddings > 0 ? '❌' : '✅'}`);
    console.log(`  - Empty embeddings: ${int.empty_embeddings} ${int.empty_embeddings > 0 ? '❌' : '✅'}`);
    console.log(`  - Embedding dimension range: ${int.min_dim} - ${int.max_dim} ${int.min_dim === int.max_dim ? '✅' : '⚠️'}`);

    console.log('\n═════════════════════════════════════');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkEmbeddings();
