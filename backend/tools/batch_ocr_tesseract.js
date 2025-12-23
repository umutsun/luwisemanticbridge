/**
 * Batch OCR Script using Tesseract (Free)
 * Extracts text from PDFs without content
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// PDF to image conversion (requires pdftoppm)
const pdfToImage = async (pdfPath, outputDir) => {
  const baseName = path.basename(pdfPath, '.pdf');
  const outputPath = path.join(outputDir, baseName);

  try {
    // Convert PDF to PNG images (one per page)
    execSync(`pdftoppm -png -r 300 "${pdfPath}" "${outputPath}"`, { timeout: 60000 });

    // Find all generated images
    const images = fs.readdirSync(outputDir)
      .filter(f => f.startsWith(baseName) && f.endsWith('.png'))
      .sort()
      .map(f => path.join(outputDir, f));

    return images;
  } catch (error) {
    console.error(`Error converting PDF: ${error.message}`);
    return [];
  }
};

// OCR single image with Tesseract
const ocrImage = (imagePath, lang = 'tur+eng') => {
  try {
    const result = execSync(`tesseract "${imagePath}" stdout -l ${lang}`, {
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
      timeout: 120000 // 2 min timeout
    });
    return result.toString('utf-8').trim();
  } catch (error) {
    console.error(`OCR error for ${imagePath}: ${error.message}`);
    return '';
  }
};

// PDF text extraction without OCR (for PDFs with embedded text)
const extractPdfText = async (pdfPath) => {
  try {
    // Try pdftotext first (faster for text-based PDFs)
    const result = execSync(`pdftotext -enc UTF-8 "${pdfPath}" -`, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000
    });
    return result.toString('utf-8').trim();
  } catch (error) {
    return '';
  }
};

(async () => {
  console.log('\n=== BATCH OCR EXTRACTION (Tesseract) ===\n');

  // Load config
  const env = fs.readFileSync('.env', 'utf-8');
  const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
  const pool = new Pool({ connectionString: dbUrl });

  // Get limit from args
  const limit = parseInt(process.argv[2]) || 50;
  const skipExisting = process.argv.includes('--skip-existing');

  // Create temp directory for image conversion
  const tempDir = '/tmp/ocr_batch_' + Date.now();
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  console.log(`Max documents: ${limit}`);
  console.log(`Temp directory: ${tempDir}`);
  console.log(`Skip existing content: ${skipExisting}\n`);

  // Get PDFs without content
  const query = `
    SELECT id, title, file_path, file_type, processing_status
    FROM documents
    WHERE (file_type ILIKE '%pdf%' OR type ILIKE '%pdf%')
      AND (content IS NULL OR LENGTH(content) < 100)
      AND file_path IS NOT NULL
    ORDER BY created_at DESC
    LIMIT $1
  `;

  const docs = await pool.query(query, [limit]);
  console.log(`Found ${docs.rows.length} PDFs without content\n`);

  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < docs.rows.length; i++) {
    const doc = docs.rows[i];
    const pdfPath = doc.file_path;

    console.log(`[${i + 1}/${docs.rows.length}] ${doc.title}`);

    // Check if file exists
    if (!fs.existsSync(pdfPath)) {
      console.log(`  ❌ File not found: ${pdfPath}`);
      errorCount++;
      continue;
    }

    try {
      let extractedText = '';

      // Step 1: Try direct text extraction (for text-based PDFs)
      console.log('  → Trying direct text extraction...');
      extractedText = await extractPdfText(pdfPath);

      if (extractedText.length > 100) {
        console.log(`  ✓ Direct extraction: ${extractedText.length} chars`);
      } else {
        // Step 2: OCR if direct extraction failed
        console.log('  → No embedded text, trying OCR...');

        // Convert PDF to images
        const images = await pdfToImage(pdfPath, tempDir);

        if (images.length === 0) {
          console.log('  ❌ Failed to convert PDF to images');
          errorCount++;
          continue;
        }

        console.log(`  → Processing ${images.length} pages...`);

        // OCR each page
        const pageTexts = [];
        for (let j = 0; j < images.length; j++) {
          const pageText = ocrImage(images[j]);
          if (pageText) {
            pageTexts.push(pageText);
          }

          // Clean up image after processing
          try { fs.unlinkSync(images[j]); } catch {}
        }

        extractedText = pageTexts.join('\n\n--- Page Break ---\n\n');
        console.log(`  ✓ OCR: ${extractedText.length} chars from ${images.length} pages`);
      }

      if (extractedText.length < 50) {
        console.log('  ⚠️  Insufficient text extracted, skipping...');
        skippedCount++;
        continue;
      }

      // Update database
      await pool.query(
        `UPDATE documents
         SET content = $1,
             processing_status = 'analyzed',
             updated_at = NOW()
         WHERE id = $2`,
        [extractedText, doc.id]
      );

      console.log(`  ✅ Saved ${extractedText.length} chars to database`);
      successCount++;

    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
      errorCount++;
    }
  }

  // Cleanup temp directory
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}

  console.log('\n=== COMPLETED ===');
  console.log(`Success: ${successCount} documents`);
  console.log(`Errors: ${errorCount} documents`);
  console.log(`Skipped: ${skippedCount} documents`);
  console.log(`\nTo process more: node batch_ocr_tesseract.js 100\n`);

  await pool.end();
  process.exit(0);
})();
