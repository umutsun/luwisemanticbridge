#!/usr/bin/env python3
"""Quick targeted tests for v12.52 fixes"""
import requests, json, time, sys

BASE = "http://localhost:8087/api/v2"
r = requests.post(f"{BASE}/auth/login", json={"email":"admin@vergilex.com","password":"admin123"})
TOKEN = r.json().get("accessToken","")
if not TOKEN:
    print("AUTH FAILED"); sys.exit(1)
HEADERS = {"Content-Type":"application/json","Authorization":f"Bearer {TOKEN}"}

passed = 0
failed = 0

def test(q, cid, checks_dict, desc, timeout=45):
    global passed, failed
    try:
        r = requests.post(f"{BASE}/chat", headers=HEADERS, json={"message":q,"conversationId":cid}, timeout=timeout)
        data = r.json()
        msg = (data.get("response","") or data.get("message","") or "").strip()
        sources = data.get("sources",[])
        s1 = sources[0].get("sourceTable","?") if sources else "none"

        results = []
        all_ok = True
        for name, fn in checks_dict.items():
            try:
                ok = fn(msg, sources, data)
            except:
                ok = False
            results.append((name, ok))
            if not ok:
                all_ok = False

        status = "PASS" if all_ok else "FAIL"
        if all_ok:
            passed += 1
        else:
            failed += 1

        check_str = " | ".join([("V " if ok else "X ") + n for n, ok in results])
        print(f"[{status}] {desc}")
        print(f"  Q: {q[:80]}")
        print(f"  A: {msg[:200]}")
        print(f"  Sources: {len(sources)} | Top1: {s1}")
        print(f"  Checks: {check_str}")
        print()
        return msg
    except Exception as e:
        failed += 1
        print(f"[FAIL] {desc} - ERROR: {e}")
        print()
        return ""

# === CRITICAL TESTS ===

# 1. Comparison: beyanname vs odeme fark
test("KDV beyanname suresi ile odeme suresi arasindaki fark nedir?", "qt-1",
    {"has_24": lambda m,s,d: "24" in m,
     "has_26": lambda m,s,d: "26" in m,
     "has_both_articles": lambda m,s,d: "41" in m and "46" in m},
    "1. Comparison: 24+26+m.41+m.46")
time.sleep(5)

# 2. Odeme deadline
test("KDV odemesi ne zaman yapilir?", "qt-2",
    {"has_26": lambda m,s,d: "26" in m,
     "has_m46": lambda m,s,d: "madde 46" in m.lower() or "m.46" in m},
    "2. Odeme: 26 + m.46")
time.sleep(5)

# 3. Beyanname deadline
test("KDV beyannamesi ne zaman verilir?", "qt-3",
    {"has_24": lambda m,s,d: "24" in m,
     "has_m41": lambda m,s,d: "madde 41" in m.lower() or "m.41" in m,
     "top1_kanun": lambda m,s,d: "kanun" in (s[0].get("sourceTable","") if s else "").lower()},
    "3. Beyanname: 24 + m.41 + kanun top1")
time.sleep(5)

# 4. KDVK 29 (should NOT trigger disambiguation)
test("KDVK madde 29'a gore KDV indirimi nasil yapilir?", "qt-4",
    {"has_29": lambda m,s,d: "29" in m,
     "no_disamb": lambda m,s,d: "beyanname" not in m.lower()[:100] or "indirimi" in m.lower(),
     "has_content": lambda m,s,d: len(m) > 50},
    "4. KDVK 29: no disambiguation, real RAG answer")
time.sleep(5)

# 5. Disambiguation (should ask question, NOT give answer)
test("KDV 24 mu 26 mi?", "qt-5",
    {"has_disamb": lambda m,s,d: "beyanname" in m.lower() or "odeme" in m.lower() or "ödeme" in m.lower(),
     "no_date_leak": lambda m,s,d: "24'" not in m and "26'" not in m},
    "5. Disamb: question only, no date leak")
time.sleep(5)

# 6. TMK off-topic
test("TMK 166'ya gore bosanma davasi nasil acilir?", "qt-6",
    {"has_response": lambda m,s,d: len(m) > 10,
     "out_of_scope": lambda m,s,d: any(w in m.lower() for w in ["kapsam","uzmanlik","disinda","yardimci","vergi"])},
    "6. TMK off-topic: scope guard")
time.sleep(5)

# 7. VUK 114 zamanasimi
test("VUK 114'e gore zamanasimi suresi nedir?", "qt-7",
    {"has_114": lambda m,s,d: "114" in m,
     "has_5_yil": lambda m,s,d: any(x in m for x in ["5","bes","beş"]),
     "has_content": lambda m,s,d: len(m) > 50},
    "7. VUK 114: zamanasimi 5 yil")
time.sleep(5)

# 8. Typo tolerance
test("kdv beyannmesi nagi gun", "qt-8",
    {"has_24": lambda m,s,d: "24" in m,
     "resolved": lambda m,s,d: len(m) > 30},
    "8. Typo: beyannmesi nagi gun -> 24")

# Summary
print("=" * 60)
total = passed + failed
pct = 100 * passed / total if total > 0 else 0
print(f"TOTAL: {total} | PASS: {passed} | FAIL: {failed} ({pct:.0f}%)")
print("=" * 60)
