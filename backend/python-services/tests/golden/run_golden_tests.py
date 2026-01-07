"""
Golden Test Runner for Semantic Analyzer

Runs all golden test cases and reports results.

Usage:
    python -m tests.golden.run_golden_tests
    python -m tests.golden.run_golden_tests --tags regression
    python -m tests.golden.run_golden_tests --file quote_system_message_cases.json
"""

import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
from enum import Enum

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from services.semantic_analyzer_service import semantic_analyzer


class TestResult(Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    SKIP = "SKIP"
    ERROR = "ERROR"


@dataclass
class TestCaseResult:
    test_id: str
    result: TestResult
    expected: Dict
    actual: Dict
    errors: List[str]
    description: str


def load_test_files(golden_dir: Path, file_filter: Optional[str] = None) -> List[Dict]:
    """Load all golden test files"""
    test_files = []
    for f in golden_dir.glob("*.json"):
        if f.name == "schema.json":
            continue
        if file_filter and file_filter not in f.name:
            continue
        with open(f, "r", encoding="utf-8") as fp:
            data = json.load(fp)
            data["_file"] = f.name
            test_files.append(data)
    return test_files


def filter_by_tags(test_cases: List[Dict], tags: List[str]) -> List[Dict]:
    """Filter test cases by tags"""
    if not tags:
        return test_cases
    return [
        tc for tc in test_cases
        if any(tag in tc.get("tags", []) for tag in tags)
    ]


async def run_test_case(test_case: Dict) -> TestCaseResult:
    """Run a single test case"""
    test_id = test_case["id"]
    description = test_case.get("description", "")
    expected = test_case["expected"]
    errors = []

    try:
        # Build validate_quote parameters
        question = test_case["question"]
        quote = test_case["quote"]
        answer = test_case["answer"]
        source_text = test_case.get("source_text")

        # Run validation
        result = await semantic_analyzer.validate_quote(
            question=question,
            quote=quote,
            answer=answer,
            source_text=source_text
        )

        # Build actual results
        actual = {
            "valid": result.valid,
            "confidence": result.confidence,
            "issues": [i.get("type", "") for i in result.issues],
            "suggested_quote": result.suggested_quote
        }

        # Check expectations
        test_passed = True

        # Check quote_valid
        if expected.get("quote_valid") is not None:
            if result.valid != expected["quote_valid"]:
                errors.append(f"quote_valid: expected {expected['quote_valid']}, got {result.valid}")
                test_passed = False

        # Check issues_contains
        for issue in expected.get("issues_contains", []):
            if issue not in actual["issues"]:
                errors.append(f"issues_contains: expected '{issue}' in issues, got {actual['issues']}")
                test_passed = False

        # Check issues_not_contains
        for issue in expected.get("issues_not_contains", []):
            if issue in actual["issues"]:
                errors.append(f"issues_not_contains: '{issue}' should not be in issues")
                test_passed = False

        # Check suggested_quote
        if "suggested_quote" in expected:
            if result.suggested_quote != expected["suggested_quote"]:
                errors.append(f"suggested_quote: expected {expected['suggested_quote']!r}, got {result.suggested_quote!r}")
                test_passed = False

        # Check confidence bounds
        if "min_confidence" in expected:
            if result.confidence < expected["min_confidence"]:
                errors.append(f"min_confidence: expected >= {expected['min_confidence']}, got {result.confidence}")
                test_passed = False

        if "max_confidence" in expected:
            if result.confidence > expected["max_confidence"]:
                errors.append(f"max_confidence: expected <= {expected['max_confidence']}, got {result.confidence}")
                test_passed = False

        return TestCaseResult(
            test_id=test_id,
            result=TestResult.PASS if test_passed else TestResult.FAIL,
            expected=expected,
            actual=actual,
            errors=errors,
            description=description
        )

    except Exception as e:
        return TestCaseResult(
            test_id=test_id,
            result=TestResult.ERROR,
            expected=expected,
            actual={"error": str(e)},
            errors=[f"Exception: {e}"],
            description=description
        )


async def run_all_tests(
    golden_dir: Path,
    tags: Optional[List[str]] = None,
    file_filter: Optional[str] = None,
    verbose: bool = False
) -> Dict[str, Any]:
    """Run all golden tests and return summary"""

    # Initialize semantic analyzer
    await semantic_analyzer.initialize()

    # Load test files
    test_files = load_test_files(golden_dir, file_filter)

    results = []
    total_pass = 0
    total_fail = 0
    total_error = 0
    total_skip = 0

    for test_file in test_files:
        file_name = test_file["_file"]
        test_cases = test_file.get("test_cases", [])

        # Filter by tags
        test_cases = filter_by_tags(test_cases, tags or [])

        if verbose:
            print(f"\n{'='*60}")
            print(f"File: {file_name} ({len(test_cases)} tests)")
            print(f"{'='*60}")

        for tc in test_cases:
            result = await run_test_case(tc)
            results.append(result)

            if result.result == TestResult.PASS:
                total_pass += 1
                if verbose:
                    print(f"  [PASS] {result.test_id}: {result.description[:50]}...")
            elif result.result == TestResult.FAIL:
                total_fail += 1
                print(f"  [FAIL] {result.test_id}: {result.description[:50]}...")
                for err in result.errors:
                    print(f"         - {err}")
            elif result.result == TestResult.ERROR:
                total_error += 1
                print(f"  [ERROR] {result.test_id}: {result.description[:50]}...")
                for err in result.errors:
                    print(f"          - {err}")
            else:
                total_skip += 1

    # Summary
    total = total_pass + total_fail + total_error + total_skip
    print(f"\n{'='*60}")
    print(f"SUMMARY: {total_pass}/{total} passed")
    print(f"  PASS:  {total_pass}")
    print(f"  FAIL:  {total_fail}")
    print(f"  ERROR: {total_error}")
    print(f"  SKIP:  {total_skip}")
    print(f"{'='*60}")

    return {
        "total": total,
        "pass": total_pass,
        "fail": total_fail,
        "error": total_error,
        "skip": total_skip,
        "results": results,
        "success": total_fail == 0 and total_error == 0
    }


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Run golden tests for semantic analyzer")
    parser.add_argument("--tags", nargs="+", help="Filter by tags (e.g., --tags regression critical)")
    parser.add_argument("--file", help="Filter by file name (e.g., --file quote_system)")
    parser.add_argument("--verbose", "-v", action="store_true", help="Show all test results")
    args = parser.parse_args()

    golden_dir = Path(__file__).parent

    summary = asyncio.run(run_all_tests(
        golden_dir=golden_dir,
        tags=args.tags,
        file_filter=args.file,
        verbose=args.verbose
    ))

    # Exit with error code if tests failed
    sys.exit(0 if summary["success"] else 1)


if __name__ == "__main__":
    main()
