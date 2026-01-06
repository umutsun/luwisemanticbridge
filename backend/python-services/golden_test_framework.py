"""
Golden Test Set Framework for RAG Quality Control
=================================================

10 Error Categories (as defined by Vergilex user):

C1: KONU satırı → hüküm cümlesi diye alıntılandı
C2: "olup olmadığı hk." → kesin cevap veren output
C3: Action mismatch (asmak ≠ bulundurmak)
C4: Modality mismatch (zorunlu mu? → mümkündür)
C5: Object anchor mismatch (vergi levhası ≠ sevk irsaliyesi)
C6: Low relevance (<0.3) but used as top source
C7: No verdict sentence but made definitive claim
C8: Correct answer with wrong source
C9: Fail-closed triggered when shouldn't have
C10: Fail-closed NOT triggered when should have

Metrics:
- DAR (Definitive Answer Rate): % of questions with confidence > 0.8
- Error Rate per Category: False positives/negatives
- Overall Accuracy: Correct pass/fail decisions
"""

import json
import asyncio
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Optional, Set
from enum import Enum
from datetime import datetime
import os

# Import the semantic analyzer
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.semantic_analyzer_service import semantic_analyzer, ChunkAnalysis


class ErrorCategory(Enum):
    """10 error categories for RAG quality"""
    C1_KONU_LINE = "C1_KONU_satiri"
    C2_OLUP_OLMADIGI = "C2_olup_olmadigi"
    C3_ACTION_MISMATCH = "C3_action_mismatch"
    C4_MODALITY_MISMATCH = "C4_modality_mismatch"
    C5_OBJECT_ANCHOR = "C5_object_anchor"
    C6_LOW_RELEVANCE = "C6_low_relevance"
    C7_NO_VERDICT = "C7_no_verdict"
    C8_WRONG_SOURCE = "C8_wrong_source"
    C9_FALSE_POSITIVE = "C9_false_positive"
    C10_FALSE_NEGATIVE = "C10_false_negative"


@dataclass
class GoldenTestCase:
    """A single test case in the golden set"""
    id: str
    category: ErrorCategory
    question: str
    chunk_text: str
    expected_pass: bool  # Should this chunk pass quality checks?
    expected_issues: List[str] = field(default_factory=list)
    notes: str = ""

    # Actual results (filled after test)
    actual_pass: Optional[bool] = None
    actual_issues: List[str] = field(default_factory=list)
    actual_confidence: float = 0.0
    actual_base_score: float = 0.0
    actual_bonus: float = 0.0
    test_passed: Optional[bool] = None

    def to_dict(self) -> dict:
        d = asdict(self)
        d['category'] = self.category.value
        return d


@dataclass
class TestResults:
    """Results from running the golden test set"""
    total_tests: int = 0
    passed_tests: int = 0
    failed_tests: int = 0

    # DAR (Definitive Answer Rate)
    dar_numerator: int = 0  # Questions with confidence > 0.8
    dar_denominator: int = 0  # Total questions

    # Per-category breakdown
    category_results: Dict[str, Dict] = field(default_factory=dict)

    # Failed test details
    failures: List[Dict] = field(default_factory=list)

    timestamp: str = ""

    @property
    def accuracy(self) -> float:
        if self.total_tests == 0:
            return 0.0
        return self.passed_tests / self.total_tests

    @property
    def dar(self) -> float:
        """Definitive Answer Rate"""
        if self.dar_denominator == 0:
            return 0.0
        return self.dar_numerator / self.dar_denominator

    def to_dict(self) -> dict:
        return {
            "total_tests": self.total_tests,
            "passed_tests": self.passed_tests,
            "failed_tests": self.failed_tests,
            "accuracy": self.accuracy,
            "dar": self.dar,
            "dar_details": f"{self.dar_numerator}/{self.dar_denominator}",
            "category_results": self.category_results,
            "failures_count": len(self.failures),
            "timestamp": self.timestamp
        }


# ============ GOLDEN TEST CASES ============

GOLDEN_TESTS: List[GoldenTestCase] = [
    # C1: KONU LINE - Should FAIL
    GoldenTestCase(
        id="C1_001",
        category=ErrorCategory.C1_KONU_LINE,
        question="Vergi levhası bulundurmak zorunlu mu?",
        chunk_text="KONU: Vergi levhası bulundurma zorunluluğu hk.\n\nİLGİ: 12.03.2020 tarihli dilekçeniz.",
        expected_pass=False,
        expected_issues=["forbidden_pattern"],
        notes="KONU line is metadata, not verdict"
    ),
    GoldenTestCase(
        id="C1_002",
        category=ErrorCategory.C1_KONU_LINE,
        question="KDV iadesi yapılabilir mi?",
        chunk_text="KONU: KDV iadesi talep usulü hk.\n\nİLGİ: a) Başkanlığımıza verilen dilekçe.",
        expected_pass=False,
        expected_issues=["forbidden_pattern"],
        notes="KONU/İLGİ are metadata"
    ),

    # C2: "olup olmadığı hk." - Should FAIL
    GoldenTestCase(
        id="C2_001",
        category=ErrorCategory.C2_OLUP_OLMADIGI,
        question="Bu işlem vergi kapsamında mı?",
        chunk_text="Söz konusu işlemin vergi kapsamında olup olmadığı hk. sorulmaktadır.",
        expected_pass=False,
        expected_issues=["forbidden_pattern"],
        notes="'olup olmadığı hk.' is a question, not answer"
    ),
    GoldenTestCase(
        id="C2_002",
        category=ErrorCategory.C2_OLUP_OLMADIGI,
        question="KDV istisnası uygulanabilir mi?",
        chunk_text="KDV istisnasının uygulanıp uygulanmayacağı hk. görüş sorulmaktadır.",
        expected_pass=False,
        expected_issues=["forbidden_pattern"],
        notes="Question format, not verdict"
    ),

    # C3: ACTION MISMATCH - Should FAIL
    GoldenTestCase(
        id="C3_001",
        category=ErrorCategory.C3_ACTION_MISMATCH,
        question="Vergi levhası bulundurmak zorunlu mu?",
        chunk_text="Vergi levhası asma zorunluluğu bulunmamaktadır. İşyerinde vergi levhasının görünür şekilde asılması gerekmemektedir.",
        expected_pass=False,
        expected_issues=["action_mismatch"],
        notes="'bulundurmak' != 'asmak'"
    ),
    GoldenTestCase(
        id="C3_002",
        category=ErrorCategory.C3_ACTION_MISMATCH,
        question="Faturayı saklamak gerekli mi?",
        chunk_text="Faturanın ibraz edilmesi gerekmektedir. Mükelleflerin faturaları vergi dairesine ibraz etmeleri zorunludur.",
        expected_pass=False,
        expected_issues=["action_mismatch"],
        notes="'saklamak' != 'ibraz etmek'"
    ),

    # C4: MODALITY MISMATCH - Should FAIL
    GoldenTestCase(
        id="C4_001",
        category=ErrorCategory.C4_MODALITY_MISMATCH,
        question="Vergi levhası bulundurmak zorunlu mu?",
        chunk_text="Vergi levhası bulundurulması mümkündür. Mükellefler isteğe bağlı olarak vergi levhası bulundurabilir.",
        expected_pass=False,
        expected_issues=["modality_mismatch"],
        notes="'zorunlu mu?' -> 'mümkündür' is mismatched modality"
    ),
    GoldenTestCase(
        id="C4_002",
        category=ErrorCategory.C4_MODALITY_MISMATCH,
        question="Bu harcama gider yazılabilir mi?",
        chunk_text="Bu tür harcamaların gider yazılması zorunludur. Mükellefler bu harcamaları gider olarak kaydetmek zorundadır.",
        expected_pass=False,
        expected_issues=["modality_mismatch"],
        notes="'yazılabilir mi?' -> 'zorunludur' is mismatched"
    ),

    # C5: OBJECT ANCHOR MISMATCH - Should FAIL
    GoldenTestCase(
        id="C5_001",
        category=ErrorCategory.C5_OBJECT_ANCHOR,
        question="Vergi levhası bulundurmak zorunlu mu?",
        chunk_text="Sevk irsaliyesi bulundurma zorunluluğu bulunmaktadır. Nakliye işlemlerinde sevk irsaliyesi bulundurulması gerekmektedir.",
        expected_pass=False,
        expected_issues=["object_mismatch"],
        notes="'vergi levhası' != 'sevk irsaliyesi'"
    ),
    GoldenTestCase(
        id="C5_002",
        category=ErrorCategory.C5_OBJECT_ANCHOR,
        question="Fatura düzenlemek zorunlu mu?",
        chunk_text="Perakende satış fişi düzenleme zorunluluğu bulunmaktadır. Perakende satışlarda fiş düzenlenmesi gerekmektedir.",
        expected_pass=False,
        expected_issues=["object_mismatch"],
        notes="'fatura' != 'perakende satış fişi'"
    ),

    # C6: LOW RELEVANCE - Should FAIL
    GoldenTestCase(
        id="C6_001",
        category=ErrorCategory.C6_LOW_RELEVANCE,
        question="Vergi levhası bulundurmak zorunlu mu?",
        chunk_text="Hava durumu tahminleri için meteoroloji verilerinin analizi önemlidir. Günlük sıcaklık değerleri takip edilmelidir.",
        expected_pass=False,
        expected_issues=["low_relevance"],
        notes="Completely irrelevant content"
    ),

    # C7: NO VERDICT - Should FAIL (no definitive claim)
    GoldenTestCase(
        id="C7_001",
        category=ErrorCategory.C7_NO_VERDICT,
        question="KDV iadesi alınabilir mi?",
        chunk_text="KDV iadesine ilişkin başvurular değerlendirilmektedir. Başvuru süreçleri incelenmekte ve sonuçlandırılmaktadır.",
        expected_pass=False,
        expected_issues=["no_verdict_sentence"],
        notes="No verdict sentence (zorunludur/mümkündür/etc.)"
    ),

    # C9: FALSE POSITIVE (fail-closed shouldn't trigger) - Should PASS
    GoldenTestCase(
        id="C9_001",
        category=ErrorCategory.C9_FALSE_POSITIVE,
        question="Vergi levhası bulundurmak zorunlu mu?",
        chunk_text="Vergi levhası bulundurma zorunluluğu kaldırılmıştır. 2012 yılından itibaren işyerinde vergi levhası bulundurulması zorunlu değildir.",
        expected_pass=True,
        expected_issues=[],
        notes="Valid verdict about the correct topic"
    ),
    GoldenTestCase(
        id="C9_002",
        category=ErrorCategory.C9_FALSE_POSITIVE,
        question="E-fatura düzenlemek zorunlu mu?",
        chunk_text="Belirli haddi aşan mükellefler için e-fatura düzenleme zorunluluğu bulunmaktadır. Bu mükellefler e-fatura düzenlemek zorundadır.",
        expected_pass=True,
        expected_issues=[],
        notes="Valid verdict with matching topic"
    ),

    # C10: FALSE NEGATIVE (fail-closed should trigger but didn't) - Should FAIL
    GoldenTestCase(
        id="C10_001",
        category=ErrorCategory.C10_FALSE_NEGATIVE,
        question="Nakliye aracında vergi levhası zorunlu mu?",
        chunk_text="Turizm taşımacılığı yapan araçlarda yetki belgesi bulundurulması zorunludur. Bu belgeler araç içinde görünür yerde bulundurulmalıdır.",
        expected_pass=False,
        expected_issues=["object_mismatch", "action_mismatch"],
        notes="'nakliye aracı' != 'turizm aracı', 'vergi levhası' != 'yetki belgesi'"
    ),
]


class GoldenTestRunner:
    """Runs the golden test set and calculates metrics"""

    def __init__(self):
        self.results = TestResults()

    async def run_single_test(self, test: GoldenTestCase) -> GoldenTestCase:
        """Run a single test case"""
        # Create chunk data for analyzer
        chunk_data = {
            "id": test.id,
            "text": test.chunk_text,
            "source": f"golden_test_{test.id}"
        }

        # Run analysis
        analyses = await semantic_analyzer.analyze_chunks(
            question=test.question,
            chunks=[chunk_data],
            min_relevance=0.3
        )

        if analyses:
            analysis = analyses[0]
            test.actual_pass = analysis.recommended
            test.actual_issues = analysis.issues
            test.actual_confidence = analysis.confidence
            test.actual_base_score = analysis.base_score
            test.actual_bonus = analysis.bonus
        else:
            test.actual_pass = False
            test.actual_issues = ["analysis_failed"]
            test.actual_confidence = 0.0
            test.actual_base_score = 0.0
            test.actual_bonus = 0.0

        # Determine if test passed
        test.test_passed = test.actual_pass == test.expected_pass

        return test

    async def run_all_tests(self) -> TestResults:
        """Run all golden tests and calculate metrics"""
        self.results = TestResults()
        self.results.timestamp = datetime.now().isoformat()

        # Initialize category results
        for cat in ErrorCategory:
            self.results.category_results[cat.value] = {
                "total": 0,
                "passed": 0,
                "failed": 0,
                "accuracy": 0.0
            }

        # Run all tests
        for test in GOLDEN_TESTS:
            test = await self.run_single_test(test)

            self.results.total_tests += 1
            self.results.dar_denominator += 1

            # Track DAR
            if test.actual_confidence > 0.8:
                self.results.dar_numerator += 1

            # Track category results
            cat_key = test.category.value
            self.results.category_results[cat_key]["total"] += 1

            if test.test_passed:
                self.results.passed_tests += 1
                self.results.category_results[cat_key]["passed"] += 1
            else:
                self.results.failed_tests += 1
                self.results.category_results[cat_key]["failed"] += 1
                self.results.failures.append({
                    "test_id": test.id,
                    "category": cat_key,
                    "question": test.question[:50] + "...",
                    "expected_pass": test.expected_pass,
                    "actual_pass": test.actual_pass,
                    "expected_issues": test.expected_issues,
                    "actual_issues": test.actual_issues,
                    "confidence": test.actual_confidence
                })

        # Calculate category accuracies
        for cat_key, cat_result in self.results.category_results.items():
            if cat_result["total"] > 0:
                cat_result["accuracy"] = cat_result["passed"] / cat_result["total"]

        return self.results

    def print_report(self):
        """Print a human-readable test report"""
        print("\n" + "=" * 60)
        print("GOLDEN TEST SET REPORT")
        print("=" * 60)
        print(f"Timestamp: {self.results.timestamp}")
        print(f"Total Tests: {self.results.total_tests}")
        print(f"Passed: {self.results.passed_tests}")
        print(f"Failed: {self.results.failed_tests}")
        print(f"Overall Accuracy: {self.results.accuracy:.2%}")
        print(f"DAR (Definitive Answer Rate): {self.results.dar:.2%} ({self.results.dar_numerator}/{self.results.dar_denominator})")

        print("\n--- Category Breakdown ---")
        for cat_key, cat_result in self.results.category_results.items():
            if cat_result["total"] > 0:
                print(f"  {cat_key}: {cat_result['passed']}/{cat_result['total']} ({cat_result['accuracy']:.0%})")

        if self.results.failures:
            print("\n--- Failed Tests ---")
            for failure in self.results.failures[:10]:  # Show first 10
                print(f"  [{failure['test_id']}] {failure['category']}")
                print(f"    Expected: {'PASS' if failure['expected_pass'] else 'FAIL'}")
                print(f"    Actual: {'PASS' if failure['actual_pass'] else 'FAIL'}")
                print(f"    Confidence: {failure['confidence']:.2f}")
                print(f"    Expected issues: {failure['expected_issues']}")
                print(f"    Actual issues: {failure['actual_issues']}")
                print()

        print("=" * 60)


async def run_golden_tests():
    """Main entry point for running golden tests"""
    runner = GoldenTestRunner()
    results = await runner.run_all_tests()
    runner.print_report()
    return results


if __name__ == "__main__":
    asyncio.run(run_golden_tests())
