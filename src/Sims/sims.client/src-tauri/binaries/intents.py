# -*- coding: utf-8 -*-
"""
Yula niyet sözüğü yükleyicisi (K1 tek kaynak).
intents.tr.json hem geliştirme dizininde hem PyInstaller bundle'ında (_MEIPASS) aranır.
Anahtar kelimeler aksan-sade (folded) tutulur; karşılaştıran katman fold_tr() ile
promptu aynı formdan geçirir.
"""

import json
import os
import sys

_FOLD_TABLE = str.maketrans({
    "ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u",
    "Ç": "c", "Ğ": "g", "İ": "i", "I": "i", "Ö": "o", "Ş": "s", "Ü": "u",
})


def fold_tr(text: str) -> str:
    """Türkçe diyakritikleri sadeleştirir (TS tarafındaki foldTr karşılığı)."""
    return (text or "").translate(_FOLD_TABLE)


def _candidate_paths():
    me = os.path.dirname(os.path.abspath(__file__))
    yield os.path.join(me, "intents.tr.json")
    meipass = getattr(sys, "_MEIPASS", "")
    if meipass:
        yield os.path.join(meipass, "intents.tr.json")


def _load_intents() -> dict:
    for path in _candidate_paths():
        try:
            if path and os.path.exists(path):
                with open(path, encoding="utf-8") as handle:
                    return json.load(handle)
        except Exception as err:
            sys.stderr.write(f"[Intents] yuklenemedi ({path}): {err}\n")
    sys.stderr.write("[Intents] intents.tr.json bulunamadi — niyet sozluğu bos.\n")
    return {}


INTENTS: dict = _load_intents()


def has_any(folded_text: str, key: str) -> bool:
    """Folded prompt içinde verilen niyet anahtarlarından biri geçiyor mu?"""
    return any(keyword in folded_text for keyword in INTENTS.get(key, []))
