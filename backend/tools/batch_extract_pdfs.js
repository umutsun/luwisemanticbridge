const { Pool } = require('pg');
const fs = require('fs');
const pdfParse = require('pdf-parse');

(async () => {
  const env = fs.readFileSync('.env', 'utf-8');
  const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();

  const pool = new Pool({ connectionString: dbUrl });

  // Get PDFs needing extraction
  const batchSize = parseInt(process.argv[2]) || 10;
  const result = await pool.query(
    `SELECT id, title, file_path FROM documents
     WHERE (file_type LIKE '%pdf%' OR type = 'pdf')
     AND (content IS NULL OR LENGTH(content) = 0)
     ORDER BY created_at DESC
     LIMIT $1`,
    [batchSize]
  );

  console.log(`\n=== BATCH TEXT EXTRACTION ===`);
  console.log(`Processing ${result.rows.length} PDFs...\n`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < result.rows.length; i++) {
    const doc = result.rows[i];
    try {
      console.log(`[${i + 1}/${result.rows.length}] ${doc.title}`);

      if (!fs.existsSync(doc.file_path)) {
        console.log(`  ⚠ File not found`);
        errorCount++;
        continue;
      }

      const dataBuffer = fs.readFileSync(doc.file_path);
      const pdfData = await pdfParse(dataBuffer);

      if (pdfData.text && pdfData.text.length > 0) {
        await pool.query(
          `UPDATE documents
           SET content = $1,
               processing_status = 'analyzed',
               metadata = jsonb_set(
                 COALESCE(metadata, '{}'),
                 '{textExtract}',
                 $3::jsonb
               ),
               updated_at = NOW()
           WHERE id = $2`,
          [
            pdfData.text,
            doc.id,
            JSON.stringify({
              extracted: true,
              method: 'pdf-parse',
              extractedAt: new Date().toISOString(),
              textLength: pdfData.text.length
            })
          ]
        );
        console.log(`  ✓ Extracted ${pdfData.text.length} chars`);
        successCount++;
      } else {
        console.log(`  ⚠ No text extracted - may need OCR`);
        errorCount++;
      }
    } catch (error) {
      console.log(`  ✗ Error: ${error.message}`);
      errorCount++;
    }
  }

  console.log(`\n=== COMPLETED ===`);
  console.log(`Success: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`\nTo process more: node batch_extract_pdfs.js 100`);

  await pool.end();
})();
