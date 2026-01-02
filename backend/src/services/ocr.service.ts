import { createWorker } from 'tesseract.js';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

// Lazy loading için pdf-poppler import'unu dinamik yap
let pdfPoppler: any = null;
const loadPdfPoppler = async () => {
  if (!pdfPoppler) {
    try {
      pdfPoppler = await import('pdf-poppler');
    } catch (error) {
      console.warn('️ pdf-poppler could not be loaded. PDF OCR will not work.', error.message);
      throw new Error('PDF OCR is not available on this system');
    }
  }
  return pdfPoppler;
};

export class OCRService {
  private static instance: OCRService;
  private workers: Map<string, any> = new Map();

  public static getInstance(): OCRService {
    if (!OCRService.instance) {
      OCRService.instance = new OCRService();
    }
    return OCRService.instance;
  }

  /**
   * Extract text from PDF file using OCR
   */
  async extractFromPDF(filePath: string, options: { language?: string } = {}): Promise<{ text: string; confidence: number }> {
    const { language = 'tur+eng' } = options;

    try {
      // Try using pdf-parse first for simple text extraction
      try {
        const pdfParse = require('pdf-parse');
        const dataBuffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(dataBuffer);

        if (pdfData.text && pdfData.text.trim().length > 0) {
          console.log(`[OCR] Extracted ${pdfData.text.length} characters from PDF using pdf-parse`);
          return {
            text: pdfData.text.trim(),
            confidence: 90
          };
        }
      } catch (pdfParseError) {
        console.log(`[OCR] pdf-parse failed: ${pdfParseError.message}`);
      }

      // If pdf-parse fails, return empty content - document needs manual OCR analysis
      const fileName = path.basename(filePath);
      console.log(`[OCR] pdf-parse returned no text for ${fileName} - requires Gemini Vision OCR`);

      return {
        text: '', // Empty content - will show as "pending" not "embedded"
        confidence: 0
      };
    } catch (error: any) {
      console.error('PDF OCR error:', error);
      // Don't throw - return empty content so import can continue
      const fileName = path.basename(filePath);
      console.log(`[OCR] Failed to extract from ${fileName}: ${error.message}`);
      return {
        text: '', // Empty content - document needs manual analysis
        confidence: 0
      };
    }
  }

  /**
   * Extract text from image file
   */
  async extractFromImage(imagePath: string, options: { language?: string } = {}): Promise<{ text: string; confidence: number }> {
    const { language = 'tur+eng' } = options;

    try {
      // Optimize image for OCR
      const optimizedPath = imagePath.replace(/(\.[^.]+)$/, '_optimized$1');
      await sharp(imagePath)
        .grayscale()
        .normalize()
        .sharpen()
        .toFile(optimizedPath);

      // Create worker for this language
      const worker = await createWorker(language, 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
          }
        }
      });

      // Perform OCR
      const { data: { text, confidence } } = await worker.recognize(optimizedPath);

      // Cleanup
      await worker.terminate();
      if (optimizedPath !== imagePath) {
        fs.unlinkSync(optimizedPath);
      }

      return {
        text: text.trim(),
        confidence
      };
    } catch (error) {
      console.error('Image OCR error:', error);
      throw new Error(`Failed to extract text from image: ${error.message}`);
    }
  }

  /**
   * Process document based on file type
   */
  async processDocument(filePath: string, mimeType: string): Promise<{ text: string; confidence: number; type: string }> {
    const ext = path.extname(filePath).toLowerCase();

    // For text-based files, read directly
    if (['.txt', '.md', '.csv', '.json'].includes(ext)) {
      const text = fs.readFileSync(filePath, 'utf-8');
      return {
        text,
        confidence: 100,
        type: 'text'
      };
    }

    // For images, use OCR
    if (['.png', '.jpg', '.jpeg', '.tiff', '.bmp'].includes(ext)) {
      return {
        ...(await this.extractFromImage(filePath)),
        type: 'image'
      };
    }

    // For PDFs, use PDF OCR
    if (ext === '.pdf') {
      return {
        ...(await this.extractFromPDF(filePath)),
        type: 'pdf'
      };
    }

    // For other formats (docx, xlsx, etc.), return placeholder
    return {
      text: `[Document type ${mimeType} requires additional processing]`,
      confidence: 0,
      type: 'unsupported'
    };
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages(): { code: string; name: string }[] {
    return [
      { code: 'tur', name: 'Turkish' },
      { code: 'eng', name: 'English' },
      { code: 'tur+eng', name: 'Turkish + English' },
      { code: 'deu', name: 'German' },
      { code: 'fra', name: 'French' },
      { code: 'spa', name: 'Spanish' },
      { code: 'ita', name: 'Italian' },
      { code: 'rus', name: 'Russian' }
    ];
  }
}

export const ocrService = OCRService.getInstance();