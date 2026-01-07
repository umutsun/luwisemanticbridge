/**
 * E2E Golden Tests for RAG Response Validation
 *
 * Tests the complete flow:
 * 1. LLM response + candidate chunks
 * 2. Python semantic analyzer validation
 * 3. Node.js post-processor
 * 4. Final response validation
 *
 * Usage:
 *   npm test -- --testPathPattern="e2e-rag-golden"
 *   npm test -- --testPathPattern="e2e-rag-golden" --testNamePattern="E2E_001"
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// CONFIGURATION
// =============================================================================

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8002';
const TIMEOUT_MS = 30000;

// =============================================================================
// TYPES
// =============================================================================

interface Candidate {
  source_id: string;
  content: string;
  title: string;
  source_type: string;
}

interface TestCaseInput {
  question: string;
  llm_response: string;
  candidates: Candidate[];
}

interface TestCaseExpected {
  answer_mode?: 'definitive' | 'cautious';
  alinti_preserved?: boolean;
  alinti_contains?: string;
  alinti_should_change?: boolean;
  cevap_contains?: string;
  semantic_analyzer_issues?: string[];
}

interface TestCase {
  id: string;
  description: string;
  input: TestCaseInput;
  expected: TestCaseExpected;
  tags: string[];
}

interface SemanticAnalyzerResponse {
  valid: boolean;
  confidence: number;
  issues: Array<{ type: string; message: string }>;
  suggested_quote?: string;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Load E2E golden test cases from JSON file
 */
function loadTestCases(): TestCase[] {
  const filePath = path.join(__dirname, 'e2e-test-cases.json');
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);
  return data.test_cases;
}

/**
 * Extract ALINTI from LLM response
 */
function extractAlinti(response: string): string | null {
  const match = response.match(/\*\*ALINTI\*\*\s*\n?"([^"]+)"/i);
  return match ? match[1] : null;
}

/**
 * Extract CEVAP from LLM response
 */
function extractCevap(response: string): string | null {
  const match = response.match(/\*\*CEVAP\*\*\s*\n?([^\n]+)/i);
  return match ? match[1] : null;
}

/**
 * Call Python semantic analyzer
 */
async function validateQuote(
  question: string,
  quote: string,
  answer: string,
  sourceText?: string
): Promise<SemanticAnalyzerResponse> {
  try {
    const response = await axios.post(
      `${PYTHON_SERVICE_URL}/api/v2/semantic/validate-quote`,
      {
        question,
        quote,
        answer,
        source_text: sourceText,
      },
      { timeout: TIMEOUT_MS }
    );
    return response.data;
  } catch (error: any) {
    console.error('Semantic analyzer error:', error.message);
    throw error;
  }
}

/**
 * Simulate Node.js post-processor logic
 * This is a simplified version of the actual post-processor
 */
function simulatePostProcessor(
  llmResponse: string,
  question: string,
  validationResult: SemanticAnalyzerResponse
): { processedResponse: string; answerMode: 'definitive' | 'cautious' } {
  let processedResponse = llmResponse;
  let answerMode: 'definitive' | 'cautious' = 'definitive';

  // If validation failed, apply cautious mode
  if (!validationResult.valid) {
    answerMode = 'cautious';

    // Check for forbidden patterns in issues
    const hasForbiddenPattern = validationResult.issues.some(
      (i) => i.type === 'forbidden_pattern' || i.type === 'quote_is_system_message'
    );

    // Check for modality inference issue
    const hasModalityInference = validationResult.issues.some(
      (i) => i.type === 'modality_inference'
    );

    // Check for quote not verbatim
    const hasNotVerbatim = validationResult.issues.some(
      (i) => i.type === 'quote_not_verbatim'
    );

    if (hasForbiddenPattern) {
      // Replace ALINTI with standard message
      processedResponse = processedResponse.replace(
        /\*\*ALINTI\*\*\s*\n?"[^"]*"/i,
        '**ALINTI**\n"Kesin hüküm cümlesi bulunamadı (kaynakta yalnızca konu başlığı/başvuru özeti var)."'
      );

      // Replace CEVAP with cautious statement
      const cevapMatch = processedResponse.match(/\*\*CEVAP\*\*\s*\n?([^\n]+)/i);
      if (cevapMatch) {
        const sourceRef = cevapMatch[1].match(/\[Kaynak\s*\d+\]/i)?.[0] || '[Kaynak 1]';
        processedResponse = processedResponse.replace(
          cevapMatch[1],
          `Bu konuda açık bir hüküm cümlesi bulunamadı. ${sourceRef}`
        );
      }
    } else if (hasModalityInference) {
      // Replace CEVAP with modality mismatch message
      const cevapMatch = processedResponse.match(/\*\*CEVAP\*\*\s*\n?([^\n]+)/i);
      if (cevapMatch) {
        const sourceRef = cevapMatch[1].match(/\[Kaynak\s*\d+\]/i)?.[0] || '[Kaynak 1]';
        processedResponse = processedResponse.replace(
          cevapMatch[1],
          `Bu konuda "zorunlu olup olmadığı" yönünde açık bir hüküm cümlesi bulunamadı. ${sourceRef}`
        );
      }
    } else if (hasNotVerbatim && validationResult.suggested_quote === '—') {
      // Use suggested quote replacement
      processedResponse = processedResponse.replace(
        /\*\*ALINTI\*\*\s*\n?"[^"]*"/i,
        '**ALINTI**\n"—"'
      );
    }
  }

  return { processedResponse, answerMode };
}

// =============================================================================
// TESTS
// =============================================================================

describe('E2E RAG Golden Tests', () => {
  const testCases = loadTestCases();
  let pythonServiceAvailable = false;

  beforeAll(async () => {
    // Check if Python service is available
    try {
      await axios.get(`${PYTHON_SERVICE_URL}/health`, { timeout: 5000 });
      pythonServiceAvailable = true;
      console.log('✅ Python semantic analyzer service is available');
    } catch {
      console.warn('⚠️ Python semantic analyzer service is NOT available');
      console.warn('   E2E tests will be skipped. Start the service with:');
      console.warn('   cd backend/python-services && uvicorn main:app --port 8002');
    }
  });

  describe.each(testCases)('$id: $description', (testCase) => {
    const { id, description, input, expected, tags } = testCase;

    it(`should validate ${id}`, async () => {
      if (!pythonServiceAvailable) {
        console.log(`⏭️ Skipping ${id} - Python service not available`);
        return;
      }

      // 1. Extract quote and answer from LLM response
      const quote = extractAlinti(input.llm_response);
      const answer = extractCevap(input.llm_response);

      expect(quote).not.toBeNull();
      expect(answer).not.toBeNull();

      // 2. Get source text from first candidate
      const sourceText = input.candidates[0]?.content;

      // 3. Call Python semantic analyzer
      const validationResult = await validateQuote(
        input.question,
        quote!,
        answer!,
        sourceText
      );

      console.log(`  Validation: valid=${validationResult.valid}, confidence=${validationResult.confidence}`);
      console.log(`  Issues: ${validationResult.issues.map((i) => i.type).join(', ') || 'none'}`);

      // 4. Simulate post-processor
      const { processedResponse, answerMode } = simulatePostProcessor(
        input.llm_response,
        input.question,
        validationResult
      );

      // 5. Validate expectations

      // Check answer_mode
      if (expected.answer_mode) {
        expect(answerMode).toBe(expected.answer_mode);
      }

      // Check if ALINTI was preserved
      if (expected.alinti_preserved !== undefined) {
        const originalAlinti = extractAlinti(input.llm_response);
        const finalAlinti = extractAlinti(processedResponse);

        if (expected.alinti_preserved) {
          expect(finalAlinti).toBe(originalAlinti);
        } else {
          expect(finalAlinti).not.toBe(originalAlinti);
        }
      }

      // Check ALINTI contains
      if (expected.alinti_contains) {
        const finalAlinti = extractAlinti(processedResponse);
        expect(finalAlinti?.toLowerCase()).toContain(expected.alinti_contains.toLowerCase());
      }

      // Check CEVAP contains
      if (expected.cevap_contains) {
        const finalCevap = extractCevap(processedResponse);
        expect(finalCevap?.toLowerCase()).toContain(expected.cevap_contains.toLowerCase());
      }

      // Check semantic analyzer issues
      if (expected.semantic_analyzer_issues) {
        const actualIssues = validationResult.issues.map((i) => i.type);
        for (const expectedIssue of expected.semantic_analyzer_issues) {
          expect(actualIssues).toContain(expectedIssue);
        }
      }

      // Check if ALINTI should change
      if (expected.alinti_should_change) {
        const originalAlinti = extractAlinti(input.llm_response);
        const finalAlinti = extractAlinti(processedResponse);
        expect(finalAlinti).not.toBe(originalAlinti);
      }
    });
  });
});

// =============================================================================
// META TESTS
// =============================================================================

describe('E2E Golden Test Meta Checks', () => {
  const testCases = loadTestCases();

  it('should have at least 5 test cases', () => {
    expect(testCases.length).toBeGreaterThanOrEqual(5);
  });

  it('should have unique test IDs', () => {
    const ids = testCases.map((tc) => tc.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should have at least one critical test', () => {
    const criticalTests = testCases.filter((tc) => tc.tags.includes('critical'));
    expect(criticalTests.length).toBeGreaterThan(0);
  });

  it('should have at least one regression test', () => {
    const regressionTests = testCases.filter((tc) => tc.tags.includes('regression'));
    expect(regressionTests.length).toBeGreaterThan(0);
  });
});
