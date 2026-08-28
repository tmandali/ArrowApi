#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tool-call argümanları için saf JSON onarım katmanı (stdlib-only).

Sağlayıcı akışından gelen argüman metni bozuksa (kesik üretim, markdown fence,
prose sargısı, tek tırnak, artık virgül, eksik kapanış parantezi) kademeli
olarak kurtarır. Hiçbir aşama dict üretmezse None döner; çağıran taraf bunu
stderr'e düşürüp {} ile devam eder. Frameless olduğu için doğrudan test edilir
(test_json_arg_repair.py).
"""

import json
import re

_FENCE_START_RE = re.compile(r"^```[a-zA-Z0-9_-]*\s*")
_FENCE_END_RE = re.compile(r"\s*```\s*$")
_TRAILING_COMMA_RE = re.compile(r",\s*(?=[}\]])")


def repair_tool_arguments(raw):
    """Ham argüman metnini dict'e çözmeye çalışır; başarısızsa None döner."""
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    for candidate in _candidates(text):
        try:
            parsed = json.loads(candidate)
        except Exception:
            continue
        return parsed if isinstance(parsed, dict) else None
    return None


def _candidates(text):
    """Deneme sırası: ham → fence-soyulmuş → dış {..} bloğu → kademeli onarım
    (artık virgül → tırnak → eksik kapanış parantezi)."""
    base = []
    fenced = _FENCE_END_RE.sub("", _FENCE_START_RE.sub("", text)).strip()
    for variant in (text, fenced):
        if variant and variant not in base:
            base.append(variant)

    out = []
    for variant in base:
        out.append(variant)
        start, end = variant.find("{"), variant.rfind("}")
        # Kapanış parantezi hiç yoksa onarım metnin tamamı üzerinde yürür.
        anchor = variant[start : end + 1] if start >= 0 and end > start else variant
        cleaned = _TRAILING_COMMA_RE.sub("", anchor)
        quoted = cleaned.replace("'", '"')
        for candidate in (anchor, cleaned, quoted, quoted + "}"):
            if candidate and candidate not in out:
                out.append(candidate)
    return out
