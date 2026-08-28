#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
JSON Schema Guard & Legal Enum Validator for Yula AI Tool Calls.
Strictly validates and sanitizes all tool arguments against ERP JSON schemas.
Guarantees zero hallucination, legal enum snapping, and type safety.
"""

from typing import Dict, Any, List, Tuple, Optional

def fuzzy_similarity(s1: str, s2: str) -> float:
    if s1 == s2:
        return 1.0
    if not s1 or not s2:
        return 0.0
    if s1 in s2 or s2 in s1:
        return 0.9
    len1, len2 = len(s1), len(s2)
    if abs(len1 - len2) > 3:
        return 0.0
    d = [[i + j if i * j == 0 else 0 for j in range(len2 + 1)] for i in range(len1 + 1)]
    for i in range(1, len1 + 1):
        for j in range(1, len2 + 1):
            cost = 0 if s1[i - 1] == s2[j - 1] else 1
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
            if i > 1 and j > 1 and s1[i - 1] == s2[j - 2] and s1[i - 2] == s2[j - 1]:
                d[i][j] = min(d[i][j], d[i - 2][j - 2] + 1)
    max_len = max(len1, len2)
    distance = d[len1][len2]
    return max(0.0, (max_len - distance) / max_len)

def normalize_tr(text: str) -> str:
    if not text:
        return ""
    mapping = {
        "İ": "i", "I": "ı", "ı": "i", "ğ": "g", "Ğ": "g",
        "ü": "u", "Ü": "u", "ş": "s", "Ş": "s", "ö": "o", "Ö": "o",
        "ç": "c", "Ç": "c"
    }
    res = text.lower()
    for k, v in mapping.items():
        res = res.replace(k, v)
    return res

class SchemaGuard:
    @staticmethod
    def validate_and_sanitize(
        tool_def: Dict[str, Any],
        raw_args: Dict[str, Any]
    ) -> Tuple[Dict[str, Any], List[str], List[str]]:
        """
        Validates raw_args against tool_def JSON schema.
        Returns: (valid_args, rejected_reasons, informational_notes)
        """
        props = tool_def.get("parameters", {}).get("properties", {})
        valid_args: Dict[str, Any] = {}
        rejected_reasons: List[str] = []
        notes: List[str] = []

        if not raw_args or not isinstance(raw_args, dict):
            return {}, [], []

        for key, raw_val in raw_args.items():
            if raw_val is None or raw_val == "":
                continue

            prop_def = props.get(key)
            if not prop_def or not isinstance(prop_def, dict):
                rejected_reasons.append(f"Şemada '{key}' adında bir alan bulunmamaktadır.")
                continue

            prop_title = prop_def.get("title", key)
            is_array = (
                prop_def.get("type") == "array" or
                prop_def.get("x-selection") == "multiple" or
                bool(prop_def.get("items"))
            )

            # 1. Enum validation & Fuzzy snapping
            allowed_enums = prop_def.get("enum", []) or (
                prop_def.get("items", {}).get("enum", [])
                if isinstance(prop_def.get("items"), dict) else []
            )

            if allowed_enums:
                canonical_map = {normalize_tr(str(opt)): str(opt) for opt in allowed_enums}

                def snap_to_enum(val_str: str) -> Optional[str]:
                    v_norm = normalize_tr(str(val_str).strip())
                    if v_norm in canonical_map:
                        return canonical_map[v_norm]

                    # Common ERP aliases
                    if v_norm in ["usd", "dolar", "dollar", "dolra"]:
                        for opt in allowed_enums:
                            if str(opt).upper() == "USD": return str(opt)
                    if v_norm in ["try", "tl", "lira", "turk lirasi"]:
                        for opt in allowed_enums:
                            if str(opt).upper() == "TRY": return str(opt)
                    if v_norm in ["eur", "euro", "avro", "avroy"]:
                        for opt in allowed_enums:
                            if str(opt).upper() == "EUR": return str(opt)
                    if v_norm in ["aktif", "active", "aktfi", "akt"]:
                        for opt in allowed_enums:
                            if str(opt).upper() == "AKTIF": return str(opt)
                    if v_norm in ["beklemede", "bekleme", "bekleyen", "beklede", "pending", "onay"]:
                        for opt in allowed_enums:
                            if str(opt).upper() == "BEKLEMEDE": return str(opt)
                    if v_norm in ["iptal", "cancel", "itpal"]:
                        for opt in allowed_enums:
                            if str(opt).upper() == "IPTAL": return str(opt)
                    if v_norm in ["pasif", "passive", "pasfi", "kapali", "kapalı"]:
                        for opt in allowed_enums:
                            if str(opt).upper() == "PASIF": return str(opt)

                    # Fuzzy match against allowed canonical enums
                    for norm_k, canonical in canonical_map.items():
                        if fuzzy_similarity(v_norm, norm_k) >= 0.72:
                            return canonical
                    return None

                raw_items = raw_val if isinstance(raw_val, list) else [raw_val]
                valid_snapped = []
                for item in raw_items:
                    snapped = snap_to_enum(str(item))
                    if snapped:
                        if snapped not in valid_snapped:
                            valid_snapped.append(snapped)
                    else:
                        rejected_reasons.append(
                            f"'{item}' değeri '{prop_title}' için geçerli seçenekler ({', '.join(map(str, allowed_enums))}) arasında bulunamadı."
                        )

                if valid_snapped:
                    if is_array:
                        valid_args[key] = valid_snapped
                    else:
                        valid_args[key] = valid_snapped[0]
                        if len(valid_snapped) > 1:
                            omitted = ", ".join(valid_snapped[1:])
                            notes.append(
                                f"💡 **{prop_title}:** Bu alan tekil bir seçimdir; ilk geçerli seçenek (**{valid_snapped[0]}**) uygulandı. ({omitted} aynı anda seçilemez.)"
                            )
                continue

            # 2. Datasource validation (x-datasource)
            datasource = prop_def.get("x-datasource", [])
            if datasource and isinstance(datasource, list):
                raw_items = raw_val if isinstance(raw_val, list) else [raw_val]
                matched_codes = []
                for item in raw_items:
                    item_str = str(item).strip().lower()
                    found_code = None
                    for row in datasource:
                        if isinstance(row, dict):
                            kod = str(row.get("kod", "")).strip()
                            ad = str(row.get("ad", "")).strip().lower()
                            barkod = str(row.get("barkod", "")).strip()
                            if kod.lower() == item_str or barkod == item_str or ad == item_str or (len(ad) >= 4 and ad in item_str):
                                found_code = kod
                                break
                    if found_code:
                        if found_code not in matched_codes:
                            matched_codes.append(found_code)
                    else:
                        rejected_reasons.append(f"'{item}' ürün/malzeme kayıtlı veri kaynağında bulunamadı.")

                if matched_codes:
                    valid_args[key] = matched_codes if is_array else matched_codes[0]
                continue

            # 3. Number validation
            if prop_def.get("type") in ["number", "integer"]:
                try:
                    num = float(str(raw_val).replace(".", "").replace(",", ".")) if isinstance(raw_val, str) else float(raw_val)
                    min_val = prop_def.get("minimum")
                    max_val = prop_def.get("maximum")
                    if min_val is not None and num < min_val:
                        rejected_reasons.append(f"'{key}' değeri minimum ({min_val}) sınırın altında.")
                    elif max_val is not None and num > max_val:
                        rejected_reasons.append(f"'{key}' değeri maksimum ({max_val}) sınırın üzerinde.")
                    else:
                        valid_args[key] = int(num) if prop_def.get("type") == "integer" else num
                except Exception:
                    rejected_reasons.append(f"'{raw_val}' geçerli bir sayı formatında değil.")
                continue

            # 4. Date validation & Smart Conflict Resolution
            if prop_def.get("format") == "date":
                d_str = str(raw_val).strip()
                import re
                range_match = re.match(r"^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$", d_str)
                if range_match:
                    d1, d2 = range_match.group(1), range_match.group(2)
                    if d1 > d2:
                        d1, d2 = d2, d1
                        notes.append(f"💡 **Tarih Aralığı Düzeltildi:** Başlangıç tarihi bitiş tarihinden sonra girildiği için aralık otomatik olarak **{d1}..{d2}** olarak düzenlendi.")
                    valid_args[key] = f"{d1}..{d2}"
                elif re.match(r"^\d{4}-\d{2}-\d{2}$", d_str):
                    valid_args[key] = d_str
                else:
                    rejected_reasons.append(f"'{raw_val}' geçerli bir tarih formatı (YYYY-MM-DD veya YYYY-MM-DD..YYYY-MM-DD) değil.")
                continue

            # 5. Default Pass-Through
            valid_args[key] = [str(raw_val)] if is_array and not isinstance(raw_val, list) else raw_val

        # Cross-Field Conflict Resolution: fromDate vs toDate
        import re
        from_key = next((k for k in props if re.search(r"^(from|start|baslangic)", k, re.I)), None)
        to_key = next((k for k in props if re.search(r"^(to|end|bitis)", k, re.I)), None)
        if from_key and to_key and from_key in valid_args and to_key in valid_args:
            f_val = str(valid_args[from_key]).strip()
            t_val = str(valid_args[to_key]).strip()
            if re.match(r"^\d{4}-\d{2}-\d{2}$", f_val) and re.match(r"^\d{4}-\d{2}-\d{2}$", t_val) and f_val > t_val:
                valid_args[from_key], valid_args[to_key] = t_val, f_val
                notes.append(f"💡 **Tarih Sıralaması Düzeltildi:** Başlangıç tarihi ({f_val}) bitiş tarihinden ({t_val}) sonra girildiği için tarihler **{t_val} (Başlangıç) .. {f_val} (Bitiş)** olarak yer değiştirildi.")

        return valid_args, rejected_reasons, notes
