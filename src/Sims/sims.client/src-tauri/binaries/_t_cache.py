import sys, json, time
sys.path.insert(0, '.')
from needle import Needle

tools = [
    {"name": "filter_active_grid",
     "description": "Filters the open grid. Params: query (string, REQUIRED), column (string).",
     "parameters": {"type": "object", "properties": {"query": {"type": "string"}, "column": {"type": "string"}}, "required": ["query"]}},
    {"name": "clear_grid_filters",
     "description": "Tum filtreleri temizler.",
     "parameters": {"type": "object", "properties": {}}},
]

def probe(agent, label):
    results = []
    t0 = time.time()
    prompts = ["filtreleri temizle", "SKU-102 filtrele", "filtreleri temizle"]
    for p in prompts:
        r = agent.complete(p)
        results.append(f"{r.get('type')}:{(r.get('function_calls') or [{}])[0].get('name','-')}")
    print(f"{label}: {round((time.time()-t0)*1000)}ms | {' | '.join(results)}")

# A) Cache + reset yok (durum kirlenmesi beklenir)
a = Needle(tools=tools)
probe(a, "A cache, reset YOK ")

# B) Cache + her complete sonrasi needle_reset
import needle
b = Needle(tools=tools)
results = []
t0 = time.time()
for p in ["filtreleri temizle", "SKU-102 filtrele", "filtreleri temizle"]:
    r = b.complete(p)
    results.append(f"{r.get('type')}:{(r.get('function_calls') or [{}])[0].get('name','-')}")
    try:
        needle._lib().needle_reset()
    except Exception as e:
        print("reset hata:", e)
print(f"B cache, reset VAR : {round((time.time()-t0)*1000)}ms | {' | '.join(results)}")

# C) Her seferinde taze ornek (mevcut davranis) — referans
t0 = time.time()
for p in ["filtreleri temizle", "SKU-102 filtrele", "filtreleri temizle"]:
    c = Needle(tools=tools)
    r = c.complete(p)
    print(f"C taze: {r.get('type')}:{(r.get('function_calls') or [{}])[0].get('name','-')}", end="  ")
print(f"| toplam {round((time.time()-t0)*1000)}ms")
