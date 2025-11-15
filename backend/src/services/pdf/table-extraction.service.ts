/**
 * Advanced Table Extraction Service
 * Detects and extracts complex table structures from PDFs
 * Supports multiple OCR providers for maximum accuracy
 */

import * as fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface TableData {
  id: string;
  title?: string;
  headers: string[];
  rows: string[][];
  confidence: number;
  position?: {
    page: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
  metadata: {
    rowCount: number;
    columnCount: number;
    hasHeaders: boolean;
    extractionMethod: 'regex' | 'ocr' | 'multimodal';
    provider?: 'deepseek' | 'google' | 'local';
  };
}

export interface TableExtractionResult {
  tables: TableData[];
  summary: {
    totalTables: number;
    highConfidenceTables: number;
    extractionMethods: string[];
    processingTime: number;
  };
}

class TableExtractionService {

  /**
   * Extract tables from PDF text using multiple methods
   */
  async extractTables(
    filePath: string,
    pdfText: string,
    options: {
      apiKey?: string;
      deepseekApiKey?: string;
      useOCR?: boolean;
      useMultimodal?: boolean;
    } = {}
  ): Promise<TableExtractionResult> {
    const startTime = Date.now();
    const tables: TableData[] = [];
    const extractionMethods: string[] = [];

    console.log(`[Table Extraction] Starting analysis for ${filePath}`);

    // Method 1: Local text-based extraction (fastest)
    console.log(`[Table Extraction] Method 1: Local regex-based extraction`);
    const localTables = this.extractTablesFromText(pdfText);
    tables.push(...localTables);
    if (localTables.length > 0) extractionMethods.push('regex');

    // Method 2: OCR-based extraction if needed
    if (options.useOCR && options.deepseekApiKey && localTables.length < 2) {
      console.log(`[Table Extraction] Method 2: DeepSeek OCR extraction`);
      try {
        const ocrTables = await this.extractTablesWithOCR(filePath, options.deepseekApiKey);
        tables.push(...ocrTables);
        if (ocrTables.length > 0) extractionMethods.push('ocr');
      } catch (error) {
        console.warn('[Table Extraction] OCR extraction failed:', error.message);
      }
    }

    // Method 3: Multimodal analysis for complex structures
    if (options.useMultimodal && options.apiKey && tables.length < 3) {
      console.log(`[Table Extraction] Method 3: Google multimodal analysis`);
      try {
        const multimodalTables = await this.extractTablesWithMultimodal(filePath, options.apiKey, pdfText);
        tables.push(...multimodalTables);
        if (multimodalTables.length > 0) extractionMethods.push('multimodal');
      } catch (error) {
        console.warn('[Table Extraction] Multimodal extraction failed:', error.message);
      }
    }

    // Remove duplicates and merge results
    const uniqueTables = this.deduplicateTables(tables);
    const highConfidenceTables = uniqueTables.filter(t => t.confidence > 0.7);

    const result: TableExtractionResult = {
      tables: uniqueTables,
      summary: {
        totalTables: uniqueTables.length,
        highConfidenceTables: highConfidenceTables.length,
        extractionMethods,
        processingTime: Date.now() - startTime
      }
    };

    console.log(`[Table Extraction] Complete: ${result.summary.totalTables} tables found (${result.summary.processingTime}ms)`);

    return result;
  }

  /**
   * Extract tables from plain text using advanced regex patterns
   */
  private extractTablesFromText(text: string): TableData[] {
    const tables: TableData[] = [];
    const lines = text.split('\n');

    // Pattern 1: Pipe-separated tables
    const pipeTablePattern = /^\|(.+)\|$/;
    const pipeTables = this.extractPipeTables(lines, pipeTablePattern);
    tables.push(...pipeTables);

    // Pattern 2: Tab-separated tables
    const tabTables = this.extractTabSeparatedTables(lines);
    tables.push(...tabTables);

    // Pattern 3: Aligned column tables (space-separated but aligned)
    const alignedTables = this.extractAlignedTables(lines);
    tables.push(...alignedTables);

    // Pattern 4: Markdown-style tables
    const markdownTables = this.extractMarkdownTables(lines);
    tables.push(...markdownTables);

    return tables.filter(t => t.rows.length > 0 && t.headers.length > 0);
  }

  /**
   * Extract pipe-separated tables
   */
  private extractPipeTables(lines: string[], pattern: RegExp): TableData[] {
    const tables: TableData[] = [];
    let currentTable: string[][] = [];
    let inTable = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (pattern.test(line)) {
        // Extract content between pipes
        const cells = line.split('|')
          .map(cell => cell.trim())
          .filter(cell => cell.length > 0);

        if (cells.length > 1) {
          currentTable.push(cells);
          inTable = true;
        }
      } else if (inTable && line.length === 0) {
        // End of table
        if (currentTable.length >= 2) {
          const table = this.createTableFromMatrix(currentTable, 'regex', 'local');
          if (table) tables.push(table);
        }
        currentTable = [];
        inTable = false;
      }
    }

    // Handle table at end of text
    if (currentTable.length >= 2) {
      const table = this.createTableFromMatrix(currentTable, 'regex', 'local');
      if (table) tables.push(table);
    }

    return tables;
  }

  /**
   * Extract tab-separated tables
   */
  private extractTabSeparatedTables(lines: string[]): TableData[] {
    const tables: TableData[] = [];
    let currentTable: string[][] = [];
    let inTable = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const tabs = line.split('\t');

      if (tabs.length > 3 && tabs.every(cell => cell.trim().length > 0 || cell === tabs[0])) {
        currentTable.push(tabs.map(cell => cell.trim()));
        inTable = true;
      } else if (inTable && line.trim().length === 0) {
        if (currentTable.length >= 2) {
          const table = this.createTableFromMatrix(currentTable, 'regex', 'local');
          if (table) tables.push(table);
        }
        currentTable = [];
        inTable = false;
      }
    }

    if (currentTable.length >= 2) {
      const table = this.createTableFromMatrix(currentTable, 'regex', 'local');
      if (table) tables.push(table);
    }

    return tables;
  }

  /**
   * Extract aligned column tables (detect alignment by spaces)
   */
  private extractAlignedTables(lines: string[]): TableData[] {
    const tables: TableData[] = [];

    // Look for patterns where spaces align vertically
    for (let i = 0; i < lines.length - 2; i++) {
      const line1 = lines[i];
      const line2 = lines[i + 1];
      const line3 = lines[i + 2];

      // Detect if we have aligned columns
      if (this.hasAlignedColumns(line1, line2, line3)) {
        const tableLines = [line1, line2, line3];

        // Continue collecting aligned lines
        for (let j = i + 3; j < lines.length; j++) {
          if (this.hasAlignedColumns(lines[j - 2], lines[j - 1], lines[j])) {
            tableLines.push(lines[j]);
          } else {
            break;
          }
        }

        const tableMatrix = tableLines.map(line =>
          line.split(/\s{2,}/).map(cell => cell.trim()).filter(cell => cell.length > 0)
        );

        const table = this.createTableFromMatrix(tableMatrix, 'regex', 'local');
        if (table) tables.push(table);

        i += tableLines.length - 1;
      }
    }

    return tables;
  }

  /**
   * Extract Markdown-style tables
   */
  private extractMarkdownTables(lines: string[]): TableData[] {
    const tables: TableData[] = [];
    let currentTable: string[][] = [];
    let inTable = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.includes('|')) {
        const cells = line.split('|')
          .map(cell => cell.trim())
          .filter(cell => cell.length > 0);

        if (cells.length > 1) {
          // Skip separator lines (|---|---|)
          if (!cells.every(cell => /^-+$/.test(cell))) {
            currentTable.push(cells);
            inTable = true;
          }
        }
      } else if (inTable) {
        if (currentTable.length >= 2) {
          const table = this.createTableFromMatrix(currentTable, 'regex', 'local');
          if (table) tables.push(table);
        }
        currentTable = [];
        inTable = false;
      }
    }

    if (currentTable.length >= 2) {
      const table = this.createTableFromMatrix(currentTable, 'regex', 'local');
      if (table) tables.push(table);
    }

    return tables;
  }

  /**
   * Check if lines have aligned columns
   */
  private hasAlignedColumns(...lines: string[]): boolean {
    if (lines.length < 2) return false;

    // Find consistent column positions
    const columnPositions = new Map<number, number>();

    lines.forEach(line => {
      const words = line.split(/\s+/);
      let pos = 0;
      words.forEach((word, idx) => {
        if (idx > 0) {
          const currentPos = line.indexOf(word, pos);
          columnPositions.set(idx, (columnPositions.get(idx) || 0) + 1);
          pos = currentPos;
        }
      });
    });

    // Check if we have consistent alignments
    let alignedColumns = 0;
    columnPositions.forEach((count, idx) => {
      if (count === lines.length) alignedColumns++;
    });

    return alignedColumns >= 2;
  }

  /**
   * Create TableData object from matrix
   */
  private createTableFromMatrix(
    matrix: string[][],
    extractionMethod: 'regex' | 'ocr' | 'multimodal',
    provider: string
  ): TableData | null {
    if (matrix.length < 2) return null;

    // Determine headers (first row or second row if first is headers)
    const headers = matrix[0];
    const rows = matrix.slice(1);

    // Calculate confidence based on consistency
    const columnCount = headers.length;
    let consistentRows = 0;

    rows.forEach(row => {
      if (row.length === columnCount || Math.abs(row.length - columnCount) <= 1) {
        consistentRows++;
      }
    });

    const confidence = consistentRows / rows.length;

    return {
      id: `table_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      headers,
      rows: rows.map(row => {
        // Pad or trim to match header count
        const paddedRow = [...row];
        while (paddedRow.length < columnCount) paddedRow.push('');
        return paddedRow.slice(0, columnCount);
      }),
      confidence,
      metadata: {
        rowCount: rows.length,
        columnCount,
        hasHeaders: true,
        extractionMethod,
        provider
      }
    };
  }

  /**
   * Extract tables using DeepSeek OCR
   */
  private async extractTablesWithOCR(filePath: string, apiKey: string): Promise<TableData[]> {
    // Convert PDF to images first
    const images = await this.convertPDFToImages(filePath);
    const tables: TableData[] = [];

    for (const imageData of images) {
      try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              {
                role: 'system',
                content: 'Extract all tables from the image and return as JSON. Use the format: { "tables": [{ "headers": [], "rows": [[]] }]}'
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Extract all tables from this image with their data. Preserve the structure as accurately as possible.'
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:image/png;base64,${imageData}`
                    }
                  }
                ]
              }
            ],
            temperature: 0.1,
            max_tokens: 2000
          })
        });

        if (response.ok) {
          const data = await response.json();
          const extractedTables = this.parseOCRResponse(data.choices[0].message.content);
          tables.push(...extractedTables);
        }
      } catch (error) {
        console.error('[Table Extraction] OCR error for image:', error);
      }
    }

    return tables;
  }

  /**
   * Extract tables using Google multimodal AI
   */
  private async extractTablesWithMultimodal(filePath: string, apiKey: string, textHint: string): Promise<TableData[]> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    // Convert first page to image for visual analysis
    const images = await this.convertPDFToImages(filePath, 1); // Just first page

    const tables: TableData[] = [];

    for (const imageData of images) {
      try {
        const prompt = `
        Analyze this document image and extract ALL tables.
        Text context: ${textHint.substring(0, 1000)}

        Return as JSON:
        {
          "tables": [
            {
              "title": "Table title if available",
              "headers": ["Column 1", "Column 2", ...],
              "rows": [
                ["Row1Col1", "Row1Col2", ...],
                ["Row2Col1", "Row2Col2", ...]
              ]
            }
          ]
        }

        Be thorough and preserve data accuracy. Extract even partially visible tables.
        `;

        const result = await model.generateContent([
          prompt,
          {
            inlineData: {
              data: imageData,
              mimeType: 'image/png'
            }
          }
        ]);

        const response = result.response.text();
        const extractedTables = this.parseMultimodalResponse(response);
        tables.push(...extractedTables);

      } catch (error) {
        console.error('[Table Extraction] Multimodal error:', error);
      }
    }

    return tables;
  }

  /**
   * Convert PDF to images (base64 encoded)
   */
  private async convertPDFToImages(filePath: string, maxPages: number = 5): Promise<string[]> {
    // This would need a PDF to image conversion library
    // For now, return empty array - would need to implement with:
    // - pdf-poppler (Linux/Mac)
    // - pdf2pic (cross-platform)
    // - or external service

    console.log(`[Table Extraction] PDF to image conversion not yet implemented for ${filePath}`);
    return [];
  }

  /**
   * Parse OCR response into TableData objects
   */
  private parseOCRResponse(response: string): TableData[] {
    try {
      const parsed = JSON.parse(response);
      const tables: TableData[] = [];

      if (parsed.tables && Array.isArray(parsed.tables)) {
        parsed.tables.forEach((table: any, idx: number) => {
          if (table.headers && Array.isArray(table.headers) &&
              table.rows && Array.isArray(table.rows)) {
            tables.push({
              id: `ocr_table_${Date.now()}_${idx}`,
              title: table.title,
              headers: table.headers,
              rows: table.rows,
              confidence: 0.8, // OCR typically has good confidence
              metadata: {
                rowCount: table.rows.length,
                columnCount: table.headers.length,
                hasHeaders: true,
                extractionMethod: 'ocr',
                provider: 'deepseek'
              }
            });
          }
        });
      }

      return tables;
    } catch (error) {
      console.error('[Table Extraction] Failed to parse OCR response:', error);
      return [];
    }
  }

  /**
   * Parse multimodal response into TableData objects
   */
  private parseMultimodalResponse(response: string): TableData[] {
    try {
      // Extract JSON from markdown response if needed
      const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : response;

      const parsed = JSON.parse(jsonStr);
      const tables: TableData[] = [];

      if (parsed.tables && Array.isArray(parsed.tables)) {
        parsed.tables.forEach((table: any, idx: number) => {
          if (table.headers && Array.isArray(table.headers) &&
              table.rows && Array.isArray(table.rows)) {
            tables.push({
              id: `mm_table_${Date.now()}_${idx}`,
              title: table.title,
              headers: table.headers,
              rows: table.rows,
              confidence: 0.9, // Multimodal typically has highest confidence
              metadata: {
                rowCount: table.rows.length,
                columnCount: table.headers.length,
                hasHeaders: true,
                extractionMethod: 'multimodal',
                provider: 'google'
              }
            });
          }
        });
      }

      return tables;
    } catch (error) {
      console.error('[Table Extraction] Failed to parse multimodal response:', error);
      return [];
    }
  }

  /**
   * Remove duplicate tables
   */
  private deduplicateTables(tables: TableData[]): TableData[] {
    const seen = new Set<string>();
    const unique: TableData[] = [];

    tables.forEach(table => {
      // Create a signature based on headers and first few rows
      const signature = JSON.stringify({
        headers: table.headers,
        firstRow: table.rows[0] || [],
        rowCount: table.rows.length
      });

      if (!seen.has(signature)) {
        seen.add(signature);
        unique.push(table);
      } else {
        // Update confidence if we found a better extraction
        const existing = unique.find(t =>
          JSON.stringify(t.headers) === JSON.stringify(table.headers)
        );
        if (existing && table.confidence > existing.confidence) {
          existing.confidence = Math.max(existing.confidence, table.confidence);
          if (table.metadata.provider !== 'local') {
            existing.metadata = table.metadata;
          }
        }
      }
    });

    return unique.sort((a, b) => b.confidence - a.confidence);
  }
}

export default new TableExtractionService();