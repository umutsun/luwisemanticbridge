# -*- coding: utf-8 -*-
import subprocess
import json
import sys

TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJlZTE4MmU5Zi02YzAwLTRhZjgtYmQzMi0xOTI2MWU0MzJlYjAiLCJlbWFpbCI6ImFkbWluQHZlcmdpbGV4LmNvbSIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc2OTUyNjkxMSwiZXhwIjoxNzY5NTMwNTExfQ.ZY5E35o-b2yy_FGuULuKkymFOAH_nTzPB2npJOBA3Ig"

tests = [
    {
        "id": "T1-ODEME",
        "name": "KDV Odeme Suresi",
        "query": "KDV odemesi ayin kacina kadar yapilir?",
        "expected": {"day": "26", "article": "madde 46"}
    },
    {
        "id": "T2-BEYANNAME",
        "name": "KDV Beyanname Suresi",
        "query": "KDV beyannamesi ne zaman verilir?",
        "expected": {"day": "24", "article": "madde 41"}
    },
    {
        "id": "T3-AMBIGUOUS",
        "name": "Ambiguous Sorgu",
        "query": "KDV beyanname 24 mu 26 mi?",
        "expected": {"both": True}
    },
    {
        "id": "T4-CROSSLAW",
        "name": "Cross-Law Isolation",
        "query": "KDV beyanname suresi nedir?",
        "expected": {"no_dvk": True}
    }
]

def run_test(query):
    cmd = f'''ssh -p 2222 root@49.13.38.58 "curl -s -m 120 -X POST 'http://localhost:8087/api/v2/chat' -H 'Content-Type: application/json' -H 'Authorization: Bearer {TOKEN}' -d '{{\\\"message\\\": \\\"{query}\\\", \\\"conversationId\\\": null}}'"'''
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, encoding='utf-8')
    return result.stdout

def analyze_response(data, expected):
    content = data.get('response', '')
    sources = data.get('sources', [])
    checks = []

    if "day" in expected:
        has_day = expected["day"] in content
        checks.append((f"Contains {expected['day']}", has_day))

    if "article" in expected:
        has_article = expected["article"] in content.lower()
        checks.append((f"Contains {expected['article']}", has_article))

    if expected.get("both"):
        has_both = "24" in content and "26" in content
        checks.append(("Contains both 24 & 26", has_both))

    top_titles = [s.get('title', '')[:50].upper() for s in sources[:5]]
    kdvk_top = any('KATMA' in t or 'KDV' in t for t in top_titles[:3])
    checks.append(("KDVK in top 3", kdvk_top))

    if expected.get("no_dvk"):
        no_dvk = not any('DAMGA' in t for t in top_titles[:5])
        checks.append(("No DVK in top 5", no_dvk))

    return content, sources, checks

print("=" * 65)
print("  VERGILEX RAG v12.20 - KAPSAMLI TEST RAPORU")
print("  Build: v12.20 (031759d5)")
print("=" * 65)
print()

results = []

for test in tests:
    print(f"--- {test['id']}: {test['name']} ---")
    print(f"Sorgu: {test['query']}")

    try:
        raw = run_test(test['query'])
        data = json.loads(raw)
        content, sources, checks = analyze_response(data, test['expected'])

        print(f"Cevap: {content[:150]}...")
        print()
        print("Kontroller:")
        for check_name, passed in checks:
            status = "PASS" if passed else "FAIL"
            print(f"  [{status}] {check_name}")

        all_pass = all(p for _, p in checks)
        results.append((test['id'], all_pass))
        print(f"\nSonuc: {'PASS' if all_pass else 'FAIL'}")

    except Exception as e:
        print(f"HATA: {e}")
        results.append((test['id'], False))

    print()

print("=" * 65)
print("  OZET")
print("=" * 65)
passed = sum(1 for _, p in results if p)
total = len(results)
print(f"\nToplam: {passed}/{total} test basarili")
print()
for test_id, p in results:
    status = "PASS" if p else "FAIL"
    print(f"  [{status}] {test_id}")

print()
print("=" * 65)
