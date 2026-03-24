import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
d = json.load(open('c:/xampp/htdocs/lsemb/backend/scripts/test_gvk2.json','r',encoding='utf-8'))
settings = d.get('settings', {})
print('detected_law_code:', settings.get('detected_law_code'))
print('law_affinity_applied:', settings.get('law_affinity_applied'))
print('law_affinity_match:', settings.get('law_affinity_match_count'))
print('law_affinity_wrong:', settings.get('law_affinity_wrong_count'))
print()
r = d.get('results', [])
for i, x in enumerate(r[:7]):
    rr = x.get('rerank_base')
    rr_str = ' rr=%.1f' % rr if rr is not None else ''
    la = x.get('law_affinity_boost', 0)
    la_str = (' la=%.1f' % la) if la != 0 else ''
    print('  [%d] score=%.1f%s%s table=%s | %s' % (
        i+1, x.get('final_score',0), rr_str, la_str, x.get('source_table','?'), (x.get('title','') or '')[:55]
    ))
