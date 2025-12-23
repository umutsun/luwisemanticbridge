/**
 * Batch Document Embedding Script
 * Embeds extracted PDF content using OpenAI text-embedding-3-small
 */

const { Pool } = require('pg');
const fs = require('fs');
const OpenAI = require('openai');

const BATCH_SIZE = 10; // Documents per batch
const CHUNK_SIZE = 4000; // Characters per chunk (for long documents)
const EMBEDDING_MODEL = 'text-embedding-3-small';

(async () => {
  const env = fs.readFileSync('.env', 'utf-8');
  const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
  const openaiKey = env.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();

  if (!openaiKey) {
    // Try to get from settings
    const pool = new Pool({ connectionString: dbUrl });
    const keyResult = await pool.query(
      "SELECT value FROM settings WHERE key = 'openai_api_key'"
    );
    if (keyResult.rows.length === 0) {
      console.error('OpenAI API key not found!');
      process.exit(1);
    }
    var apiKey = keyResult.rows[0].value;
    await pool.end();
  } else {
    var apiKey = openaiKey;
  }

  const openai = new OpenAI({ apiKey });
  const pool = new Pool({ connectionString: dbUrl });

  // Get count limit from args
  const limit = parseInt(process.argv[2]) || 100;

  console.log(`\n=== BATCH DOCUMENT EMBEDDING ===`);
  console.log(`Model: ${EMBEDDING_MODEL}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Max documents: ${limit}`);

  // Get documents with content that don't have embeddings yet
  const docsResult = await pool.query(
    `SELECT d.id, d.title, d.content, d.file_type
     FROM documents d
     WHERE d.content IS NOT NULL
       AND LENGTH(d.content) > 100
       AND NOT EXISTS (
         SELECT 1 FROM document_embeddings de WHERE de.document_id = d.id
       )
     ORDER BY d.created_at DESC
     LIMIT $1`,
    [limit]
  );

  console.log(`Found ${docsResult.rows.length} documents to embed\n`);

  let successCount = 0;
  let errorCount = 0;
  let totalChunks = 0;

  for (let i = 0; i < docsResult.rows.length; i++) {
    const doc = docsResult.rows[i];

    try {
      console.log(`[${i + 1}/${docsResult.rows.length}] ${doc.title}`);

      // Split content into chunks if too long
      const chunks = [];
      const content = doc.content;

      if (content.length <= CHUNK_SIZE) {
        chunks.push(content);
      } else {
        // Split by paragraphs or sentences
        let start = 0;
        while (start < content.length) {
          let end = start + CHUNK_SIZE;
          if (end < content.length) {
            // Try to find paragraph break
            const paraBreak = content.lastIndexOf('\n\n', end);
            if (paraBreak > start + CHUNK_SIZE * 0.5) {
              end = paraBreak;
            } else {
              // Try sentence break
              const sentBreak = content.lastIndexOf('. ', end);
              if (sentBreak > start + CHUNK_SIZE * 0.5) {
                end = sentBreak + 1;
              }
            }
          }
          chunks.push(content.substring(start, end).trim());
          start = end;
        }
      }

      console.log(`  Chunks: ${chunks.length}`);

      // Generate embeddings for each chunk
      for (let j = 0; j < chunks.length; j++) {
        const chunk = chunks[j];
        const chunkText = chunk.substring(0, 8000); // OpenAI limit

        const response = await openai.embeddings.create({
          model: EMBEDDING_MODEL,
          input: chunkText,
        });

        const embedding = response.data[0].embedding;

        // Save to document_embeddings table
        await pool.query(
          `INSERT INTO document_embeddings (document_id, chunk_index, chunk_text, embedding, model, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (document_id, chunk_index) DO UPDATE
           SET chunk_text = $3, embedding = $4, model = $5, created_at = NOW()`,
          [doc.id, j, chunkText.substring(0, 2000), JSON.stringify(embedding), EMBEDDING_MODEL]
        );

        totalChunks++;
      }

      // Update document status
      await pool.query(
        `UPDATE documents
         SET processing_status = 'embedded',
             metadata = jsonb_set(
               COALESCE(metadata, '{}'),
               '{embedding}',
               $1::jsonb
             ),
             updated_at = NOW()
         WHERE id = $2`,
        [
          JSON.stringify({
            embedded: true,
            model: EMBEDDING_MODEL,
            chunks: chunks.length,
            embeddedAt: new Date().toISOString()
          }),
          doc.id
        ]
      );

      successCount++;
      console.log(`  ✓ Embedded ${chunks.length} chunks`);

      // Rate limit: ~50 requests/min for OpenAI
      if (i % BATCH_SIZE === BATCH_SIZE - 1) {
        console.log(`  [Pause 2s for rate limit...]`);
        await new Promise(r => setTimeout(r, 2000));
      }

    } catch (error) {
      console.log(`  ✗ Error: ${error.message}`);
      errorCount++;
    }
  }

  console.log(`\n=== COMPLETED ===`);
  console.log(`Success: ${successCount} documents`);
  console.log(`Errors: ${errorCount} documents`);
  console.log(`Total chunks: ${totalChunks}`);
  console.log(`\nTo embed more: node batch_embed_documents.js 500`);

  await pool.end();
})();
