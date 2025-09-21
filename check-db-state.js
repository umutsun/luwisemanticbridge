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
  console.log('=== DATABASE STATE CHECK ===\n');

  // Check ozelgeler table
  console.log('OZELGELER TABLE:');
  const ozelgelerCount = await sourcePool.query('SELECT COUNT(*) FROM public.ozelgeler');
  console.log(`Total records: ${ozelgelerCount.rows[0].count}`);

  const ozelgelerMaxId = await sourcePool.query('SELECT MAX(id) FROM public.ozelgeler');
  console.log(`Max ID: ${ozelgelerMaxId.rows[0].max}`);

  const ozelgelerEmbedded = await asembPool.query(`
    SELECT COUNT(*) FROM unified_embeddings
    WHERE source_table = 'ozelgeler'
  `);
  console.log(`Embedded in ASEMB: ${ozelgelerEmbedded.rows[0].count}`);

  // Check for records with ID > 1050
  const ozelgelerHighIds = await sourcePool.query(`
    SELECT COUNT(*) FROM public.ozelgeler
    WHERE id > 1050
  `);
  console.log(`Records with ID > 1050: ${ozelgelerHighIds.rows[0].count}`);

  console.log('\n---\n');

  // Check makaleler table
  console.log('MAKALELER TABLE:');
  const makalelerCount = await sourcePool.query('SELECT COUNT(*) FROM public.makaleler');
  console.log(`Total records: ${makalelerCount.rows[0].count}`);

  const makalelerMaxId = await sourcePool.query('SELECT MAX(id) FROM public.makaleler');
  console.log(`Max ID: ${makalelerMaxId.rows[0].max}`);

  const makalelerEmbedded = await asembPool.query(`
    SELECT COUNT(*) FROM unified_embeddings
    WHERE source_table = 'makaleler'
  `);
  console.log(`Embedded in ASEMB: ${makalelerEmbedded.rows[0].count}`);

  // Check for records with ID > 1066
  const makalelerHighIds = await sourcePool.query(`
    SELECT COUNT(*) FROM public.makaleler
    WHERE id > 1066
  `);
  console.log(`Records with ID > 1066: ${makalelerHighIds.rows[0].count}`);

  console.log('\n---\n');

  // Check what's the next ID to process for each table
  console.log('NEXT RECORDS TO PROCESS:');

  const ozelgelerNext = await sourcePool.query(`
    SELECT id, "Icerik" FROM public.ozelgeler
    WHERE id NOT IN (
      SELECT CAST(source_id AS INTEGER) FROM unified_embeddings
      WHERE source_table = 'ozelgeler'
    )
    ORDER BY id
    LIMIT 5
  `);

  console.log('\nOzelgeler - Next 5 unprocessed records:');
  ozelgelerNext.rows.forEach((row, i) => {
    console.log(`${i+1}. ID: ${row.id}, Content length: ${row.Icerik ? row.Icerik.length : 0}`);
  });

  const makalelerNext = await sourcePool.query(`
    SELECT id, "Icerik" FROM public.makaleler
    WHERE id NOT IN (
      SELECT CAST(source_id AS INTEGER) FROM unified_embeddings
      WHERE source_table = 'makaleler'
    )
    ORDER BY id
    LIMIT 5
  `);

  console.log('\nMakaleler - Next 5 unprocessed records:');
  makalelerNext.rows.forEach((row, i) => {
    console.log(`${i+1}. ID: ${row.id}, Content length: ${row.Icerik ? row.Icerik.length : 0}`);
  });

  // Close pools
  await sourcePool.end();
  await asembPool.end();
}

checkDatabaseState().catch(console.error);