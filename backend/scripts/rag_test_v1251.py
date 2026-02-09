#!/usr/bin/env python3
"""
Vergilex RAG Test Suite v12.51 - 30 Advanced Questions
Includes trick questions, edge cases, cross-reference traps
"""
import requests, json, time, sys, re, io, uuid
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

BASE = "http://localhost:8087/api/v2"
PASS_COUNT = 0
FAIL_COUNT = 0
RESULTS = []

# Login
r = requests.post(f"{BASE}/auth/login", json={"email":"admin@vergilex.com","password":"admin123"})
TOKEN = r.json().get("accessToken","")
if not TOKEN:
    print("AUTH FAILED"); sys.exit(1)
HEADERS = {"Content-Type":"application/json","Authorization":f"Bearer {TOKEN}"}

def ask(q, cid, checks, category, desc, timeout=45):
    global PASS_COUNT, FAIL_COUNT
    try:
        # Don't send conversationId - let backend create new conversation each time
        r = requests.post(f"{BASE}/chat", headers=HEADERS, json={"message":q}, timeout=timeout)
        data = r.json()
        msg = (data.get("response","") or data.get("message","") or "").strip()
        sources = data.get("sources",[])
        src_count = len(sources)
        s1_table = sources[0].get("sourceTable","?") if sources else "none"
        s1_tw = sources[0].get("table_weight","?") if sources else "?"

        results = []
        all_pass = True
        for name, fn in checks.items():
            try:
                ok = fn(msg, sources, data)
            except:
                ok = False
            results.append((name, ok))
            if not ok:
                all_pass = False

        status = "PASS" if all_pass else "FAIL"
        if all_pass: PASS_COUNT += 1
        else: FAIL_COUNT += 1

        check_str = " | ".join([("V " if ok else "X ") + n for n,ok in results])
        print(f"[{status}] {category}: {desc}")
        print(f"  Q: {q[:80]}")
        print(f"  A: {msg[:150]}")
        print(f"  Sources: {src_count} | Top1: {s1_table} (tw={s1_tw})")
        print(f"  Checks: {check_str}")
        print()

        RESULTS.append({"category":category,"desc":desc,"status":status,"msg":msg[:200],"sources":src_count,"checks":results})
        return data
    except Exception as e:
        FAIL_COUNT += 1
        print(f"[FAIL] {category}: {desc} - ERROR: {e}")
        print()
        RESULTS.append({"category":category,"desc":desc,"status":"ERROR","msg":str(e),"sources":0,"checks":[]})
        return None

# ================================================================
# CATEGORY 1: DETERMINISTIC DEADLINE (Tests 1-6)
# ================================================================

ask("KDV beyannamesi ne zaman verilir?", "adv-t1",
    {"has_24": lambda m,s,d: "24" in m,
     "has_m41": lambda m,s,d: "madde 41" in m.lower() or "m.41" in m,
     "citation_1": lambda m,s,d: "[1]" in m,
     "top1_kanun": lambda m,s,d: "kanun" in (s[0].get("sourceTable","") if s else "").lower()},
    "DET", "1. Beyanname standard")
time.sleep(4)

ask("KDV odemesi ne zaman yapilir?", "adv-t2",
    {"has_26": lambda m,s,d: "26" in m,
     "has_m46": lambda m,s,d: "madde 46" in m.lower() or "m.46" in m,
     "no_m41": lambda m,s,d: "madde 41" not in m.lower()},
    "DET", "2. Odeme - madde 46 olmali, 41 DEGIL")
time.sleep(4)

ask("KDV beyannamesi 26'sina kadar verilir degil mi?", "adv-t3",
    {"corrects_to_24": lambda m,s,d: "24" in m,
     "no_crash": lambda m,s,d: len(m) > 20},
    "TRICK", "3. Yanlis tarih duzeltme (26->24)")
time.sleep(4)

ask("KDV odeme tarihi 24 mu?", "adv-t4",
    {"has_26": lambda m,s,d: "26" in m,
     "corrects": lambda m,s,d: "26" in m or "odeme" in m.lower()},
    "TRICK", "4. Odeme yanlis tarih (24->26)")
time.sleep(4)

ask("KDV beyanname suresi ile odeme suresi arasindaki fark nedir?", "adv-t5",
    {"has_24": lambda m,s,d: "24" in m,
     "has_26": lambda m,s,d: "26" in m,
     "both_articles": lambda m,s,d: ("41" in m) and ("46" in m)},
    "DET", "5. Karsilastirma - 24/26 + m.41/m.46")
time.sleep(4)

ask("Ayin kacina kadar KDV beyannamemi vermeliyim?", "adv-t6",
    {"has_24": lambda m,s,d: "24" in m,
     "intent_ok": lambda m,s,d: len(m) > 30},
    "DET", "6. Dolayli ifade - ayin kacina kadar")
time.sleep(4)

# ================================================================
# CATEGORY 2: CITATION INTEGRITY (Tests 7-11)
# ================================================================

ask("VUK 341'e gore vergi ziyai cezasi nedir?", "adv-t7",
    {"has_341": lambda m,s,d: "341" in m,
     "no_merge": lambda m,s,d: "34[1]" not in m,
     "has_citation": lambda m,s,d: bool(re.search(r'\[\d+\]', m))},
    "CITE", "7. VUK 341 - citation/article ayrimi")
time.sleep(4)

ask("KDVK 43. madde nedir?", "adv-t8",
    {"no_merge_43": lambda m,s,d: "4[3]" not in m,
     "has_43": lambda m,s,d: "43" in m},
    "CITE", "8. KDVK 43 - madde/citation merge testi")
time.sleep(4)

ask("GVK 70. madde kapsaminda gayrimenkul sermaye iradi nedir?", "adv-t9",
    {"has_70": lambda m,s,d: "70" in m,
     "no_merge_70": lambda m,s,d: "7[0]" not in m,
     "has_content": lambda m,s,d: len(m) > 50},
    "CITE", "9. GVK 70 - 7[0] merge trap")
time.sleep(4)

ask("VUK 359'a gore sahte fatura kullanmanin cezasi nedir?", "adv-t10",
    {"has_359": lambda m,s,d: "359" in m,
     "has_ceza": lambda m,s,d: "ceza" in m.lower() or "hapis" in m.lower(),
     "has_citation": lambda m,s,d: bool(re.search(r'\[\d+\]', m))},
    "CITE", "10. VUK 359 - sahte fatura cezasi")
time.sleep(4)

ask("KDVK madde 29'a gore KDV indirimi nasil yapilir?", "adv-t11",
    {"has_29": lambda m,s,d: "29" in m,
     "no_excessive_cite": lambda m,s,d: m.count("[") < 10,
     "has_content": lambda m,s,d: len(m) > 50},
    "CITE", "11. KDVK 29 - citation enflasyonu kontrolu")
time.sleep(4)

# ================================================================
# CATEGORY 3: SCOPE GUARDS (Tests 12-17)
# ================================================================

ask("TMK 166'ya gore bosanma davasi nasil acilir?", "adv-t12",
    {"out_of_scope": lambda m,s,d: any(w in m.lower() for w in ["kapsam","uzmanl","dışında","disinda","yardımcı","yardimci","vergi"]) or d.get("_debug",{}).get("responseType","") == "OUT_OF_SCOPE"},
    "SCOPE", "12. Off-topic TMK - kapsam disi")
time.sleep(4)

ask("Galatasaray'in son maci kac kac bitti?", "adv-t13",
    {"no_answer": lambda m,s,d: any(w in m.lower() for w in ["kapsam","alan","disinda","yardimci","bilgi","vergi"])},
    "SCOPE", "13. Off-topic spor")
time.sleep(4)

ask("Einstein'in ozel gorelilik teorisinde vergi var mi?", "adv-t14",
    {"no_hallucination": lambda m,s,d: len(m) < 500 or any(w in m.lower() for w in ["kapsam","bulunmamaktad","ilişkin bir bilgi","fiziksel"])},
    "SCOPE", "14. Trick: Einstein + vergi trap")
time.sleep(4)

ask("VUK 114'; DROP TABLE users; --", "adv-t15",
    {"no_crash": lambda m,s,d: len(m) > 10,
     "no_error": lambda m,s,d: "hata olustu" not in m.lower()},
    "SCOPE", "15. SQL injection attempt")
time.sleep(4)

ask("<script>alert('xss')</script> KDV orani nedir?", "adv-t16",
    {"no_crash": lambda m,s,d: len(m) > 10,
     "no_script": lambda m,s,d: "<script>" not in m},
    "SCOPE", "16. XSS attempt with valid question")
time.sleep(4)

ask("vergi", "adv-t17",
    {"no_wiki": lambda m,s,d: len(m) < 2000,
     "has_response": lambda m,s,d: len(m) > 10 or bool(d.get("suggestedQuestions"))},
    "SCOPE", "17. Tek kelime 'vergi'")
time.sleep(4)

# ================================================================
# CATEGORY 4: RAG QUALITY (Tests 18-24)
# ================================================================

ask("Kurumlar vergisi orani kactir?", "adv-t18",
    {"has_rate": lambda m,s,d: any(x in m for x in ["20","25","%","oran"]),
     "no_hallucination": lambda m,s,d: "1000" not in m},
    "RAG", "18. Kurumlar vergisi orani")
time.sleep(4)

ask("Gelir vergisi beyannamesi ne zaman verilir?", "adv-t19",
    {"has_mart": lambda m,s,d: any(w in m.lower() for w in ["mart","march"]),
     "no_kdv_confusion": lambda m,s,d: not ("24" in m and "kdv" in m.lower()[:100])},
    "RAG", "19. Gelir vergisi beyanname - KDV karistirmamali")
time.sleep(4)

ask("KDV ve OTV arasindaki farklar nelerdir?", "adv-t20",
    {"has_kdv": lambda m,s,d: "kdv" in m.lower() or "katma" in m.lower(),
     "has_otv": lambda m,s,d: "otv" in m.lower() or "ötv" in m.lower() or "tuketim" in m.lower() or "tüketim" in m.lower(),
     "both_covered": lambda m,s,d: len(m) > 100},
    "RAG", "20. KDV vs OTV karsilastirma")
time.sleep(4)

ask("Gelir vergisi beyannamesi ayin 24'une kadar mi verilir?", "adv-t21",
    {"not_24_for_gv": lambda m,s,d: "mart" in m.lower() or "yillik" in m.lower() or "subat" in m.lower() or "1-" in m or "25" in m,
     "no_confusion": lambda m,s,d: len(m) > 30},
    "TRICK", "21. GV beyanname 24? - KDV karistirma trap")
time.sleep(4)

ask("Fatura duzenleme suresi nedir?", "adv-t22",
    {"has_answer": lambda m,s,d: len(m) > 50,
     "has_day_info": lambda m,s,d: any(x in m for x in ["7","yedi","gun","sure"])},
    "RAG", "22. Fatura duzenleme suresi")
time.sleep(4)

ask("Vergi levhasi asilma zorunlulugu kalkti mi?", "adv-t23",
    {"has_answer": lambda m,s,d: len(m) > 30,
     "no_crash": lambda m,s,d: "hata" not in m.lower()[:30]},
    "RAG", "23. Vergi levhasi - guncel bilgi")
time.sleep(4)

ask("VUK 114'e gore zamanasimi suresi nedir?", "adv-t24",
    {"has_114": lambda m,s,d: "114" in m,
     "has_year": lambda m,s,d: any(x in m for x in ["5","bes","yil"]),
     "has_citation": lambda m,s,d: bool(re.search(r'\[\d+\]', m))},
    "RAG", "24. VUK 114 zamanasimi - 5 yil + citation")
time.sleep(4)

# ================================================================
# CATEGORY 5: DISAMBIGUATION (Tests 25-27)
# ================================================================

ask("KDV 24 mu 26 mi?", "adv-t25",
    {"no_date_leak": lambda m,s,d: not ("24'u" in m.lower() and "26's" in m.lower()),
     "has_question": lambda m,s,d: "?" in m or "beyanname" in m.lower() or "odeme" in m.lower()},
    "DISAMB", "25. 24 vs 26 - tarih sizdirmadan netlestirme")
time.sleep(4)

ask("341", "adv-t26",
    {"has_response": lambda m,s,d: len(m) > 10,
     "no_crash": lambda m,s,d: True},
    "DISAMB", "26. Sadece sayi 341")
time.sleep(4)

ask("kdv beyannmesi nagi gun", "adv-t27",
    {"has_24": lambda m,s,d: "24" in m,
     "resolved": lambda m,s,d: len(m) > 30},
    "DISAMB", "27. Agir typo: beyannmesi nagi gun")
time.sleep(4)

# ================================================================
# CATEGORY 6: CROSS-REFERENCE & TRAPS (Tests 28-30)
# ================================================================

ask("VUK 114 ve KDVK 29 arasinda ne fark var?", "adv-t28",
    {"has_114": lambda m,s,d: "114" in m or "vuk" in m.lower() or "zamanaşımı" in m.lower() or "zamanasimi" in m.lower(),
     "has_29": lambda m,s,d: "29" in m or "kdvk" in m.lower() or "indirim" in m.lower(),
     "both_covered": lambda m,s,d: len(m) > 100},
    "CROSS", "28. Iki farkli kanun maddesi karsilastirma")
time.sleep(4)

ask("Vergi Usul Kanunu'nun 114. maddesi kapsaminda vergi alacaginin zamanasimina iliskin hukumler nelerdir, bu kapsamda ozel zamanasimlari ve bunlarin uygulamadaki yansimalari hakkinda detayli bilgi verebilir misiniz?", "adv-t29",
    {"has_answer": lambda m,s,d: len(m) > 100,
     "has_114": lambda m,s,d: "114" in m,
     "no_timeout": lambda m,s,d: True},
    "CROSS", "29. Cok uzun soru - timeout/crash kontrolu")
time.sleep(4)

ask("What is the VAT rate in Turkey according to KDVK?", "adv-t30",
    {"has_answer": lambda m,s,d: len(m) > 30,
     "has_rate": lambda m,s,d: any(x in m for x in ["%","oran","rate","18","20","1","10","8"]),
     "no_crash": lambda m,s,d: True},
    "CROSS", "30. Ingilizce soru - Turk vergi hukuku")

# ================================================================
# SUMMARY
# ================================================================
print("=" * 60)
print(f"TOPLAM: {PASS_COUNT + FAIL_COUNT} test | PASS: {PASS_COUNT} | FAIL: {FAIL_COUNT}")
pct = 100*PASS_COUNT/(PASS_COUNT+FAIL_COUNT) if (PASS_COUNT+FAIL_COUNT) > 0 else 0
print(f"Basari orani: {PASS_COUNT}/{PASS_COUNT+FAIL_COUNT} ({pct:.0f}%)")
print("=" * 60)

cats = {}
for r in RESULTS:
    c = r["category"]
    if c not in cats: cats[c] = {"pass":0,"fail":0}
    if r["status"] == "PASS": cats[c]["pass"] += 1
    else: cats[c]["fail"] += 1

print("\nKategori Bazinda:")
for c, v in cats.items():
    total = v["pass"]+v["fail"]
    pct = 100*v["pass"]/total if total > 0 else 0
    print(f"  {c}: {v['pass']}/{total} ({pct:.0f}%)")

failed = [r for r in RESULTS if r["status"] != "PASS"]
if failed:
    print(f"\nBASARISIZ TESTLER ({len(failed)}):")
    for r in failed:
        fn = [n for n,ok in r["checks"] if not ok]
        print(f"  X [{r['category']}] {r['desc']}")
        print(f"     Failed: {', '.join(fn)}")
        print(f"     Response: {r['msg'][:120]}")
else:
    print("\nTUM TESTLER BASARILI!")
