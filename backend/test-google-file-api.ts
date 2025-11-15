/**
 * Google File Search API Test Script
 * Tests Gemini File Manager functionality
 *
 * Usage: npx ts-node test-google-file-api.ts <pdf-path>
 */

import { GoogleGenerativeAI, GoogleAIFileManager } from '@google/generative-ai';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '../.env.lsemb' });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY not found in environment variables');
  process.exit(1);
}

/**
 * Test Google File API with a PDF
 */
async function testGoogleFileAPI(pdfPath: string) {
  console.log('🧪 Google File Search API Test');
  console.log('===============================\n');

  const fileManager = new GoogleAIFileManager(GEMINI_API_KEY);
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

  try {
    // Check if file exists
    if (!fs.existsSync(pdfPath)) {
      console.error(`❌ File not found: ${pdfPath}`);
      process.exit(1);
    }

    const fileStats = fs.statSync(pdfPath);
    const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);

    console.log(`📄 File: ${path.basename(pdfPath)}`);
    console.log(`📊 Size: ${fileSizeMB} MB\n`);

    // ===== STEP 1: Upload File =====
    console.log('⬆️  STEP 1: Uploading file to Gemini File API...');
    const startUpload = Date.now();

    const uploadResponse = await fileManager.uploadFile(pdfPath, {
      mimeType: 'application/pdf',
      displayName: path.basename(pdfPath)
    });

    const uploadTime = Date.now() - startUpload;

    console.log(`✅ Upload successful (${uploadTime}ms)`);
    console.log(`   File URI: ${uploadResponse.file.uri}`);
    console.log(`   File Name: ${uploadResponse.file.name}`);
    console.log(`   State: ${uploadResponse.file.state}`);
    console.log(`   Size: ${uploadResponse.file.sizeBytes} bytes\n`);

    // ===== STEP 2: Wait for Processing =====
    console.log('⏳ STEP 2: Waiting for file processing...');

    let file = await fileManager.getFile(uploadResponse.file.name);
    let attempts = 0;
    const maxAttempts = 30; // 60s max wait

    while (file.state === 'PROCESSING' && attempts < maxAttempts) {
      process.stdout.write(`   Attempt ${attempts + 1}/${maxAttempts}: ${file.state}...\r`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      file = await fileManager.getFile(uploadResponse.file.name);
      attempts++;
    }

    console.log(''); // New line after progress

    if (file.state === 'FAILED') {
      throw new Error('❌ File processing FAILED');
    }

    if (file.state === 'PROCESSING') {
      throw new Error('❌ File processing TIMEOUT');
    }

    console.log(`✅ File ready: ${file.state}\n`);

    // ===== STEP 3: Test OCR Extraction =====
    console.log('📖 STEP 3: Extracting text with Gemini Vision...');
    const startOCR = Date.now();

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const prompt = `Extract ALL text from this PDF.
Preserve formatting and structure.
Detect tables, charts, music notation if present.
Also provide a brief summary of document type.`;

    const result = await model.generateContent([
      {
        fileData: {
          mimeType: uploadResponse.file.mimeType,
          fileUri: uploadResponse.file.uri
        }
      },
      { text: prompt }
    ]);

    const extractedText = result.response.text();
    const ocrTime = Date.now() - startOCR;

    console.log(`✅ Text extraction complete (${ocrTime}ms)`);
    console.log(`   Extracted ${extractedText.length} characters`);
    console.log(`   First 500 chars:\n`);
    console.log('   ' + '─'.repeat(60));
    console.log(extractedText.substring(0, 500).split('\n').map(l => '   ' + l).join('\n'));
    console.log('   ' + '─'.repeat(60));
    console.log('');

    // ===== STEP 4: Test Metadata Analysis =====
    console.log('🔍 STEP 4: Testing metadata extraction...');
    const startMetadata = Date.now();

    const metadataPrompt = `Analyze this document and extract metadata in JSON format:
{
  "documentType": "legal|novel|research|invoice|sheet_music|other",
  "title": "document title",
  "language": "en|tr|other",
  "pageCount": estimated_pages,
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "hasTables": true/false,
  "hasCharts": true/false,
  "hasMusicalNotation": true/false,
  "summary": "brief summary"
}`;

    const metadataResult = await model.generateContent([
      {
        fileData: {
          mimeType: uploadResponse.file.mimeType,
          fileUri: uploadResponse.file.uri
        }
      },
      { text: metadataPrompt }
    ]);

    const metadataText = metadataResult.response.text();
    const metadataTime = Date.now() - startMetadata;

    console.log(`✅ Metadata extraction complete (${metadataTime}ms)`);

    try {
      // Try to parse JSON from response
      const jsonMatch = metadataText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const metadata = JSON.parse(jsonMatch[0]);
        console.log('   Parsed metadata:');
        console.log(JSON.stringify(metadata, null, 2).split('\n').map(l => '   ' + l).join('\n'));
      } else {
        console.log('   Raw response:', metadataText.substring(0, 300));
      }
    } catch (e) {
      console.log('   Raw response:', metadataText.substring(0, 300));
    }
    console.log('');

    // ===== STEP 5: List Files =====
    console.log('📂 STEP 5: Listing files in Gemini File Manager...');
    const listResponse = await fileManager.listFiles();

    console.log(`   Total files: ${listResponse.files.length}`);
    listResponse.files.slice(0, 3).forEach((f, idx) => {
      console.log(`   ${idx + 1}. ${f.displayName} (${f.state}) - ${f.uri}`);
    });
    console.log('');

    // ===== STEP 6: Cleanup =====
    console.log('🧹 STEP 6: Cleaning up...');
    await fileManager.deleteFile(uploadResponse.file.name);
    console.log(`✅ Deleted file: ${uploadResponse.file.name}\n`);

    // ===== SUMMARY =====
    console.log('📊 PERFORMANCE SUMMARY');
    console.log('===============================');
    console.log(`Upload Time:    ${uploadTime}ms`);
    console.log(`OCR Time:       ${ocrTime}ms`);
    console.log(`Metadata Time:  ${metadataTime}ms`);
    console.log(`Total Time:     ${Date.now() - startUpload}ms\n`);

    console.log('✅ All tests passed! Google File API is working correctly.\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Main execution
const pdfPath = process.argv[2];

if (!pdfPath) {
  console.log('Usage: npx ts-node test-google-file-api.ts <pdf-path>');
  console.log('\nExample:');
  console.log('  npx ts-node test-google-file-api.ts "C:\\Users\\Documents\\test.pdf"');
  process.exit(1);
}

testGoogleFileAPI(pdfPath);
