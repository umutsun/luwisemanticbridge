#!/usr/bin/env python3
"""
RAG Pipeline End-to-End Test - 40 Questions
Tests: Semantic Search → Jina Reranking → Priority Weighting → Scoring
Target: Vergilex production (localhost:8003)
"""

import json
import time
import sys
import urllib.request
import urllib.parse
from datetime import datetime

BASE_URL = "http://localhost:8003/api/python/semantic-search/search"
RESULTS_LIMIT = 15

# ═══════════════════════════════════════════════════════════════
# 40 TEST QUESTIONS - Grouped by category
# ═══════════════════════════════════════════════════════════════

TESTS = [
    # ─── GROUP 1: Article-Specific Queries (Madde Tespiti) ───
    {
        "id": "T01", "group": "ARTICLE",
        "query": "VUK 114. maddeye göre zamanaşımı süresi nedir?",
        "checks": {
            "expect_article_detected": True,
            "expect_law_code": "VUK",
            "expect_article_number": "114",
            "expect_in_top3_tables": ["vergilex_mevzuat_kanunlar_chunks"],
        }
    },
    {
        "id": "T02", "group": "ARTICLE",
        "query": "GVK 40. madde gider olarak indirilecek kalemler nelerdir?",
        "checks": {
            "expect_article_detected": True,
            "expect_law_code": "GVK",
            "expect_article_number": "40",
        }
    },
    {
        "id": "T03", "group": "ARTICLE",
        "query": "KDVK 29. madde indirim hakkı nasıl kullanılır?",
        "checks": {
            "expect_article_detected": True,
            "expect_law_code": "KDVK",
            "expect_article_number": "29",
        }
    },
    {
        "id": "T04", "group": "ARTICLE",
        "query": "VUK 359 sahte belge düzenleme cezası nedir?",
        "checks": {
            "expect_article_detected": True,
            "expect_law_code": "VUK",
            "expect_article_number": "359",
        }
    },
    {
        "id": "T05", "group": "ARTICLE",
        "query": "Kurumlar Vergisi Kanunu 5. madde istisna kazançlar",
        "checks": {
            "expect_article_detected": True,
            "expect_law_code": "KVK",
        }
    },

    # ─── GROUP 2: Rate/Amount Questions (Oran/Miktar) ───
    {
        "id": "T06", "group": "RATE",
        "query": "KDV oranı yüzde kaçtır?",
        "checks": {
            "expect_rate_question": True,
            "expect_content_keywords": ["oran", "%"],
        }
    },
    {
        "id": "T07", "group": "RATE",
        "query": "Gecikme zammı oranı 2024 yılında ne kadar?",
        "checks": {
            "expect_rate_question": True,
            "expect_content_keywords": ["gecikme", "oran"],
        }
    },
    {
        "id": "T08", "group": "RATE",
        "query": "Kurumlar vergisi oranı nedir?",
        "checks": {
            "expect_rate_question": True,
            "expect_content_keywords": ["oran"],
        }
    },
    {
        "id": "T09", "group": "RATE",
        "query": "Gelir vergisi dilimleri ve oranları nelerdir?",
        "checks": {
            "expect_rate_question": True,
        }
    },
    {
        "id": "T10", "group": "RATE",
        "query": "BSMV oranı ne kadardır?",
        "checks": {
            "expect_rate_question": True,
        }
    },

    # ─── GROUP 3: Cross-Law Isolation (Kanun İzolasyonu) ───
    {
        "id": "T11", "group": "ISOLATION",
        "query": "KDV beyannamesi ne zaman verilir?",
        "checks": {
            "expect_top3_no_table": [],  # No wrong law
            "expect_content_keywords": ["beyanname"],
        }
    },
    {
        "id": "T12", "group": "ISOLATION",
        "query": "Gelir vergisi beyannamesi ne zaman verilir?",
        "checks": {
            "expect_content_keywords": ["gelir", "beyanname"],
        }
    },
    {
        "id": "T13", "group": "ISOLATION",
        "query": "Damga vergisi oranları nelerdir?",
        "checks": {
            "expect_content_keywords": ["damga"],
        }
    },
    {
        "id": "T14", "group": "ISOLATION",
        "query": "ÖTV listesi hangi ürünleri kapsar?",
        "checks": {
            "expect_content_keywords": ["ötv"],
        }
    },
    {
        "id": "T15", "group": "ISOLATION",
        "query": "Veraset ve intikal vergisi muafiyetleri nelerdir?",
        "checks": {
            "expect_content_keywords": ["veraset"],
        }
    },

    # ─── GROUP 4: Hybrid Search (Keyword + Vector) ───
    {
        "id": "T16", "group": "HYBRID",
        "query": "e-fatura zorunluluğu kimler için geçerli?",
        "checks": {
            "expect_min_results": 3,
            "expect_content_keywords": ["fatura"],
        }
    },
    {
        "id": "T17", "group": "HYBRID",
        "query": "Ba Bs formu nedir ne zaman verilir?",
        "checks": {
            "expect_min_results": 3,
            "expect_content_keywords": ["ba", "bs"],
        }
    },
    {
        "id": "T18", "group": "HYBRID",
        "query": "KDV iade prosedürü nasıl işler?",
        "checks": {
            "expect_min_results": 3,
        }
    },
    {
        "id": "T19", "group": "HYBRID",
        "query": "Vergi levhası asma zorunluluğu kaldırıldı mı?",
        "checks": {
            "expect_min_results": 3,
        }
    },
    {
        "id": "T20", "group": "HYBRID",
        "query": "Transfer fiyatlandırması belgelendirme yükümlülüğü",
        "checks": {
            "expect_min_results": 3,
        }
    },

    # ─── GROUP 5: Reranking & Priority Weighting ───
    {
        "id": "T21", "group": "RERANK",
        "query": "Vergi usul kanununa göre defter tutma yükümlülüğü",
        "checks": {
            "expect_rerank_applied": True,
            "expect_priority_weighted": True,
        }
    },
    {
        "id": "T22", "group": "RERANK",
        "query": "İndirimli orana tabi teslimlerden doğan KDV iadesi",
        "checks": {
            "expect_rerank_applied": True,
            "expect_priority_weighted": True,
        }
    },
    {
        "id": "T23", "group": "RERANK",
        "query": "Danıştay kararlarına göre vergi cezası iptali",
        "checks": {
            "expect_rerank_applied": True,
            "expect_priority_weighted": True,
            "expect_in_top5_tables": ["csv_danistaykararlari"],
        }
    },
    {
        "id": "T24", "group": "RERANK",
        "query": "Özelge ile vergi indirimi mümkün mü?",
        "checks": {
            "expect_rerank_applied": True,
            "expect_priority_weighted": True,
            "expect_in_top5_tables": ["csv_ozelge"],
        }
    },
    {
        "id": "T25", "group": "RERANK",
        "query": "Maliye Bakanlığı sirküleri KDV tevkifat uygulaması",
        "checks": {
            "expect_rerank_applied": True,
            "expect_priority_weighted": True,
        }
    },

    # ─── GROUP 6: Complex/Multi-Concept Queries ───
    {
        "id": "T26", "group": "COMPLEX",
        "query": "Sahte fatura düzenleme ve kullanma arasındaki fark nedir?",
        "checks": {
            "expect_min_results": 5,
        }
    },
    {
        "id": "T27", "group": "COMPLEX",
        "query": "Uzlaşma ve dava yolunun karşılaştırılması",
        "checks": {
            "expect_min_results": 3,
        }
    },
    {
        "id": "T28", "group": "COMPLEX",
        "query": "Vergi ziyaı cezasında tekerrür nasıl uygulanır?",
        "checks": {
            "expect_min_results": 3,
        }
    },
    {
        "id": "T29", "group": "COMPLEX",
        "query": "KDV ve ÖTV birlikte nasıl hesaplanır?",
        "checks": {
            "expect_min_results": 3,
        }
    },
    {
        "id": "T30", "group": "COMPLEX",
        "query": "Yıllara sari inşaat işlerinde vergilendirme nasıl yapılır?",
        "checks": {
            "expect_min_results": 3,
        }
    },

    # ─── GROUP 7: Edge Cases & Scoring Validation ───
    {
        "id": "T31", "group": "EDGE",
        "query": "a",
        "checks": {
            "expect_min_results": 0,  # Very short query
            "expect_may_fail": True,
        }
    },
    {
        "id": "T32", "group": "EDGE",
        "query": "Vergi vergi vergi vergi vergi",
        "checks": {
            "expect_min_results": 3,  # Repetitive query
        }
    },
    {
        "id": "T33", "group": "EDGE",
        "query": "What is the VAT rate in Turkey?",
        "checks": {
            "expect_min_results": 1,  # English query
        }
    },
    {
        "id": "T34", "group": "EDGE",
        "query": "مالیات بر ارزش افزوده",  # Farsi
        "checks": {
            "expect_min_results": 0,
            "expect_may_fail": True,
        }
    },
    {
        "id": "T35", "group": "EDGE",
        "query": "  KDV   oranı    nedir  ?  ",
        "checks": {
            "expect_min_results": 3,  # Extra whitespace
            "expect_content_keywords": ["kdv"],
        }
    },

    # ─── GROUP 8: Source Table Diversity & Scoring ───
    {
        "id": "T36", "group": "DIVERSITY",
        "query": "Vergi mahkemesi kararına itiraz süresi",
        "checks": {
            "expect_min_results": 3,
            "expect_multiple_tables": True,
        }
    },
    {
        "id": "T37", "group": "DIVERSITY",
        "query": "Katma değer vergisi kanunu genel tebliğ",
        "checks": {
            "expect_min_results": 5,
            "expect_multiple_tables": True,
        }
    },
    {
        "id": "T38", "group": "DIVERSITY",
        "query": "Mukteza özelge başvuru süreci",
        "checks": {
            "expect_min_results": 3,
        }
    },
    {
        "id": "T39", "group": "DIVERSITY",
        "query": "7440 sayılı kanun yapılandırma şartları",
        "checks": {
            "expect_min_results": 3,
            "expect_content_keywords": ["7440"],
        }
    },
    {
        "id": "T40", "group": "DIVERSITY",
        "query": "Enflasyon düzeltmesi uygulama esasları",
        "checks": {
            "expect_min_results": 3,
        }
    },
]


def search(query, limit=RESULTS_LIMIT, use_cache=False, debug=True):
    """Call the semantic search endpoint"""
    params = urllib.parse.urlencode({
        "query": query,
        "limit": limit,
        "use_cache": str(use_cache).lower(),
        "debug": str(debug).lower(),
    })
    url = BASE_URL + "?" + params

    req = urllib.request.Request(url)
    req.add_header("Content-Type", "application/json")

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return {"success": False, "error": str(e), "results": [], "total": 0}


def run_checks(test, data):
    """Run validation checks against search results"""
    checks = test["checks"]
    results = data.get("results", [])
    article_query = data.get("article_query") or {}
    passed = []
    failed = []

    # 1. Min results
    if "expect_min_results" in checks:
        min_r = checks["expect_min_results"]
        count = len(results)
        if count >= min_r:
            passed.append("min_results: %d >= %d" % (count, min_r))
        else:
            failed.append("min_results: got %d, expected >= %d" % (count, min_r))

    # 2. Article detection
    if checks.get("expect_article_detected"):
        # Python service returns "detected" not "is_article_query"
        detected = article_query.get("detected", article_query.get("is_article_query", False))
        if detected:
            passed.append("article_detected: True")
        else:
            failed.append("article_detected: expected True, got False")

    # 3. Law code
    if "expect_law_code" in checks:
        expected_code = checks["expect_law_code"]
        actual_code = article_query.get("law_code", "")
        if actual_code and expected_code.lower() in actual_code.lower():
            passed.append("law_code: %s" % actual_code)
        else:
            failed.append("law_code: expected %s, got '%s'" % (expected_code, actual_code))

    # 4. Article number
    if "expect_article_number" in checks:
        expected_num = checks["expect_article_number"]
        actual_num = str(article_query.get("article_number", ""))
        if actual_num == expected_num:
            passed.append("article_number: %s" % actual_num)
        else:
            failed.append("article_number: expected %s, got '%s'" % (expected_num, actual_num))

    # 5. Rate question detection
    if checks.get("expect_rate_question"):
        # Check multiple locations where rate_question flag can be
        settings_ctx = data.get("settings") or {}
        prompt_ctx = data.get("prompt_context") or {}
        is_rate = (
            prompt_ctx.get("is_rate_question", False) or
            settings_ctx.get("rate_question_detected", False) or
            article_query.get("is_rate_question", False) or
            data.get("rate_question_detected", False)
        )
        if is_rate:
            passed.append("rate_question: detected")
        else:
            failed.append("rate_question: expected True, not detected")

    # 6. Content keywords in top results
    if "expect_content_keywords" in checks:
        keywords = checks["expect_content_keywords"]
        top_content = " ".join([
            (r.get("title", "") + " " + r.get("content", "")).lower()
            for r in results[:5]
        ])
        for kw in keywords:
            if kw.lower() in top_content:
                passed.append("keyword '%s': found in top 5" % kw)
            else:
                failed.append("keyword '%s': NOT found in top 5 content" % kw)

    # 7. Expected table in top N
    if "expect_in_top3_tables" in checks:
        top3_tables = [r.get("source_table", "") for r in results[:3]]
        for expected_table in checks["expect_in_top3_tables"]:
            # Handle csv_ prefix mismatch: "danistaykararlari" matches "csv_danistaykararlari" and vice versa
            norm_expected = expected_table.replace("csv_", "")
            found = any(norm_expected in t.replace("csv_", "") for t in top3_tables)
            if found:
                passed.append("table in top3: %s" % expected_table)
            else:
                actual = ", ".join(top3_tables)
                failed.append("table in top3: expected %s, got [%s]" % (expected_table, actual))

    if "expect_in_top5_tables" in checks:
        top5_tables = [r.get("source_table", "") for r in results[:5]]
        for expected_table in checks["expect_in_top5_tables"]:
            norm_expected = expected_table.replace("csv_", "")
            found = any(norm_expected in t.replace("csv_", "") for t in top5_tables)
            if found:
                passed.append("table in top5: %s" % expected_table)
            else:
                actual = ", ".join(top5_tables)
                failed.append("table in top5: expected %s, got [%s]" % (expected_table, actual))

    # 8. Reranking applied
    if checks.get("expect_rerank_applied"):
        has_rerank = any(r.get("rerank_base") is not None for r in results[:5])
        if has_rerank:
            passed.append("rerank_applied: True")
        else:
            failed.append("rerank_applied: no rerank_base in top 5 results")

    # 9. Priority weighting applied
    if checks.get("expect_priority_weighted"):
        has_pw = any(r.get("rerank_priority_weighted") is not None for r in results[:5])
        if has_pw:
            passed.append("priority_weighted: True")
        else:
            # Check if source_priority and table_weight exist
            has_sp = any(r.get("source_priority") is not None for r in results[:5])
            has_tw = any(r.get("table_weight") is not None for r in results[:5])
            if has_sp and has_tw:
                # Priority fields exist but rerank_priority_weighted doesn't
                # This means reranking may not have run
                failed.append("priority_weighted: source_priority/table_weight exist but rerank_priority_weighted missing (reranking may be disabled)")
            else:
                failed.append("priority_weighted: no priority weighting fields in results")

    # 10. Multiple source tables (diversity)
    if checks.get("expect_multiple_tables"):
        tables = set(r.get("source_table", "") for r in results[:10])
        if len(tables) >= 2:
            passed.append("table_diversity: %d tables (%s)" % (len(tables), ", ".join(sorted(tables))))
        else:
            failed.append("table_diversity: only %d table(s): %s" % (len(tables), ", ".join(tables)))

    return passed, failed


def analyze_scoring(results):
    """Analyze scoring anomalies in results"""
    issues = []

    if not results:
        return issues

    # Check for score monotonicity (results should be sorted by final_score desc)
    scores = [r.get("final_score", 0) for r in results]
    for i in range(1, len(scores)):
        if scores[i] > scores[i-1] + 0.01:  # tolerance
            issues.append("SORT_ORDER: result[%d] score=%.1f > result[%d] score=%.1f" % (i, scores[i], i-1, scores[i-1]))

    # Check for zero scores
    zero_scores = [i for i, s in enumerate(scores) if s <= 0]
    if zero_scores:
        issues.append("ZERO_SCORE: %d results with score <= 0 at positions %s" % (len(zero_scores), zero_scores[:5]))

    # Check reranking consistency
    for i, r in enumerate(results[:5]):
        rerank_base = r.get("rerank_base")
        rpw = r.get("rerank_priority_weighted")
        sp = r.get("source_priority", 1.0)
        tw = r.get("table_weight", 1.0)

        if rerank_base is not None and rpw is not None:
            expected_rpw = round(rerank_base * sp * tw, 2)
            if abs(expected_rpw - rpw) > 0.1:
                issues.append("RERANK_MATH: result[%d] rerank_base=%.2f * sp=%.2f * tw=%.2f = %.2f but rpw=%.2f" % (
                    i, rerank_base, sp, tw, expected_rpw, rpw))

    # Check for duplicate source_ids
    source_ids = [r.get("source_id") or r.get("id") for r in results]
    seen = set()
    for sid in source_ids:
        if sid in seen:
            issues.append("DUPLICATE: source_id=%s appears multiple times" % sid)
        seen.add(sid)

    return issues


def main():
    print("=" * 80)
    print("  RAG PIPELINE END-TO-END TEST - 40 QUESTIONS")
    print("  Target: Vergilex Production (localhost:8003)")
    print("  Date: %s" % datetime.now().isoformat())
    print("  Cache: DISABLED (fresh results)")
    print("=" * 80)
    print()

    # Clear cache first
    try:
        req = urllib.request.Request(
            "http://localhost:8003/api/python/semantic-search/cache?type=search",
            method="DELETE"
        )
        urllib.request.urlopen(req, timeout=10)
        print("  Cache cleared successfully")
    except:
        print("  Warning: Could not clear cache")
    print()

    all_results = []
    group_stats = {}
    total_time = 0
    scoring_issues = []

    for i, test in enumerate(TESTS):
        group = test["group"]
        if group not in group_stats:
            group_stats[group] = {"pass": 0, "fail": 0, "error": 0}

        print("-" * 80)
        print("[%s] %s | Group: %s" % (test["id"], test["query"][:65], group))

        start = time.time()
        data = search(test["query"])
        elapsed = (time.time() - start) * 1000
        total_time += elapsed

        if not data.get("success"):
            error_msg = data.get("error", "Unknown error")
            if not data.get("detail"):
                error_msg = data.get("detail", error_msg)
            print("  ERROR: %s (%.0fms)" % (error_msg, elapsed))
            group_stats[group]["error"] += 1
            all_results.append({
                "id": test["id"], "group": group, "status": "ERROR",
                "error": error_msg, "time_ms": elapsed
            })
            continue

        results = data.get("results", [])
        timings = data.get("timings") or {}
        article_q = data.get("article_query") or {}

        # Show top 3 results
        print("  Results: %d | Time: %.0fms | Cache: %s" % (
            len(results), elapsed,
            timings.get("cache", "miss")
        ))
        if article_q and (article_q.get("detected") or article_q.get("is_article_query")):
            print("  Article: %s Madde %s" % (
                article_q.get("law_code", "?"),
                article_q.get("article_number", "?")
            ))

        for j, r in enumerate(results[:3]):
            rerank_info = ""
            if r.get("rerank_base") is not None:
                rerank_info = " | rr=%.1f rpw=%.1f pri=%.2f tw=%.1f" % (
                    r.get("rerank_base", 0),
                    r.get("rerank_priority_weighted", 0),
                    r.get("source_priority", 0),
                    r.get("table_weight", 0),
                )
            title = (r.get("title") or "")[:50]
            print("  [%d] score=%.1f%s | %s | %s" % (
                j+1, r.get("final_score", 0), rerank_info,
                r.get("source_table", "?"), title
            ))

        # Run checks
        passed_checks, failed_checks = run_checks(test, data)

        # Scoring analysis
        s_issues = analyze_scoring(results)
        if s_issues:
            scoring_issues.extend([(test["id"], issue) for issue in s_issues])

        # Print check results
        for pc in passed_checks:
            print("  PASS: %s" % pc)
        for fc in failed_checks:
            print("  FAIL: %s" % fc)
        if s_issues:
            for si in s_issues:
                print("  WARN: %s" % si)

        is_pass = len(failed_checks) == 0
        if test["checks"].get("expect_may_fail") and len(failed_checks) > 0:
            is_pass = True  # Expected edge case failures
            print("  (Edge case - failures expected)")

        status = "PASS" if is_pass else "FAIL"
        print("  Result: %s %s" % ("OK" if is_pass else "XX", status))

        if is_pass:
            group_stats[group]["pass"] += 1
        else:
            group_stats[group]["fail"] += 1

        all_results.append({
            "id": test["id"],
            "group": group,
            "status": status,
            "result_count": len(results),
            "time_ms": round(elapsed, 1),
            "passed_checks": passed_checks,
            "failed_checks": failed_checks,
            "scoring_issues": s_issues,
            "top3_tables": [r.get("source_table", "") for r in results[:3]],
            "top3_scores": [r.get("final_score", 0) for r in results[:3]],
            "has_rerank": any(r.get("rerank_base") is not None for r in results[:5]),
            "has_priority_weight": any(r.get("rerank_priority_weighted") is not None for r in results[:5]),
        })

    # ═══════════════════════════════════════════════════════════
    # SUMMARY REPORT
    # ═══════════════════════════════════════════════════════════
    print()
    print("=" * 80)
    print("  SUMMARY REPORT")
    print("=" * 80)

    total_pass = sum(g["pass"] for g in group_stats.values())
    total_fail = sum(g["fail"] for g in group_stats.values())
    total_error = sum(g["error"] for g in group_stats.values())
    total_tests = total_pass + total_fail + total_error

    print()
    print("Overall: %d/%d PASSED (%.0f%%)" % (total_pass, total_tests, total_pass/total_tests*100 if total_tests else 0))
    print("Total time: %.1fs (avg %.0fms/query)" % (total_time/1000, total_time/total_tests if total_tests else 0))
    print()

    print("Group Results:")
    print("  %-12s  %-6s  %-6s  %-6s" % ("Group", "Pass", "Fail", "Error"))
    print("  " + "-" * 36)
    for group in ["ARTICLE", "RATE", "ISOLATION", "HYBRID", "RERANK", "COMPLEX", "EDGE", "DIVERSITY"]:
        g = group_stats.get(group, {"pass": 0, "fail": 0, "error": 0})
        print("  %-12s  %-6d  %-6d  %-6d" % (group, g["pass"], g["fail"], g["error"]))

    # Failed tests detail
    failed_tests = [r for r in all_results if r["status"] == "FAIL"]
    if failed_tests:
        print()
        print("=" * 80)
        print("  FAILED TESTS DETAIL")
        print("=" * 80)
        for ft in failed_tests:
            print()
            print("[%s] Group: %s" % (ft["id"], ft["group"]))
            for fc in ft.get("failed_checks", []):
                print("  FAIL: %s" % fc)
            print("  Top 3 tables: %s" % ", ".join(ft.get("top3_tables", [])))
            print("  Top 3 scores: %s" % ", ".join(["%.1f" % s for s in ft.get("top3_scores", [])]))
            print("  Has rerank: %s | Has priority_weight: %s" % (ft.get("has_rerank"), ft.get("has_priority_weight")))

    # Scoring issues
    if scoring_issues:
        print()
        print("=" * 80)
        print("  SCORING ANOMALIES")
        print("=" * 80)
        for tid, issue in scoring_issues:
            print("  [%s] %s" % (tid, issue))

    # Reranking status summary
    print()
    print("=" * 80)
    print("  RERANKING STATUS")
    print("=" * 80)
    rerank_count = sum(1 for r in all_results if r.get("has_rerank"))
    pw_count = sum(1 for r in all_results if r.get("has_priority_weight"))
    print("  Tests with rerank_base: %d/%d" % (rerank_count, total_tests))
    print("  Tests with rerank_priority_weighted: %d/%d" % (pw_count, total_tests))

    if rerank_count == 0:
        print()
        print("  WARNING: Jina reranking appears to be DISABLED!")
        print("  The rerank_base field is missing from all results.")
        print("  Check ragSettings.rerankEnabled in the database.")

    if rerank_count > 0 and pw_count == 0:
        print()
        print("  WARNING: Reranking is active but priority weighting is NOT applied!")
        print("  The rerank_priority_weighted field is missing from results.")
        print("  This means the v12.50 change may not be deployed correctly.")

    print()
    print("=" * 80)

    # Save JSON report
    report = {
        "date": datetime.now().isoformat(),
        "total_tests": total_tests,
        "passed": total_pass,
        "failed": total_fail,
        "errors": total_error,
        "total_time_ms": round(total_time, 1),
        "group_stats": group_stats,
        "scoring_issues": [{"test": t, "issue": i} for t, i in scoring_issues],
        "results": all_results,
    }

    report_path = "/tmp/rag-test-report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print("  JSON report saved to: %s" % report_path)

    return 0 if total_fail == 0 and total_error == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
