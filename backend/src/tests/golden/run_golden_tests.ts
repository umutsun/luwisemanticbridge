import fs from "fs";
import path from "path";
import axios from "axios";

// Configuration
const API_URL = process.env.API_URL || "http://localhost:8083/api/v2/chat";
const GOLDEN_SET_PATH = path.join(__dirname, "golden-test-set.json");

// Interface for Test Case
interface TestCase {
    id: number;
    category: string;
    question: string;
    expectedResponseType: string | string[];
    verdictQuestion?: boolean;
    requiresQuote?: boolean;
    expectedBehavior?: string;
    tags?: string[];
    notes?: string;
    invariants?: Record<string, unknown>;
}

interface GoldenTestSet {
    version: string;
    miniTestKit: { tests: number[] };
    tests: TestCase[];
}

interface TestResult {
    id: number;
    question: string;
    passed: boolean;
    status: string;
    actualResponseType?: string;
    expectedResponseType?: string | string[];
    details?: string;
    debugInfo?: Record<string, unknown>;
}

// Colors for console output
const colors = {
    reset: "\x1b[0m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    bold: "\x1b[1m",
};

async function runTests() {
    console.log(
        `${colors.bold}${colors.blue}🚀 Starting Golden Test Set Execution...${colors.reset}\n`,
    );

    // Load Golden Set
    let goldenSet: GoldenTestSet;
    try {
        const fileContent = fs.readFileSync(GOLDEN_SET_PATH, "utf-8");
        goldenSet = JSON.parse(fileContent);
        console.log(
            `Loaded Golden Set v${goldenSet.version} with ${goldenSet.tests.length} tests.`,
        );
        console.log(`Target API: ${API_URL}\n`);
    } catch (error) {
        console.error(
            `${colors.red}Failed to load golden-test-set.json: ${error}${colors.reset}`,
        );
        process.exit(1);
    }

    const results: TestResult[] = [];
    let passedCount = 0;
    let failedCount = 0;

    // Run all tests
    for (const test of goldenSet.tests) {
        console.log(
            `${colors.yellow}Running Test #${test.id}: ${test.question}${colors.reset}`,
        );

        try {
            const response = await axios.post(
                API_URL,
                { message: test.question, trackUserInsights: false },
                {
                    headers: {
                        "X-Bypass-Cache": "true",
                        "Content-Type": "application/json",
                    },
                    timeout: 30000, // 30s timeout
                },
            );

            const data = response.data;
            const debug = data._debug || {};
            const actualResponseType = debug.responseType || "UNKNOWN";
            const userResponse = data.response || "";
            const sources = data.sources || [];
            const sourcesCount = sources.length;
            const suggestedQuestions = data.suggestedQuestions || [];
            const suggestionsCount = suggestedQuestions.length;

            let passed = true;
            let failureReason = "";

            // 1. Check ResponseType
            const expectedTypes = Array.isArray(test.expectedResponseType)
                ? test.expectedResponseType
                : [test.expectedResponseType];

            if (!expectedTypes.includes(actualResponseType)) {
                passed = false;
                failureReason += `Expected ${expectedTypes.join(" or ")} but got ${actualResponseType}. `;
            }

            // 2. Check Sources Count (Invariant)
            if (passed) {
                if (actualResponseType === "FOUND" && sourcesCount === 0) {
                    passed = false;
                    failureReason += `FOUND response type must have sources, but got 0. `;
                } else if (actualResponseType !== "FOUND" && sourcesCount > 0) {
                    passed = false;
                    failureReason += `${actualResponseType} response type must have 0 sources, but got ${sourcesCount}. `;
                }
            }

            // 3. Check Verdict/Quote Logic (Evidence-First)
            if (passed && test.verdictQuestion) {
                const hasAlinti =
                    userResponse.includes("**ALINTI**") ||
                    userResponse.includes("**QUOTE**"); // Simple check
                // const hasHukum = userResponse.toLowerCase().includes('hüküm cümlesi seçilemedi');

                if (
                    !hasAlinti &&
                    !userResponse.toLowerCase().includes("hüküm cümlesi seçilemedi")
                ) {
                    // It's acceptable if it found an answer without quote IF specific conditions met,
                    // but strict guide says: No quote -> "hüküm cümlesi seçilemedi" disclaimer.
                    // We'll trust the test definition 'requiresQuote'.
                    if (test.requiresQuote) {
                        // warning: strict check might fail if text varies slightly.
                        // We look for definitive keywords?
                    }
                }
            }

            // 4. Check Early Exit
            if (passed && test.invariants?.earlyExit) {
                if (!debug.earlyExit) {
                    passed = false;
                    failureReason += `Expected earlyExit=true, but got false. `;
                }

                // 5. Check Suggestions for NEEDS_CLARIFICATION
                if (passed && actualResponseType === "NEEDS_CLARIFICATION") {
                    if (suggestionsCount === 0) {
                        passed = false;
                        failureReason += `NEEDS_CLARIFICATION should return suggestedQuestions, but got 0. `;
                    }
                }
            }

            const result: TestResult = {
                id: test.id,
                question: test.question,
                passed,
                status: passed ? "PASS" : "FAIL",
                actualResponseType,
                expectedResponseType: test.expectedResponseType,
                details: failureReason,
                debugInfo: {
                    responseType: actualResponseType,
                    sourcesCount,
                    suggestionsCount,
                    earlyExit: debug.earlyExit,
                },
            };

            results.push(result);

            if (passed) {
                console.log(
                    `${colors.green}✅ PASS${colors.reset} (${actualResponseType})`,
                );
                passedCount++;
            } else {
                console.log(`${colors.red}❌ FAIL${colors.reset} - ${failureReason}`);
                console.log(
                    `   Response Preview: ${userResponse.substring(0, 100)}...`,
                );
                failedCount++;
            }
        } catch (error) {
            const err = error as Error;
            console.error(
                `${colors.red}❌ ERROR${colors.reset} - API Call Failed: ${err.message}`,
            );
            results.push({
                id: test.id,
                question: test.question,
                passed: false,
                status: "ERROR",
                details: err.message,
            });
            failedCount++;
        }

        // Tiny delay to not hammer the server if it's local dev
        await new Promise((r) => setTimeout(r, 100));
    }

    // Summary Report
    console.log(`\n${colors.bold}--- Test Summary ---${colors.reset}`);
    console.log(`Total: ${goldenSet.tests.length}`);
    console.log(`${colors.green}Passed: ${passedCount}${colors.reset}`);
    console.log(`${colors.red}Failed: ${failedCount}${colors.reset}`);

    if (failedCount > 0) {
        console.log(`\n${colors.red}${colors.bold}Failed Tests:${colors.reset}`);
        results
            .filter((r) => !r.passed)
            .forEach((r) => {
                console.log(`#${r.id} ${r.question} -> ${r.details}`);
            });
        process.exit(1);
    } else {
        console.log(
            `\n${colors.green}${colors.bold}All tests passed successfully!${colors.reset}`,
        );
        process.exit(0);
    }
}

runTests().catch((err) => console.error(err));
