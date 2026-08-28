# -*- coding: utf-8 -*-
"""
Arrow/DuckDB fiziksel şema tiplerinden türetilen jenerik filtre-değeri doğrulaması.

Kelime listesi YOKTUR: kontrol tamamen kolonun physical tipinden (date/number/text)
gelir. Model'in filter_active_grid çıkarımı kolon tipiyle uyumsuzsa çağrı
analyze_grid_data'ya (KPI sayım) delege edilir.
"""

import re
from typing import Any, Dict, Tuple

_DATE_LIKE_RE = re.compile(
    r"^\s*(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[./]\d{1,2}([./]\d{2,4})?)"
    r"\s*(\.\.\s*(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[./]\d{1,2}([./]\d{2,4})?))?\s*$"
)
_DATE_TOKENS = {"today", "bugün", "bugun", "dün", "dun", "ay", "yıl", "yil"}
_NUMERIC_LIKE_RE = re.compile(r"^[<>!=|&.,\-+\d\s*]+$")


def value_matches_physical_type(value: str, physical: str) -> bool:
    """Değer, kolonun fiziksel tipiyle uyumlu mu? (text için her zaman True)"""
    s = str(value).strip()
    if not s:
        return False
    p = (physical or "").strip().lower()
    if p == "date":
        if _DATE_LIKE_RE.match(s):
            return True
        return s.lower() in _DATE_TOKENS
    if p == "number":
        return bool(_NUMERIC_LIKE_RE.fullmatch(s)) and any(c.isdigit() for c in s)
    return True


def self_correct_grid_filter(
    tool_name: str,
    args: Dict[str, Any],
    column_types: Dict[str, Any],
) -> Tuple[str, Dict[str, Any]]:
    """
    filter_active_grid çıkarımını kolon tiplerine göre doğrular; uyumsuzluk
    varsa (örn. DATE kolona 'kaç kayıt var') analyze_grid_data KPI'a çevirir.
    Uyumlu veya kararsız durumda girdiyi olduğu gibi döndürür.
    """
    if tool_name != "filter_active_grid" or not isinstance(args, dict):
        return tool_name, args
    if not isinstance(column_types, dict) or not column_types:
        return tool_name, args

    lowered = {str(k).lower(): str(v).lower() for k, v in column_types.items()}
    query = str(args.get("query") or "").strip()
    col = str(args.get("column") or "").strip().lower()
    kind = lowered.get(col, "")

    if not query or kind not in ("date", "number"):
        return tool_name, args

    if not value_matches_physical_type(query, kind):
        return "analyze_grid_data", {"chartType": "kpi"}
    return tool_name, args
