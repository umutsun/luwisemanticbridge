import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import fs from 'fs';

// Lazy loading için pdf-poppler import
let pdfPoppler: any = null;
const loadPdfPoppler = async () => {
  if (!pdfPoppler) {
    try {
      pdfPoppler = await import('pdf-poppler');
    } catch (error) {
      console.warn('️ pdf-poppler could not be loaded. Vision OCR will not work.', error.message);
      throw new Error('Vision OCR is not available on this system');
    }
  }
  return pdfPoppler;
};

export interface VisionOCRResult {
  text: string;
  visualElements: {
    type: string; // 'table' | 'chart' | 'map' | 'music_notation' | 'diagram' | 'formula'
    description: string;
    extractedData?: any;
  }[];
  confidence: number;
  analysis: string;
}

export class VisionOCRService {
  private static instance: VisionOCRService;
  private genAI: GoogleGenerativeAI | null = null;

  public static getInstance(): VisionOCRService {
    if (!VisionOCRService.instance) {
      VisionOCRService.instance = new VisionOCRService();
    }
    return VisionOCRService.instance;
  }

  private constructor() {
    // Initialize Gemini API
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      console.log(' Vision OCR Service initialized with Gemini 2.0 Flash');
    } else {
      console.warn('️ GEMINI_API_KEY not found. Vision OCR will not work.');
    }
  }

  /**
   * Process PDF with Gemini Vision API - analyzes charts, tables, music notation, maps, etc.
   */
  async processPDFWithVision(
    filePath: string,
    options: {
      template?: string;
      focusKeywords?: string[];
      language?: 'turkish' | 'english' | 'auto';
      apiKey?: string;
    } = {}
  ): Promise<VisionOCRResult> {
    // Use provided API key or fallback to instance genAI
    const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey && !this.genAI) {
      throw new Error('Gemini API not initialized. Provide apiKey parameter or set GEMINI_API_KEY environment variable.');
    }

    const { template = 'general', focusKeywords = [], language = 'auto' } = options;

    // Use genAI from instance or create new one with provided key
    const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : this.genAI;

    try {
      console.log(` [Vision OCR] Starting analysis for: ${path.basename(filePath)}`);
      console.log(`   Template: ${template}, Language: ${language}`);

      // Create temp directory for PDF pages
      const tempDir = path.join(process.cwd(), 'temp', 'vision-ocr', Date.now().toString());
      fs.mkdirSync(tempDir, { recursive: true });

      // Convert PDF to images
      const poppler = await loadPdfPoppler();
      const result = await poppler.convert(filePath, {
        format: 'png',
        out_dir: tempDir,
        out_prefix: 'page',
        scale: 2048 // High resolution for better OCR
      });

      if (!result || !fs.readdirSync(tempDir).length) {
        throw new Error('Failed to convert PDF to images');
      }

      // Get all generated PNG files
      const imageFiles = fs.readdirSync(tempDir)
        .filter(f => f.endsWith('.png'))
        .map(f => path.join(tempDir, f))
        .sort();

      console.log(`   Converted to ${imageFiles.length} page(s)`);

      // Process each page with Gemini Vision
      const model = genAI!.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

      let fullText = '';
      const visualElements: VisionOCRResult['visualElements'] = [];
      let totalPages = imageFiles.length;

      for (let i = 0; i < imageFiles.length; i++) {
        const imagePath = imageFiles[i];
        console.log(`    Processing page ${i + 1}/${totalPages}...`);

        try {
          // Read image as base64
          const imageBuffer = fs.readFileSync(imagePath);
          const imageBase64 = imageBuffer.toString('base64');

          // Build context-aware prompt
          const prompt = this.buildVisionPrompt(template, focusKeywords, language);

          // Send to Gemini Vision API
          const result = await model.generateContent([
            prompt,
            {
              inlineData: {
                mimeType: 'image/png',
                data: imageBase64
              }
            }
          ]);

          const response = await result.response;
          const pageText = response.text();

          // Parse response (looking for structured markers)
          const parsed = this.parseVisionResponse(pageText);

          fullText += `\n\n--- PAGE ${i + 1} ---\n${parsed.text}`;
          visualElements.push(...parsed.visualElements);

        } catch (error) {
          console.error(`    Error processing page ${i + 1}:`, error.message);
          fullText += `\n\n--- PAGE ${i + 1} (ERROR) ---\nFailed to process page.`;
        }
      }

      // Clean up temp files
      fs.rmSync(tempDir, { recursive: true, force: true });

      console.log(` [Vision OCR] Completed analysis`);
      console.log(`   Extracted text length: ${fullText.length} chars`);
      console.log(`   Visual elements found: ${visualElements.length}`);

      return {
        text: fullText.trim(),
        visualElements,
        confidence: 95, // Gemini Vision is highly accurate
        analysis: `Processed ${totalPages} page(s) with Gemini Vision API. Found ${visualElements.length} visual element(s).`
      };

    } catch (error) {
      console.error(' [Vision OCR] Error:', error);
      throw new Error(`Vision OCR failed: ${error.message}`);
    }
  }

  /**
   * Build context-aware prompt based on template type
   */
  private buildVisionPrompt(template: string, focusKeywords: string[], language: string): string {
    const langInstruction = language === 'turkish'
      ? 'Extract text in Turkish. Preserve Turkish characters (ç, ğ, ı, ö, ş, ü).'
      : language === 'english'
      ? 'Extract text in English.'
      : 'Detect language automatically and extract text.';

    const basePrompt = `Analyze this document page and extract ALL content:

EXTRACTION REQUIREMENTS:
${langInstruction}

1. TEXT EXTRACTION:
   - Extract all visible text exactly as it appears
   - Preserve formatting, line breaks, and structure
   - Include headers, footers, captions

2. VISUAL ELEMENTS:
   Identify and describe any of the following:
   -  TABLES: Extract table structure and data
   -  CHARTS/GRAPHS: Describe type, data, and insights
   -  MUSICAL NOTATION: Describe notes, clefs, time signatures, lyrics
   - ️ MAPS: Describe locations, labels, landmarks
   -  FORMULAS/EQUATIONS: Extract mathematical notation
   -  DIAGRAMS/FLOWCHARTS: Describe structure and connections
   - ️ IMAGES: Describe visual content

3. OUTPUT FORMAT:
Return your analysis in this structure:
---TEXT---
[All extracted text here]

---VISUAL_ELEMENTS---
[For each visual element, use format:]
TYPE: [table/chart/music_notation/map/diagram/formula]
DESCRIPTION: [Detailed description]
DATA: [Structured data if applicable]
---END_VISUAL---
`;

    // Add template-specific instructions
    if (template === 'sheet_music') {
      return basePrompt + `\n\n SPECIAL FOCUS: MUSICAL NOTATION
- Extract musical key/makam (for Turkish music)
- Extract time signature/usul
- Extract tempo markings
- Extract ALL lyrics with line breaks preserved
- Identify instruments
- Describe melodic patterns
- Note chord progressions if visible`;
    }

    if (template === 'invoice' || template === 'financial_report') {
      return basePrompt + `\n\n SPECIAL FOCUS: FINANCIAL DATA
- Extract all numbers, amounts, currencies
- Extract table data (line items, totals, subtotals)
- Extract dates, invoice numbers, reference codes
- Extract company names, addresses, tax IDs`;
    }

    if (template === 'research') {
      return basePrompt + `\n\n SPECIAL FOCUS: RESEARCH CONTENT
- Extract all charts, graphs with data points
- Extract formulas and equations
- Extract table data
- Extract references, citations
- Describe diagrams and illustrations`;
    }

    if (focusKeywords.length > 0) {
      return basePrompt + `\n\n SPECIAL FOCUS KEYWORDS: ${focusKeywords.join(', ')}
Pay special attention to content related to these keywords.`;
    }

    return basePrompt;
  }

  /**
   * Parse Gemini's response to extract structured data
   */
  private parseVisionResponse(response: string): {
    text: string;
    visualElements: VisionOCRResult['visualElements'];
  } {
    const visualElements: VisionOCRResult['visualElements'] = [];

    // Split by markers
    const textMatch = response.match(/---TEXT---([\s\S]*?)(?=---VISUAL_ELEMENTS---|$)/);
    const visualMatch = response.match(/---VISUAL_ELEMENTS---([\s\S]*?)(?=$)/);

    let text = textMatch ? textMatch[1].trim() : response;

    // Parse visual elements
    if (visualMatch) {
      const visualContent = visualMatch[1];
      const elements = visualContent.split('---END_VISUAL---');

      for (const elem of elements) {
        const typeMatch = elem.match(/TYPE:\s*(\w+)/);
        const descMatch = elem.match(/DESCRIPTION:\s*([^\n]+)/);
        const dataMatch = elem.match(/DATA:\s*([\s\S]+?)(?=TYPE:|$)/);

        if (typeMatch && descMatch) {
          visualElements.push({
            type: typeMatch[1].toLowerCase(),
            description: descMatch[1].trim(),
            extractedData: dataMatch ? dataMatch[1].trim() : undefined
          });
        }
      }
    }

    return { text, visualElements };
  }

  /**
   * Process single image with Gemini Vision
   */
  async processImageWithVision(
    imagePath: string,
    options: { prompt?: string } = {}
  ): Promise<string> {
    if (!this.genAI) {
      throw new Error('Gemini API not initialized');
    }

    const { prompt = 'Extract all text and describe any visual elements (charts, diagrams, etc.) you see in this image.' } = options;

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

      // Read image as base64
      const imageBuffer = fs.readFileSync(imagePath);
      const imageBase64 = imageBuffer.toString('base64');

      // Determine MIME type
      const ext = path.extname(imagePath).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';

      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            mimeType,
            data: imageBase64
          }
        }
      ]);

      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Vision image processing error:', error);
      throw new Error(`Failed to process image: ${error.message}`);
    }
  }
}

export const visionOCRService = VisionOCRService.getInstance();
