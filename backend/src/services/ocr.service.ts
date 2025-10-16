import { createWorker } from 'tesseract.js';
import path from 'path';
import fs from 'fs';
import { convert } from 'pdf-poppler';
import sharp from 'sharp';

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
      // Create temp directory for PDF pages
      const tempDir = path.join(process.cwd(), 'temp', 'ocr', Date.now().toString());
      fs.mkdirSync(tempDir, { recursive: true });

      // Convert PDF to images
      const images = await convert(filePath, {
        format: 'png',
        out_dir: tempDir,
        out_prefix: 'page'
      });

      if (!images || images.length === 0) {
        throw new Error('Failed to convert PDF to images');
      }

      // Process each page with OCR
      let fullText = '';
      let totalConfidence = 0;
      let pageProcessed = 0;

      for (const imagePath of images.path) {
        try {
          const result = await this.extractFromImage(imagePath, { language });
          fullText += result.text + '\n\n';
          totalConfidence += result.confidence;
          pageProcessed++;
        } catch (error) {
          console.error(`Error processing page ${imagePath}:`, error);
        }
      }

      // Clean up temp files
      fs.rmSync(tempDir, { recursive: true, force: true });

      const avgConfidence = pageProcessed > 0 ? totalConfidence / pageProcessed : 0;

      return {
        text: fullText.trim(),
        confidence: avgConfidence
      };
    } catch (error) {
      console.error('PDF OCR error:', error);
      throw new Error(`Failed to extract text from PDF: ${error.message}`);
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