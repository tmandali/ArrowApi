#!/usr/bin/env python3
"""
Sims ERP - Needle Fine-Tuning Dataset Generator (PoC)
Generates high quality Turkish ERP training data from JSON schemas for Needle SLM fine-tuning.
"""

import json
import random
import os
from datetime import datetime, timedelta

# Two schemas in standard tool calling definition format
TOOLS = [
    {
        "name": "filter_stock_balance",
        "description": "Depo ve ambarlardaki mevcut ürünlerin kalan stok adetlerini, parasal değerlerini, hareket tarihlerini ve durumlarını sorgular.",
        "parameters": {
            "type": "object",
            "properties": {
                "kayitTarihi": {
                    "type": "string",
                    "description": "Stok hareketinin gerçekleştiği tarih veya tarih aralığı (örn: 2026-08-20 veya 2026-08-01..2026-08-20)"
                },
                "durum": {
                    "type": "array",
                    "items": {"type": "string", "enum": ["AKTIF", "PASIF", "BEKLEMEDE", "IPTAL"]},
                    "description": "Stok kaydının geçerlilik durumu."
                },
                "tutarMiktar": {
                    "type": "number",
                    "description": "Filtrelenecek minimum parasal tutar miktarı"
                },
                "tutarParaBirimi": {
                    "type": "string",
                    "enum": ["TRY", "USD", "EUR"],
                    "description": "Tutarın döviz cinsi. Varsayılan TRY."
                },
                "depo": {
                    "type": "string",
                    "description": "Filtrelenecek ambar veya depo adı (örn: Ana Depo, Merkez, Gebze)"
                },
                "urun": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Filtrelenecek ürün kodları veya adları"
                }
            }
        }
    },
    {
        "name": "filter_stock_analytics",
        "description": "Dönemsel stok analitiği, borç/alacak kapanış bakiyeleri ve maliyet analizi sorgular.",
        "parameters": {
            "type": "object",
            "properties": {
                "fromDate": {
                    "type": "string",
                    "description": "Rapor başlangıç tarihi (YYYY-MM-DD)"
                },
                "toDate": {
                    "type": "string",
                    "description": "Rapor bitiş tarihi (YYYY-MM-DD)"
                },
                "financeBook": {
                    "type": "string",
                    "enum": ["Main Book", "Tax Book", "Budget Book"],
                    "description": "Finans defteri"
                },
                "fiscalYear": {
                    "type": "string",
                    "description": "Mali yıl (örn: 2025-2026)"
                },
                "currency": {
                    "type": "string",
                    "enum": ["TRY", "USD", "EUR"],
                    "description": "Rapor para birimi"
                }
            }
        }
    }
]

TODAY = datetime(2026, 8, 21)
YESTERDAY = TODAY - timedelta(days=1)
LAST_WEEK_START = TODAY - timedelta(days=7)
LAST_MONTH_START = TODAY - timedelta(days=30)

DATE_PATTERNS_BALANCE = [
    ("dün", YESTERDAY.strftime("%Y-%m-%d")),
    ("dün itibarıyla", YESTERDAY.strftime("%Y-%m-%d")),
    ("dünkü", YESTERDAY.strftime("%Y-%m-%d")),
    ("bugün", TODAY.strftime("%Y-%m-%d")),
    ("bu ay", f"{TODAY.strftime('%Y-%m')}-01..{TODAY.strftime('%Y-%m-%d')}"),
    ("geçen hafta", f"{LAST_WEEK_START.strftime('%Y-%m-%d')}..{TODAY.strftime('%Y-%m-%d')}"),
    ("son 30 gün", f"{LAST_MONTH_START.strftime('%Y-%m-%d')}..{TODAY.strftime('%Y-%m-%d')}"),
    ("2026-08-01 ile 2026-08-20 arası", "2026-08-01..2026-08-20"),
    ("bu ayın başından beri", f"{TODAY.strftime('%Y-%m')}-01..{TODAY.strftime('%Y-%m-%d')}"),
]

DATE_PATTERNS_ANALYTICS = [
    ("son 30 günün", (LAST_MONTH_START.strftime("%Y-%m-%d"), TODAY.strftime("%Y-%m-%d"))),
    ("son 7 gün", (LAST_WEEK_START.strftime("%Y-%m-%d"), TODAY.strftime("%Y-%m-%d"))),
    ("geçen ayın", ("2026-07-01", "2026-07-31")),
    ("bu yılın", ("2026-01-01", TODAY.strftime("%Y-%m-%d"))),
    ("2026 yılı", ("2026-01-01", "2026-12-31")),
    ("2025 yılı", ("2025-01-01", "2025-12-31")),
    ("2026 ilk çeyrek", ("2026-01-01", "2026-03-31")),
]

STATUS_PATTERNS = [
    ("aktif", ["AKTIF"]),
    ("sadece aktifler", ["AKTIF"]),
    ("aktif olan", ["AKTIF"]),
    ("iptal", ["IPTAL"]),
    ("iptal edilenler", ["IPTAL"]),
    ("iptaller", ["IPTAL"]),
    ("pasif", ["PASIF"]),
    ("beklemede olan", ["BEKLEMEDE"]),
    ("onay bekleyenler", ["BEKLEMEDE"]),
]

AMOUNT_PATTERNS = [
    ("50.000 TL üzeri", 50000, "TRY"),
    ("50k üstü", 50000, "TRY"),
    ("100.000 TL den büyük", 100000, "TRY"),
    ("10.000 USD üzeri", 10000, "USD"),
    ("20.000 EUR üstü", 20000, "EUR"),
    ("250 bin TL üzeri", 250000, "TRY"),
    ("1.000.000 TL üzeri", 1000000, "TRY"),
]

WAREHOUSES = [
    ("Ana Depo", "Ana Depo"),
    ("Merkez Depo", "Merkez Depo"),
    ("Gebze Şube", "Gebze Şube"),
    ("Tuzla Depo", "Tuzla Depo"),
    ("Hammadde Deposu", "Hammadde Deposu"),
]

BALANCE_REPORT_NAMES = [
    "stok bakiye raporu",
    "stok bakiye",
    "stock balance",
    "kalan stok",
    "envanter durumu",
    "depo bakiye",
    "mevcut stoklar",
    "stok mevcudu",
    "envanter raporu",
]

ANALYTICS_REPORT_NAMES = [
    "stok analitik raporu",
    "stok analitik",
    "stock analytics",
    "maliyet analizi",
    "stok analitiği",
    "analitik raporu",
    "stok hareket analizi",
]

VERBS = [
    "hazırla",
    "getir",
    "listele",
    "raporla",
    "dökümünü al",
    "göster",
    "çıkar",
    "aç",
    "bakabilir miyiz",
    "çek",
    "hesapla",
]

def generate_examples(count=600):
    examples = []

    # 1. Stock Balance Variations
    for _ in range(count // 2):
        r_name = random.choice(BALANCE_REPORT_NAMES)
        verb = random.choice(VERBS)
        d_text, d_val = random.choice(DATE_PATTERNS_BALANCE)
        
        args = {"kayitTarihi": d_val}
        query_parts = []
        
        # Include date?
        if random.random() > 0.15:
            query_parts.append(d_text)
        else:
            args["kayitTarihi"] = YESTERDAY.strftime("%Y-%m-%d") # default yesterday
            
        # Include status?
        if random.random() > 0.4:
            s_text, s_val = random.choice(STATUS_PATTERNS)
            query_parts.append(s_text)
            args["durum"] = s_val
            
        # Include amount?
        if random.random() > 0.5:
            a_text, a_val, a_curr = random.choice(AMOUNT_PATTERNS)
            query_parts.append(a_text)
            args["tutarMiktar"] = a_val
            args["tutarParaBirimi"] = a_curr
            
        # Include warehouse?
        if random.random() > 0.6:
            w_text, w_val = random.choice(WAREHOUSES)
            query_parts.append(w_text)
            args["depo"] = w_val
            
        query_parts.append(r_name)
        if random.random() > 0.2:
            query_parts.append(verb)
            
        random.shuffle(query_parts)
        query = " ".join(query_parts).strip()
        # Capitalize first letter
        query = query[0].upper() + query[1:]
        
        examples.append({
            "query": query,
            "tools": TOOLS,
            "answers": [
                {
                    "name": "filter_stock_balance",
                    "arguments": args
                }
            ]
        })

    # 2. Stock Analytics Variations
    for _ in range(count // 2):
        r_name = random.choice(ANALYTICS_REPORT_NAMES)
        verb = random.choice(VERBS)
        d_text, (from_d, to_d) = random.choice(DATE_PATTERNS_ANALYTICS)
        
        args = {"fromDate": from_d, "toDate": to_d}
        query_parts = [d_text, r_name]
        
        # Include Currency?
        if random.random() > 0.4:
            curr = random.choice(["TRY", "USD", "EUR"])
            query_parts.append(f"({curr})" if random.random() > 0.5 else f"{curr} bazında")
            args["currency"] = curr
            
        # Include Finance Book?
        if random.random() > 0.6:
            fb = random.choice(["Main Book", "Tax Book", "Budget Book"])
            query_parts.append(fb)
            args["financeBook"] = fb
            
        # Include Fiscal Year?
        if random.random() > 0.6:
            fy = random.choice(["2025-2026", "2024-2025", "2026-2027"])
            query_parts.append(f"Mali Yıl: {fy}" if random.random() > 0.5 else f"{fy} mali yılı")
            args["fiscalYear"] = fy
            
        if random.random() > 0.3:
            query_parts.append(verb)
            
        random.shuffle(query_parts)
        query = " ".join(query_parts).strip()
        query = query[0].upper() + query[1:]
        
        examples.append({
            "query": query,
            "tools": TOOLS,
            "answers": [
                {
                    "name": "filter_stock_analytics",
                    "arguments": args
                }
            ]
        })

    # 3. Add explicit quick prompts
    quick_prompts = [
        ("Dün itibarıyla hazırla", "filter_stock_balance", {"kayitTarihi": YESTERDAY.strftime("%Y-%m-%d")}),
        ("Geçen haftanın iptallerini göster", "filter_stock_balance", {"kayitTarihi": f"{LAST_WEEK_START.strftime('%Y-%m-%d')}..{TODAY.strftime('%Y-%m-%d')}", "durum": ["IPTAL"]}),
        ("50.000 TL üzeri stoklar", "filter_stock_balance", {"tutarMiktar": 50000, "tutarParaBirimi": "TRY", "kayitTarihi": f"{LAST_MONTH_START.strftime('%Y-%m-%d')}..{TODAY.strftime('%Y-%m-%d')}"}),
        ("Sadece AKTIF kayıtlar", "filter_stock_balance", {"durum": ["AKTIF"], "kayitTarihi": YESTERDAY.strftime("%Y-%m-%d")}),
        ("Son 30 günün analitiğini hazırla", "filter_stock_analytics", {"fromDate": LAST_MONTH_START.strftime("%Y-%m-%d"), "toDate": TODAY.strftime("%Y-%m-%d")}),
        ("Son 7 gün (TRY)", "filter_stock_analytics", {"fromDate": LAST_WEEK_START.strftime("%Y-%m-%d"), "toDate": TODAY.strftime("%Y-%m-%d"), "currency": "TRY"}),
        ("Mali Yıl: 2025-2026", "filter_stock_analytics", {"fiscalYear": "2025-2026", "fromDate": "2025-01-01", "toDate": "2026-12-31"}),
    ]
    
    for q, tool_name, args in quick_prompts:
        examples.append({
            "query": q,
            "tools": TOOLS,
            "answers": [{"name": tool_name, "arguments": args}]
        })

    random.shuffle(examples)
    return examples

if __name__ == "__main__":
    os.makedirs("data", exist_ok=True)
    out_file = "data/sims_poc_train.jsonl"
    data = generate_examples(700)
    with open(out_file, "w", encoding="utf-8") as f:
        for item in data:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
    print(f"Generated {len(data)} training examples -> {out_file}")
