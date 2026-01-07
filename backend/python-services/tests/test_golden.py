"""
Golden Test Suite for Semantic Analyzer - Pytest Integration

This module integrates golden tests with pytest for CI/CD pipelines.
Tests are dynamically generated from JSON test case files.

Usage:
    pytest tests/test_golden.py -v
    pytest tests/test_golden.py -v -k "regression"
    pytest tests/test_golden.py -v -k "critical"
"""

import asyncio
import json
import pytest
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.semantic_analyzer_service import semantic_analyzer, SemanticAnalyzerService


# =============================================================================
# CONFIG VERSION TRACKING
# =============================================================================

def get_config_version() -> str:
    """Get current semantic analyzer config version for tracking regressions"""
    service = SemanticAnalyzerService()
    version_parts = [
        f"verdict_patterns:{len(service.verdict_patterns)}",
        f"forbidden_patterns:{len(service.forbidden_patterns)}",
        f"system_patterns:{len(service.system_message_patterns)}",
        f"source_indicators:{len(service.SOURCE_INDICATORS)}",
        f"modality_patterns:{len(service.modality_question_patterns)}",
    ]
    return "|".join(version_parts)


# =============================================================================
# TEST DATA LOADING
# =============================================================================

GOLDEN_DIR = Path(__file__).parent / "golden"


def load_all_test_cases() -> List[Tuple[str, Dict]]:
    """Load all test cases from golden directory"""
    test_cases = []

    for json_file in GOLDEN_DIR.glob("*.json"):
        if json_file.name == "schema.json":
            continue

        with open(json_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        file_name = json_file.stem
        for tc in data.get("test_cases", []):
            # Create test ID with file prefix for clarity
            test_id = f"{file_name}::{tc['id']}"
            tc["_file"] = file_name
            tc["_tags"] = tc.get("tags", [])
            test_cases.append((test_id, tc))

    return test_cases


# Load test cases at module level for parametrization
ALL_TEST_CASES = load_all_test_cases()


# =============================================================================
# PYTEST FIXTURES
# =============================================================================

@pytest.fixture(scope="module")
def event_loop():
    """Create event loop for async tests"""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module")
async def analyzer():
    """Initialize semantic analyzer once per module"""
    await semantic_analyzer.initialize()
    return semantic_analyzer


@pytest.fixture(scope="session", autouse=True)
def log_config_version():
    """Log config version at start of test session"""
    version = get_config_version()
    print(f"\n{'='*60}")
    print(f"SEMANTIC ANALYZER CONFIG VERSION:")
    print(f"  {version}")
    print(f"{'='*60}\n")


# =============================================================================
# PARAMETRIZED GOLDEN TESTS
# =============================================================================

def get_test_markers(test_case: Dict) -> List:
    """Convert test case tags to pytest markers"""
    tags = test_case.get("_tags", [])
    markers = []

    if "critical" in tags:
        markers.append(pytest.mark.critical)
    if "regression" in tags:
        markers.append(pytest.mark.regression)
    if "edge_case" in tags:
        markers.append(pytest.mark.edge_case)
    if "slow" in tags:
        markers.append(pytest.mark.slow)

    return markers


# Generate test IDs for better output
def generate_test_id(test_tuple):
    test_id, tc = test_tuple
    return test_id


@pytest.mark.asyncio
@pytest.mark.parametrize("test_id,test_case", ALL_TEST_CASES, ids=[t[0] for t in ALL_TEST_CASES])
async def test_golden_case(test_id: str, test_case: Dict, analyzer):
    """
    Run a single golden test case.

    This test validates that the semantic analyzer produces expected results
    for known test cases. Failures indicate potential regressions.
    """
    expected = test_case["expected"]

    # Run validation
    result = await analyzer.validate_quote(
        question=test_case["question"],
        quote=test_case["quote"],
        answer=test_case["answer"],
        source_text=test_case.get("source_text")
    )

    # Collect all assertion errors for comprehensive failure message
    errors = []

    # Check quote_valid
    if expected.get("quote_valid") is not None:
        if result.valid != expected["quote_valid"]:
            errors.append(
                f"quote_valid: expected {expected['quote_valid']}, got {result.valid}"
            )

    # Check issues_contains
    actual_issues = [i.get("type", "") for i in result.issues]
    for issue in expected.get("issues_contains", []):
        if issue not in actual_issues:
            errors.append(
                f"issues_contains: expected '{issue}' in {actual_issues}"
            )

    # Check issues_not_contains
    for issue in expected.get("issues_not_contains", []):
        if issue in actual_issues:
            errors.append(
                f"issues_not_contains: '{issue}' should NOT be in {actual_issues}"
            )

    # Check suggested_quote
    if "suggested_quote" in expected:
        if result.suggested_quote != expected["suggested_quote"]:
            errors.append(
                f"suggested_quote: expected {expected['suggested_quote']!r}, "
                f"got {result.suggested_quote!r}"
            )

    # Check confidence bounds
    if "min_confidence" in expected:
        if result.confidence < expected["min_confidence"]:
            errors.append(
                f"min_confidence: expected >= {expected['min_confidence']}, "
                f"got {result.confidence}"
            )

    if "max_confidence" in expected:
        if result.confidence > expected["max_confidence"]:
            errors.append(
                f"max_confidence: expected <= {expected['max_confidence']}, "
                f"got {result.confidence}"
            )

    # Check answer_mode
    if "answer_mode" in expected:
        actual_mode = "definitive" if result.valid and result.confidence >= 0.7 else "cautious"
        if actual_mode != expected["answer_mode"]:
            errors.append(
                f"answer_mode: expected '{expected['answer_mode']}', got '{actual_mode}' "
                f"(valid={result.valid}, confidence={result.confidence})"
            )

    # If any errors, fail with comprehensive message
    if errors:
        failure_msg = f"""
{'='*60}
GOLDEN TEST FAILURE: {test_id}
{'='*60}
Description: {test_case.get('description', 'N/A')}
Tags: {test_case.get('_tags', [])}

INPUT:
  Question: {test_case['question'][:80]}...
  Quote: {test_case['quote'][:80]}...
  Answer: {test_case['answer'][:50]}...

ERRORS:
{chr(10).join(f'  - {e}' for e in errors)}

ACTUAL RESULT:
  valid: {result.valid}
  confidence: {result.confidence}
  issues: {actual_issues}
  suggested_quote: {result.suggested_quote}

EXPECTED:
  {json.dumps(expected, indent=2, ensure_ascii=False)}
{'='*60}
"""
        pytest.fail(failure_msg)


# =============================================================================
# MARKER-BASED TEST SELECTION
# =============================================================================

# Custom markers for filtering
pytest.mark.critical = pytest.mark.critical
pytest.mark.regression = pytest.mark.regression
pytest.mark.edge_case = pytest.mark.edge_case


# =============================================================================
# SUMMARY TESTS
# =============================================================================

@pytest.mark.asyncio
async def test_no_false_positives(analyzer):
    """
    Meta-test: Ensure no test case marked as quote_valid=true fails validation.
    This catches false positives where valid quotes are incorrectly rejected.
    """
    false_positives = []

    for test_id, tc in ALL_TEST_CASES:
        expected = tc["expected"]
        if expected.get("quote_valid") is True:
            result = await analyzer.validate_quote(
                question=tc["question"],
                quote=tc["quote"],
                answer=tc["answer"],
                source_text=tc.get("source_text")
            )
            if not result.valid:
                false_positives.append({
                    "test_id": test_id,
                    "issues": [i.get("type") for i in result.issues]
                })

    if false_positives:
        pytest.fail(
            f"FALSE POSITIVES DETECTED ({len(false_positives)} cases):\n" +
            "\n".join(f"  - {fp['test_id']}: {fp['issues']}" for fp in false_positives)
        )


@pytest.mark.asyncio
async def test_no_false_definitives(analyzer):
    """
    Meta-test: Ensure no test case marked as quote_valid=false passes validation.
    This catches false definitives where invalid quotes are incorrectly accepted.
    """
    false_definitives = []

    for test_id, tc in ALL_TEST_CASES:
        expected = tc["expected"]
        if expected.get("quote_valid") is False:
            result = await analyzer.validate_quote(
                question=tc["question"],
                quote=tc["quote"],
                answer=tc["answer"],
                source_text=tc.get("source_text")
            )
            if result.valid:
                false_definitives.append({
                    "test_id": test_id,
                    "confidence": result.confidence
                })

    if false_definitives:
        pytest.fail(
            f"FALSE DEFINITIVES DETECTED ({len(false_definitives)} cases):\n" +
            "\n".join(
                f"  - {fd['test_id']}: confidence={fd['confidence']}"
                for fd in false_definitives
            )
        )
