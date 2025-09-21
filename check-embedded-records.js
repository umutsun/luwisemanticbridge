const { Pool } = require('pg');

const asembPool = new Pool({
  user: 'postgres',
  host: '91.99.229.96',
  database: 'asemb',
  password: 'Semsiye!22',
  port: 5432
});

const sourcePool = new Pool({
  user: 'postgres',
  host: '91.99.229.96',
  database: 'rag_chatbot',
  password: 'Semsiye!22',
  port: 5432
});

async function checkEmbedded() {
  try {
    // Get actual embedded count
    const embeddedResult = await asembPool.query(`
      SELECT COUNT(DISTINCT CAST(source_id AS INTEGER)) as count
      FROM unified_embeddings
      WHERE metadata->>'table' = 'ozelgeler' AND source_type = 'database'
    `);
    console.log('Actually embedded records:', embeddedResult.rows[0].count);

    // Get the embedded source_ids
    const embeddedIds = await asembPool.query(`
      SELECT DISTINCT CAST(source_id AS INTEGER) as id
      FROM unified_embeddings
      WHERE metadata->>'table' = 'ozelgeler' AND source_type = 'database'
      ORDER BY id
    `);

    console.log('\nEmbedded ID ranges:');
    console.log('  Min embedded ID:', embeddedIds.rows[0]?.id);
    console.log('  Max embedded ID:', embeddedIds.rows[embeddedIds.rows.length - 1]?.id);

    // Check for IDs that should be embedded but aren't
    // Since we can't join across databases, we'll get the embedded IDs first
    const embeddedIdsSet = new Set(embeddedIds.rows.map(r => r.id));

    // Get all ozelgeler IDs
    const allIdsResult = await sourcePool.query(`
      SELECT id FROM public.ozelgeler ORDER BY id
    `);

    const missingIds = allIdsResult.rows
      .filter(row => !embeddedIdsSet.has(row.id))
      .map(row => row.id);

    console.log('\nFirst 10 missing IDs:');
    missingIds.slice(0, 10).forEach(id => {
      console.log('  ID:', id);
    });

    console.log('\nTotal missing records:', missingIds.length);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await asembPool.end();
    await sourcePool.end();
  }
}

checkEmbedded();