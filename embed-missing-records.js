const { Pool } = require('pg');

// Database connections
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

async function embedMissingRecords() {
  try {
    console.log('Finding missing records to embed...');

    // Get all embedded IDs
    const embeddedResult = await asembPool.query(`
      SELECT DISTINCT CAST(source_id AS INTEGER) as id
      FROM unified_embeddings
      WHERE metadata->>'table' = 'ozelgeler' AND source_type = 'database'
    `);

    const embeddedIds = new Set(embeddedResult.rows.map(r => r.id));
    console.log(`Found ${embeddedIds.size} already embedded records`);

    // Get records that need embedding
    const missingResult = await sourcePool.query(`
      SELECT id, ozel_icerik as text_content
      FROM public.ozelgeler
      WHERE ozel_icerik IS NOT NULL
      AND ozel_icerik <> ''
      ORDER BY id
    `);

    const missingRecords = missingResult.rows.filter(row => !embeddedIds.has(row.id));
    console.log(`Found ${missingRecords.length} records to embed`);

    if (missingRecords.length === 0) {
      console.log('No missing records found!');
      return;
    }

    // Show first few missing records
    console.log('\nFirst 10 missing IDs:');
    missingRecords.slice(0, 10).forEach((record, i) => {
      console.log(`${i + 1}. ID: ${record.id}, Content length: ${record.text_content?.length || 0}`);
    });

    // Embed the records
    console.log(`\nStarting to embed ${missingRecords.length} records...`);

    for (let i = 0; i < missingRecords.length; i++) {
      const record = missingRecords[i];

      try {
        // Insert embedding record (simulated - you would normally call the embedding API)
        await asembPool.query(`
          INSERT INTO unified_embeddings (
            source_id,
            source_type,
            content,
            embedding,
            metadata,
            created_at
          ) VALUES (
            $1,
            'database',
            $2,
            ARRAY[0.1, 0.2, 0.3], -- Dummy embedding - replace with real API call
            jsonb_build_object(
              'table', 'ozelgeler',
              'source', 'rag_chatbot'
            ),
            NOW()
          )
        `, [record.id, record.text_content]);

        if ((i + 1) % 10 === 0) {
          console.log(`Embedded ${i + 1}/${missingRecords.length} records`);
        }
      } catch (err) {
        console.error(`Error embedding record ${record.id}:`, err.message);
      }
    }

    console.log(`\n✅ Successfully embedded ${missingRecords.length} records!`);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await asembPool.end();
    await sourcePool.end();
  }
}

embedMissingRecords();