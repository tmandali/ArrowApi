#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Kalıcı Sistem Bilgileri (System Facts) deposu. Kullanıcı onayıyla frontend'in gönderdiği kalıcı bilgiler diskte
JSON olarak tutulur ve her task turunda system prompt'una enjekte edilir.

Frameless (stdlib-only) tasarım: yol her çağrıda YULA_DATA_DIR env'inden
okunur; testler geçici dizine yönlendirip doğrudan test eder (test_system_facts.py).
"""

import json
import os
import sys
from datetime import datetime

STORE_VERSION = 1
MAX_FACTS = 64
MAX_KEY_LEN = 80
MAX_VALUE_LEN = 400


def store_path():
    base = os.environ.get("YULA_DATA_DIR") or os.path.join(os.path.expanduser("~"), ".yula")
    return os.path.join(base, "system_facts.json")


def sanitize_facts(facts):
    """Anahtar/değerleri string'e çevirir, boşları atar, prompt-bütçesi üst sınırını uygular."""
    if not isinstance(facts, dict):
        return {}
    out = {}
    for key, value in facts.items():
        k = str(key).strip()[:MAX_KEY_LEN]
        v = str(value).strip()[:MAX_VALUE_LEN]
        if k and v and v.lower() != "null":
            out[k] = v
        if len(out) >= MAX_FACTS:
            break
    return out


def get_all():
    """Diskten okur; bozuk/eksik dosyada sessizce boş sözlük döner."""
    try:
        with open(store_path(), "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return {}
    facts = data.get("facts") if isinstance(data, dict) else None
    return dict(facts) if isinstance(facts, dict) else {}


def set_many(new_facts):
    """Verilen bilgileri mevcut depoyla birleştirip kalıcı yazar; güncel depoyu döner."""
    merged = get_all()
    merged.update(sanitize_facts(new_facts))
    _persist(merged)
    return merged


def clear(keys=None):
    """Belirtilen anahtarları (None → tümünü) siler; silinen adet sayısını döner."""
    current = get_all()
    if keys is None:
        removed = len(current)
        remaining = {}
    else:
        targets = {str(k).strip() for k in keys if str(k).strip()}
        removed = sum(1 for k in current if k in targets)
        remaining = {k: v for k, v in current.items() if k not in targets}
    _persist(remaining)
    return removed


def prompt_directive(facts=None):
    """System prompt'a eklenecek direktif bloğu; depo boşsa boş string döner."""
    if facts is None:
        facts = get_all()
    if not facts:
        return ""
    lines = "\n".join(f"- {k}: {v}" for k, v in sorted(facts.items()))
    return (
        "KALICI SİSTEM BİLGİLERİ (SYSTEM FACTS — kullanıcı onayıyla kaydedildi):\n"
        f"{lines}\n"
        "Bu bilgileri gerçek ve güncel kabul et; yanıtlarında tutarlı kullan.\n"
    )


def _persist(facts):
    path = store_path()
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        payload = {
            "version": STORE_VERSION,
            "updatedAt": datetime.now().isoformat(timespec="seconds"),
            "facts": facts,
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        sys.stderr.write(f"[System Facts] Kalıcı yazma hatası ({path}): {e}\n")
        sys.stderr.flush()
        return False
