#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Needle Engine — On-Device Micro SLM & Parameter Extraction / Validation Engine
Inspired by Cactus Compute Needle (45M / 14MB tool-calling model).
Extracts structured JSON arguments from natural language and validates with strict schema rules.
"""

import json
import re
import sys
import time
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple

from schema_guard import SchemaGuard, fuzzy_similarity
from schema_type_guard import self_correct_grid_filter
from intents import INTENTS, has_any, fold_tr as _fold

try:
    import needle as cactus_needle
    HAS_CACTUS_NEEDLE = True
except Exception:
    cactus_needle = None
    HAS_CACTUS_NEEDLE = False

TURKISH_MONTHS = {
    "ocak": ("01", 31), "subat": ("02", 29), "şubat": ("02", 29),
    "mart": ("03", 31), "nisan": ("04", 30), "mayis": ("05", 31), "mayıs": ("05", 31),
    "haziran": ("06", 30), "temmuz": ("07", 31), "agustos": ("08", 31), "ağustos": ("08", 31),
    "eylul": ("09", 30), "eylül": ("09", 30), "ekim": ("10", 31), "kasim": ("11", 30),
    "kasım": ("11", 30), "aralik": ("12", 31), "aralık": ("12", 31)
}

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

def _norm_date(value: str) -> str:
    """Serbest tarih metnini ISO'ya (YYYY-MM-DD) çevirir; başarısızsa boş string."""
    v = (value or "").strip().strip('"\'')
    if not v:
        return ""
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d.%m.%Y", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(v, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return ""


# ---------------------------------------------------------------------------
# Bileşik nitelik grameri (frontend bc-filter-synthesizer ile aynı sözleşme):
#   "itemname timur"  → nitelik=name  → aracın İSİM/açıklama alanına "timur"
#   "item kodu X"     → nitelik=code  → aracın KOD alanına
# Kriter formu araçlarında (grid kapalıyken) Needle tek yetkili olduğu için
# bu deterministik katman SLM/kural çıktısını burada da kesinleştirir.
# ---------------------------------------------------------------------------
_QUAL_COMPOUND_RE = re.compile(
    r"^(sku|item|ürün|urun|malzeme|product)\s*(name|ad[ıi]?|code|kod[u]?|no|numara(?:s[ıi])?|id)\s+(.+)$"
)
_QUAL_FIRST_RE = re.compile(
    r"^(name|ad[ıi]?|description|açıklama|aciklama|tan[ıi]m|kod[u]?|code|numara(?:s[ıi])?)\s+(.+)$"
)
_QUAL_NAME_ONLY_RE = re.compile(r"^(name|ad[ıi]?|description|açıklama|aciklama|tan[ıi]m)$")

_DESC_KEY_RE = re.compile(
    r"\b(name|adi|adı|description|aciklama|açıklama|tanim|tanım|itemname|itemad)\b"
)
_CODE_KEY_RE = re.compile(r"\b(code|kod|kodu|sku|no|numara|itemcode|itemkod)\b")


def apply_compound_qualifier_args(prompt_lower: str, tool: Dict[str, Any], args: Dict[str, Any]) -> Dict[str, Any]:
    """Prompt'taki bileşik niteliği tespit edip aracın şemasında eşleşen ALANA değer yazar.

    Yalnızca henüz set EDİLMEMİŞ bir alan bulunursa ve şemada güvenilir eşleşme varsa müdahale eder;
    aksi halde args olduğu gibi döner. Grid araçları (query/column sözleşmesi) çağrı tarafında atlanır.
    """
    if not isinstance(tool, dict) or not isinstance(args, dict):
        return args
    p = (prompt_lower or "").strip()
    value: Optional[str] = None
    want_desc: Optional[bool] = None

    m = _QUAL_COMPOUND_RE.match(p)
    if m:
        want_desc = bool(_QUAL_NAME_ONLY_RE.match(m.group(2)))
        value = m.group(3).strip()
    else:
        q = _QUAL_FIRST_RE.match(p)
        if q:
            want_desc = bool(_QUAL_NAME_ONLY_RE.match(q.group(1)))
            value = q.group(2).strip()

    if not value or want_desc is None:
        return args

    props = ((tool.get("parameters") or {}).get("properties")) or {}
    key_re = _DESC_KEY_RE if want_desc else _CODE_KEY_RE

    best_key: Optional[str] = None
    best_score = 0
    for k in props:
        pdef = props.get(k) if isinstance(props.get(k), dict) else {}
        text = _fold(str(k).lower()) + " " + _fold(str(pdef.get("title", "")).lower()) + " " + _fold(str(pdef.get("description", "")).lower())
        hits = len(key_re.findall(text))
        if hits == 0:
            continue
        # Alan adındaki doğrudan eşleşme daha güçlü sinyaldir
        score = hits + (5 if key_re.search(_fold(str(k).lower())) else 0)
        if score > best_score:
            best_score = score
            best_key = k

    if best_key and best_key not in args:
        out = dict(args)
        out[best_key] = value
        return out
    return args


class NeedleEngine:
    def __init__(self, model_name: str = "needle-2:45m"):
        self.model_name = model_name
        self.has_neural = HAS_CACTUS_NEEDLE
        self.neural_agent = None
        # Gerçek Cactus Needle SLM önbelleği: araç kümesi parmak izine göre ajan yeniden kullanılır
        self._slm_fail_until = 0.0

    def _slm_extract(self, prompt: str, tools: List[Dict[str, Any]],
                     system_text: Optional[str] = None) -> Optional[Tuple[str, Dict[str, Any]]]:
        """
        Resmi Cactus Needle SLM'ini dener (on-device ~50ms).
        Başarılıysa (tool_name, arguments) döner; değilse None (kural motoruna düşülür).
        NOT: Native motor complete() çağrıları arasında konuşma durumu TUTAR; bu yüzden
        her çıkarımda taze Needle örneği kullanılır (deterministik tek-tur davranış).
        """
        if not self.has_neural or not tools:
            return None
        if time.time() < self._slm_fail_until:
            return None
        try:
            import needle as cactus_needle

            agent = cactus_needle.Needle(tools=[t for t in tools if isinstance(t, dict)],
                                         system=system_text)
            response = agent.complete(prompt)
            if response.get("type") != "call":
                return None
            calls = response.get("function_calls") or []
            if not calls:
                return None
            name = calls[0].get("name")
            args = calls[0].get("arguments")
            valid_names = {t.get("name") for t in tools}
            if name not in valid_names or not isinstance(args, dict):
                return None
            # Argümansız aksiyon araçları (örn. temizle) için boş args geçerlidir
            target = next((t for t in tools if t.get("name") == name), {})
            schema_props = ((target.get("parameters") or {}).get("properties")) or {}
            if args or not schema_props:
                return name, args
            return None
        except Exception as err:
            # SLM hatası üretimi bloklamasın: 60 sn kural motoruna düş, sonra tekrar dene
            sys.stderr.write(f"[Needle SLM] atlandı: {err}\n")
            sys.stderr.flush()
            self._slm_fail_until = time.time() + 60
            return None

    def parse_relative_dates(self, text: str, ref_date: Optional[datetime] = None) -> Tuple[str, str, bool]:
        """
        Doğal dil Türkçe/İngilizce tarih ve göreceli aralık çözümleyici.
        Döner: (start_date, end_date, is_range)
        """
        today = ref_date or datetime.now()
        today_iso = today.strftime("%Y-%m-%d")
        yesterday_str = (today - timedelta(days=1)).strftime("%Y-%m-%d")
        last_week_str = (today - timedelta(days=7)).strftime("%Y-%m-%d")
        last_30_str = (today - timedelta(days=30)).strftime("%Y-%m-%d")
        month_start_str = today.replace(day=1).strftime("%Y-%m-%d")
        year_start_str = today.replace(month=1, day=1).strftime("%Y-%m-%d")

        text_lower = text.lower()

        # Date keyword and pattern check
        date_keywords = [
            "tarih", "gün", "gun", "ay", "yıl", "yil", "sene", "dün", "dun", "bugün", "bugun",
            "hafta", "mali", "ocak", "şubat", "subat", "mart", "nisan", "mayıs", "mayis",
            "haziran", "temmuz", "ağustos", "agustos", "eylül", "eylul", "ekim", "kasım", "kasim", "aralık", "aralik",
            "between", "range", "date", "year", "month", "today", "yesterday", "week"
        ]
        has_date_mention = any(k in text_lower for k in date_keywords) or bool(re.search(r"\b20\d\d\b", text_lower))
        if not has_date_mention:
            return None, None, False, False

        # Esnek "yıl + ay adı" çözümü: "2025 yılı ocak ayına ait", "ocak 2025",
        # "geçen sene ocak"... Ay adı ile yıl metnin farklı yerinde olsa bile
        # konumsal yakınlıkla eşleştirilir.
        month_hits = []
        for m_name in TURKISH_MONTHS:
            for m in re.finditer(r"\b" + m_name + r"(?:'?a?[a-z]{0,4})?\b", text_lower):
                month_hits.append((m.start(), m_name))
        explicit_years = re.findall(r"\b(20\d\d)\b", text_lower)
        implicit_prev_year = any(
            _fold(text_lower).count(k) > 0
            for k in ["gecen sene", "gecen yil"]
        )
        if month_hits:
            month_pos, m_name = month_hits[0]
            year_val: Optional[int] = None
            if explicit_years:
                nearest = min(explicit_years, key=lambda y: abs(text_lower.find(y) - month_pos))
                year_val = int(nearest)
            elif implicit_prev_year:
                year_val = today.year - 1
            if year_val is None:
                year_val = today.year  # yıl sinyali yoksa mevcut yıl
            mm_num, mm_days = TURKISH_MONTHS[m_name]
            start = f"{year_val}-{mm_num}-01"
            end = f"{year_val}-{mm_num}-{mm_days}"
            return start, end, True, True

        # ISO format match (e.g. 2026-08-01..2026-08-15 veya 2026-08-01) — / ayırıcısı da destekli
        iso_range = re.search(r"(\d{4}[-/]\d{2}[-/]\d{2})\s*(?:\.\.|\s+ile\s+|-|\s+to\s+)\s*(\d{4}[-/]\d{2}[-/]\d{2})", text_lower)
        if iso_range:
            sd = iso_range.group(1).replace("/", "-")
            ed = iso_range.group(2).replace("/", "-")
            return sd, ed, True, True

        iso_single = re.search(r"\b(\d{4}[-/]\d{2}[-/]\d{2})\b", text_lower)
        if iso_single:
            return iso_single.group(1).replace("/", "-"), iso_single.group(1).replace("/", "-"), False, True

        # Gün.Ay.Yıl / Gün/Ay/Yıl aralık ve tekil (örn: 3.8.2026 ile 10.8.2026)
        dmy_range = re.search(
            r"\b(\d{1,2})[./](\d{1,2})[./](20\d\d)\s*(?:\.\.|\s+ile\s+|-|\s+to\s+)\s*(\d{1,2})[./](\d{1,2})[./](20\d\d)",
            text_lower,
        )
        if dmy_range:
            d1, m1, y1, d2, m2, y2 = dmy_range.groups()
            try:
                s = datetime(int(y1), int(m1), int(d1))
                e = datetime(int(y2), int(m2), int(d2))
                return s.strftime("%Y-%m-%d"), e.strftime("%Y-%m-%d"), True, True
            except ValueError:
                pass

        dmy_single = re.search(r"\b(\d{1,2})[./](\d{1,2})[./](20\d\d)\b", text_lower)
        if dmy_single and ("tarih" in text_lower or len(text_lower.split()) <= 6):
            d_, m_, y_ = dmy_single.groups()
            try:
                dt_ = datetime(int(y_), int(m_), int(d_))
                iso_ = dt_.strftime("%Y-%m-%d")
                return iso_, iso_, False, True
            except ValueError:
                pass

        # Yıl + Ay (örn: 2026 ağustos veya ağustos 2026)
        ym_match = re.search(r"\b(20\d\d)\s+([a-zçğıöşü]+)", text_lower) or re.search(r"\b([a-zçğıöşü]+)\s+(20\d\d)", text_lower)
        if ym_match:
            p1, p2 = ym_match.group(1).lower(), ym_match.group(2).lower()
            yr = p1 if p1.isdigit() else p2
            m_name = p2 if p1.isdigit() else p1
            if m_name in TURKISH_MONTHS:
                m_num, m_days = TURKISH_MONTHS[m_name]
                return f"{yr}-{m_num}-01", f"{yr}-{m_num}-{m_days:02d}", True, True

        # Ay adı
        for m_name, (m_num, m_days) in TURKISH_MONTHS.items():
            if m_name in text_lower and any(k in text_lower for k in ["ay", "kayıt", "süz", "göster", "listele", "rapor"]):
                return f"{today.year}-{m_num}-01", f"{today.year}-{m_num}-{m_days:02d}", True, True

        # Yıl aralığı / Mali Yıl (örn: "2025-2026", "2025/2026", "2025..2026", "mali yıl: 2025-2026")
        yr_range = re.search(r"\b(20\d\d)\s*[-/..]\s*(20\d\d)\b", text_lower)
        if yr_range:
            y1, y2 = yr_range.group(1), yr_range.group(2)
            return f"{y1}-01-01", f"{y2}-12-31", True, True

        # Yıl sadece (örn: 2025 yılı veya tek başına 2025)
        yr_only = re.search(r"\b(20\d\d)\s*(?:yılı|senesi|yılına|senesine|mali yılı)?\b", text_lower)
        if yr_only and ("yıl" in text_lower or "sene" in text_lower or "mali" in text_lower or len(text_lower.strip().split()) <= 3):
            yr = yr_only.group(1)
            return f"{yr}-01-01", f"{yr}-12-31", True, True

        # Göreceli aralıklar
        if any(k in text_lower for k in ["30 gün", "30 gun", "last 30", "1 ay", "bir ay", "aylık", "aylik", "son bir ay"]):
            return last_30_str, today_iso, True, True
        if any(k in text_lower for k in ["7 gün", "7 gun", "hafta", "last week", "son 7"]):
            return last_week_str, today_iso, True, True
        if any(k in text_lower for k in ["bu ay", "this month"]):
            return month_start_str, today_iso, True, True
        if any(k in text_lower for k in ["bu yıl", "bu yil", "this year"]):
            return year_start_str, today_iso, True, True
        if any(k in text_lower for k in ["dün", "dun", "yesterday"]):
            return yesterday_str, yesterday_str, False, True
        if any(k in text_lower for k in ["bugün", "bugun", "today"]):
            return today_iso, today_iso, False, True

        # Son çare: on-device structured extraction (needle.extract) — regex'in kaçtığı
        # sıra dışı tarih kalıpları (örn. "2026/08/03 - 2026/08/10", "3 Ağustos'tan 10 Ağustos'a")
        if HAS_CACTUS_NEEDLE:
            try:
                import pydantic

                class _DateRange(pydantic.BaseModel):
                    start_date: str
                    end_date: str

                res = cactus_needle.extract(_fold(text), _DateRange)
                if res is not None:
                    sd = _norm_date(getattr(res, "start_date", ""))
                    ed = _norm_date(getattr(res, "end_date", ""))
                    if sd and ed:
                        return sd, ed, (sd != ed), True
            except Exception:
                pass

        return None, None, False, False

    def synthesize_bc_filter(self, prompt: str) -> Dict[str, Any]:
        """
        Doğal dildeki filtre isteklerini Microsoft Dynamics 365 / Business Central
        standart filtre formatına (100..500, >100, !Ankara, SKU*, <>0, '') dönüştürür.
        """
        p_lower = prompt.lower()
        res = {"hasBcFilter": False, "filterExpression": "", "targetColumnHint": ""}

        # 1. Aralık (Range: 100 ile 500 arası)
        range_m = re.search(r"(\d+(?:[.,]\d+)?)\s*(?:ile|to|-|\.\.)\s*(\d+(?:[.,]\d+)?)\s*(?:arası|aralığı|between)", p_lower)
        if range_m:
            n1 = range_m.group(1).replace(",", ".")
            n2 = range_m.group(2).replace(",", ".")
            res["hasBcFilter"] = True
            res["filterExpression"] = f"{n1}..{n2}"
            return res

        # 2. Alt Sınır (50000 üzeri / büyük)
        gte_m = re.search(r"(\d+(?:[.,]\d+)?)\s*(?:üzeri|uzeri|fazla|büyük|buyuk|ve yukarısı|ve fazlası|>|>=)", p_lower)
        if gte_m:
            n = gte_m.group(1).replace(",", ".")
            res["hasBcFilter"] = True
            res["filterExpression"] = f"{n}.."
            return res

        # 3. Üst Sınır (1000 altı / küçük)
        lte_m = re.search(r"(\d+(?:[.,]\d+)?)\s*(?:altı|alti|düşük|dusuk|küçük|kucuk|<|<=)", p_lower)
        if lte_m:
            n = lte_m.group(1).replace(",", ".")
            res["hasBcFilter"] = True
            res["filterExpression"] = f"..{n}"
            return res

        # 4. Hariç Tutma (Ankara hariç)
        not_m = re.search(r"([a-zA-Z0-9çğıöşüÇĞİÖŞÜ_-]+)\s*(?:hariç|haric|dışında|disinda|olmayan)", p_lower)
        if not_m:
            val = not_m.group(1).strip()
            res["hasBcFilter"] = True
            res["filterExpression"] = f"!{val}"
            return res

        # 5. Veya / Mantıksal VEYA (Ankara veya İzmir)
        or_m = re.search(r"([a-zA-Z0-9çğıöşüÇĞİÖŞÜ_-]+)\s+(?:veya|ya da|or)\s+([a-zA-Z0-9çğıöşüÇĞİÖŞÜ_-]+)", p_lower)
        if or_m:
            res["hasBcFilter"] = True
            res["filterExpression"] = f"{or_m.group(1)}|{or_m.group(2)}"
            return res

        # 6. Sıfır olmayan / Stokta olanlar
        if any(w in p_lower for w in ["stokta olan", "mevcut olan", "sıfır olmayan", "sifir olmayan", "bakiyesi olan"]):
            res["hasBcFilter"] = True
            res["filterExpression"] = "<>0"
            res["targetColumnHint"] = "stock"
            return res

        # 7. Stokta bitenler / Sıfır olanlar
        if any(w in p_lower for w in ["stokta biten", "sıfır olan", "sifir olan", "tükenen", "tukenen", "batan"]):
            res["hasBcFilter"] = True
            res["filterExpression"] = "=0"
            res["targetColumnHint"] = "stock"
            return res

        return res

    def extract_and_validate(
        self,
        prompt: str,
        tool: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None
    ) -> Tuple[Dict[str, Any], List[str]]:
        """
        Seçilen aracın JSON şemasına göre prompt içerisinden parametreleri ayıklar (slot-filling)
        ve kural tabanlı katı doğrulama (deterministic validation) uygular.
        """
        start_date, end_date, is_range, has_explicit_date = self.parse_relative_dates(prompt)
        bc_filter = self.synthesize_bc_filter(prompt)
        prompt_lower = prompt.lower()

        props = tool.get("parameters", {}).get("properties", {})
        extracted_args: Dict[str, Any] = {}
        unsupported_criteria: List[str] = []
        single_select_notes: List[str] = []

        # 1. Date Param Extraction (Only when user explicitly asked or report preparation is targeted)
        is_explicit_run_action = any(w in prompt_lower for w in ["hazırla", "hazirla", "çalıştır", "calistir", "raporu aç", "rapor aç", "oluştur", "olustur", "getir", "göster", "goster"])
        from_key = next((k for k in props if any(p in k.lower() for p in ["from", "start", "baslangic"])), None)
        to_key = next((k for k in props if any(p in k.lower() for p in ["to", "end", "bitis"])), None)
        single_date_key = next((k for k in props if any(p in k.lower() for p in ["kayit", "date", "tarih"])), None)

        if has_explicit_date and start_date and end_date:
            if from_key and to_key:
                extracted_args[from_key] = start_date
                extracted_args[to_key] = end_date
            elif single_date_key:
                extracted_args[single_date_key] = f"{start_date}..{end_date}" if is_range else start_date
        elif is_explicit_run_action:
            # Sadece kullanıcı açıkça "raporu hazırla" / "çalıştır" dediğinde varsayılan tarih doldurulur
            today = datetime.now()
            today_iso = today.strftime("%Y-%m-%d")
            last_30_str = (today - timedelta(days=30)).strftime("%Y-%m-%d")
            yesterday_str = (today - timedelta(days=1)).strftime("%Y-%m-%d")
            if from_key and to_key:
                extracted_args[from_key] = last_30_str
                extracted_args[to_key] = today_iso
            elif single_date_key:
                extracted_args[single_date_key] = yesterday_str

        # 2. BC Filter / Query extraction
        if bc_filter["hasBcFilter"]:
            if "query" in props:
                extracted_args["query"] = bc_filter["filterExpression"]
            if bc_filter.get("targetColumnHint") and "column" in props and "column" not in extracted_args:
                extracted_args["column"] = bc_filter["targetColumnHint"]

        # 3. SKU / Product Code / Item extraction
        stop_words = {
            "seç", "sec", "seçiniz", "seciniz", "se", "yap", "yapınız", "ayarla", "hazırla", "hazirla",
            "göster", "goster", "getir", "listele", "filtrele", "süz", "suz", "olan", "olanlar",
            "olanları", "olanlari", "için", "icin", "ile", "ve", "veya", "ya", "da", "bu", "şu",
            "su", "tüm", "tum", "hepsi", "rapor", "raporu", "kayıt", "kayit", "kayıtlar", "kayitlar",
            "evrak", "durum", "aktif", "beklemede", "bekleme", "iptal", "pasif", "tl", "try", "usd",
            "eur", "dolar", "euro", "kadar", "üzeri", "uzeri", "altı", "alti", "gün", "gun", "ay",
            "yıl", "yil", "dün", "dun", "bugün", "bugun", "son"
        }

        sku_val = None
        # 3.1 Explicit SKU / code pattern (e.g. SKU-101, ITM-002, ABC-123)
        explicit_code_match = re.search(r"\b([a-zA-Z]{1,6}-\d{1,8})\b", prompt)
        if explicit_code_match:
            sku_val = explicit_code_match.group(1).upper()
        else:
            # 3.2 Explicit prefix (e.g. sku: 123, ürün kodu: ABC, malzeme: XYZ)
            prefix_match = re.search(r"(?:sku|ürün kodu|urun kodu|malzeme kodu|barkod)[:\s-]+([a-zA-Z0-9_-]+)", prompt_lower)
            if prefix_match:
                cand = prefix_match.group(1).strip()
                if cand.lower() not in stop_words and len(cand) >= 2:
                    sku_val = cand.upper()

        if sku_val:
            if "sku" in props:
                extracted_args["sku"] = sku_val if sku_val.startswith("SKU-") else f"SKU-{sku_val}"
            if "query" in props and "query" not in extracted_args:
                extracted_args["query"] = sku_val
            if "product_code" in props:
                extracted_args["product_code"] = sku_val
            if "keyword" in props:
                extracted_args["keyword"] = sku_val
            for prop_name, prop_def in props.items():
                p_lower = prop_name.lower()
                p_desc = str(prop_def.get("description", "")).lower()
                p_title = str(prop_def.get("title", "")).lower()
                if p_lower in ["urun", "ürün", "item", "product", "malzeme"] or "ürün" in p_title or "sku" in p_title or "ürün" in p_desc or "sku" in p_desc:
                    extracted_args[prop_name] = [sku_val] if prop_def.get("type") == "array" else sku_val

        # 3.3 Datasource item matching for properties with x-datasource (e.g. urun)
        for prop_name, prop_def in props.items():
            datasource = prop_def.get("x-datasource", [])
            if datasource and isinstance(datasource, list) and prop_name not in extracted_args:
                matched_items = []
                for item in datasource:
                    if isinstance(item, dict):
                        kod = str(item.get("kod", "")).strip()
                        ad = str(item.get("ad", "")).strip().lower()
                        barkod = str(item.get("barkod", "")).strip()
                        if (kod and len(kod) >= 1 and f"ürün {kod}" in prompt_lower) or (ad and len(ad) >= 4 and ad in prompt_lower) or (barkod and barkod in prompt_lower):
                            matched_items.append(kod)
                if matched_items:
                    extracted_args[prop_name] = matched_items if prop_def.get("type") == "array" else matched_items[0]

        # 4. Enums & Status / Currency Detection
        # 4. Enums & Status / Currency Detection (with Word-level Fuzzy matching)
        p_words = [w for w in re.split(r"\s+", prompt_lower) if w]

        def check_fuzzy_word(targets: List[str]) -> Tuple[bool, int]:
            for w in p_words:
                for t in targets:
                    if w == t or w in t or t in w or (len(w) >= 4 and fuzzy_similarity(w, t) >= 0.72):
                        return True, prompt_lower.find(w)
            return False, -1

        for prop_name, prop_def in props.items():
            if prop_name in [from_key, to_key, single_date_key]:
                continue
            enums = prop_def.get("enum", []) or (prop_def.get("items", {}).get("enum", []) if isinstance(prop_def.get("items"), dict) else [])
            if enums:
                matched_list = []
                is_array = prop_def.get("type") == "array" or bool(prop_def.get("items"))
                for opt in enums:
                    opt_str = str(opt).lower()
                    matched = False
                    match_pos = -1

                    if opt_str == "iptal":
                        matched, match_pos = check_fuzzy_word(["iptal", "cancel", "itpal", "ipt"])
                    elif opt_str == "aktif":
                        matched, match_pos = check_fuzzy_word(["aktif", "active", "aktfi", "akt"])
                    elif opt_str == "beklemede":
                        matched, match_pos = check_fuzzy_word(["bekleme", "beklemede", "bekleyen", "beklede", "pending", "onay"])
                    elif opt_str == "pasif":
                        matched, match_pos = check_fuzzy_word(["pasif", "passive", "pasfi", "kapali", "kapalı"])
                    elif opt_str == "try":
                        matched, match_pos = check_fuzzy_word(["try", "tl", "lira", "turk lirasi"])
                    elif opt_str == "usd":
                        matched, match_pos = check_fuzzy_word(["usd", "dolar", "dollar", "dolra"])
                    elif opt_str == "eur":
                        matched, match_pos = check_fuzzy_word(["eur", "euro", "avro", "avroy"])
                    else:
                        matched, match_pos = check_fuzzy_word([opt_str])

                    if matched and match_pos >= 0:
                        if not any(m[0] == opt for m in matched_list):
                            matched_list.append((opt, match_pos))

                matched_list.sort(key=lambda x: x[1])
                if matched_list:
                    if is_array:
                        extracted_args[prop_name] = [m[0] for m in matched_list]
                    else:
                        extracted_args[prop_name] = matched_list[0][0]
                        if len(matched_list) > 1:
                            field_title = prop_def.get("title", prop_name)
                            selected_opt = matched_list[0][0]
                            other_opts = ", ".join([m[0] for m in matched_list[1:]])
                            single_select_notes.append(f"💡 **{field_title}:** Bu alan tekil bir seçimdir; cümlenizde ilk belirttiğiniz **{selected_opt}** seçildi. ({other_opts} aynı anda seçilemez.)")

        # 4.1 Warehouse / Depo Detection
        wh_key = next((k for k in props if any(w in k.lower() for w in ["warehouse", "depo", "ambar"])), None)
        if wh_key and wh_key not in extracted_args:
            wh_match = re.search(r"([a-zA-Z0-9çğıöşüÇĞİÖŞÜ_-]+)\s+(?:depo|deposu|deposundaki|deposunda|ambar|şube)", prompt_lower)
            if wh_match:
                extracted_args[wh_key] = wh_match.group(1).title()

        # 4.2 Amount / Tutar Eşiği Detection (örn: "50.000 TL üzeri", "100000 den büyük")
        amt_key = next((k for k in props if any(w in k.lower() for w in ["tutarmiktar", "tutar", "amount", "threshold", "price"])), None)
        if amt_key and amt_key not in extracted_args:
            amt_match = re.search(r"(\d+(?:[.,]\d+)*)\s*(?:tl|try|usd|eur|lira)?\s*(?:üzeri|uzeri|üstü|ustu|den büyük|den fazla|>)", prompt_lower)
            if amt_match:
                raw_val = amt_match.group(1).replace(".", "").replace(",", ".")
                try:
                    extracted_args[amt_key] = float(raw_val)
                except ValueError:
                    pass

        # 5. Grid View Specific Tool Arguments (analyze_grid_data, filter_active_grid)
        tool_name = tool.get("name", "")
        if "analyze_grid_data" in tool_name:
            if any(w in prompt_lower for w in ["pasta", "pie", "oran"]):
                extracted_args["chartType"] = "pie"
            elif any(w in prompt_lower for w in ["kpi", "toplam", "metrik"]):
                extracted_args["chartType"] = "kpi"
            else:
                extracted_args["chartType"] = "bar"

        # 6. Query Extraction (BC operatör sözdizimi)
        if "query" in props and "query" not in extracted_args:
            col_expr_match = re.match(
                r"^([a-zA-ZçğıöşüÇĞİÖŞÜ0-9_]+)\s*([<>]=?|=|:|!=|<>|\.\.)\s*(.+)$",
                prompt.strip(),
            )
            if col_expr_match:
                op_part = col_expr_match.group(2).strip()
                c_part = col_expr_match.group(1).strip()
                v_part = col_expr_match.group(3).strip()
                if op_part in [">", ">=", "<", "<=", "<>"]:
                    extracted_args["query"] = f"{op_part}{v_part}"
                elif op_part == "..":
                    extracted_args["query"] = f"..{v_part}"
                else:
                    extracted_args["query"] = v_part
                if "column" in props and "column" not in extracted_args:
                    extracted_args["column"] = c_part
            elif re.search(r"^([<>]=?|\.\.|!|\*)[a-zA-Z0-9_-]+", prompt.strip()):
                extracted_args["query"] = prompt.strip()

        # 7. Few-Shot Data Grounding (sampleRows matching)
        # Sıra bağımlılığı yok: en güçlü eşleşme kazanır (tam > ön ek > içerir).
        if context and isinstance(context, dict):
            cur_screen = context.get("current_screen")
            sample_rows = (cur_screen.get("activeDataSummary") or {}).get("sampleRows", []) if cur_screen and isinstance(cur_screen, dict) else []
            if sample_rows and isinstance(sample_rows, list) and "column" in props:
                prompt_l = prompt_lower
                best_col: Optional[str] = None
                best_val: Optional[str] = None
                best_strength = 0
                for row in sample_rows:
                    if not isinstance(row, dict):
                        continue
                    for col_name, raw_val in row.items():
                        if raw_val is None:
                            continue
                        val_str = str(raw_val).strip().lower()
                        if len(val_str) < 2:
                            continue
                        strength = 0
                        if val_str == prompt_l.strip():
                            strength = 3
                        elif len(val_str) >= 4 and (prompt_l.startswith(val_str.rsplit("-", 1)[0]) or val_str.split("-")[0] in prompt_l):
                            strength = 2
                        elif len(val_str) >= 3 and val_str in prompt_l:
                            strength = 1
                        if strength > best_strength:
                            best_strength = strength
                            best_col = col_name
                            best_val = str(raw_val)
                if best_col and "column" not in extracted_args:
                    extracted_args["column"] = best_col
                if best_val and "query" not in extracted_args and best_strength >= 1:
                    extracted_args["query"] = best_val

        # 8. Unsupported Criteria Detection
        common_unsupported = ["renk", "depo", "kadıköy", "kadikoy", "şube", "sube", "müşteri", "musteri", "marka", "kategori", "beden", "sezon", "tedarikçi", "tedarikci"]
        has_wh = any(k in props or k in extracted_args for k in ["warehouse", "depo", "ambar"])
        for concept in common_unsupported:
            if concept in prompt_lower:
                if concept in ["depo", "kadıköy", "kadikoy", "şube", "sube", "ambar"] and has_wh:
                    continue
                has_prop = any(concept in k.lower() or concept in str(p.get("description", "")).lower() for k, p in props.items())
                if not has_prop:
                    unsupported_criteria.append(concept)

        return extracted_args, unsupported_criteria, single_select_notes

    @staticmethod
    def _directive_system(tools: List[Dict[str, Any]]) -> Optional[str]:
        """
        x-ai-aliases / x-ai-quick-prompts direktiflerini SLM system prompt'una enjekte eder.
        Native motorun iç prompt limitini aşmamak için metin aksan-sadeleştirilmiş ve
        uzunlukla sınırlı tutulur (eşleşme yine de Python tarafında orijinal metinle yapılır).
        """
        def fold(s: str) -> str:
            return _fold(s)

        lines: List[str] = []
        total = 0
        for t in tools:
            if not isinstance(t, dict):
                continue
            ai = t.get("ai") or {}
            phrases = [fold(str(x)) for x in (ai.get("aliases") or [])] + \
                      [fold(str(x)) for x in (ai.get("quickPrompts") or [])]
            phrases = [p for p in phrases if p]
            if phrases and t.get("name"):
                line = f"- {t['name']}: {', '.join(phrases)}"
                lines.append(line)
                total += len(line)
                if total > 400:
                    break
        if not lines:
            return None
        return "If the user message resembles these phrases, call the related tool:\n" + "\n".join(lines)

    def process_task(
        self,
        prompt: str,
        tools: List[Dict[str, Any]],
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Uçtan uca Needle çıkarım ve doğrulama akışı (SLM-first):
        1. Gerçek Cactus Needle SLM (~50ms) — x-ai-* direktifleri system'e enjekte edilerek
        2. SLM üretmezse kural motoru fallback (intent scoring + slot filling)
        3. Her iki yolun çıktısı SchemaGuard ile deterministik doğrulanır
        """
        start_time = time.perf_counter()
        prompt_lower = prompt.lower()

        # Ekranda sonuç tablosu açık mı?
        is_viewing_results = False
        if context and isinstance(context, dict):
            cur_screen = context.get("current_screen")
            if cur_screen and isinstance(cur_screen, dict):
                is_viewing_results = bool((cur_screen.get("activeDataSummary") or {}).get("isViewingResults"))

        is_asking_new_report = has_any(_fold(prompt_lower), "newReport")
        clear_intent = has_any(_fold(prompt_lower), "clear")
        is_general_question = False
        # Şema/şekil türevli sinyal (kavram sözlüğü yok): kelime+operatör,
        # harf-ayraç-rakam şekli veya tırnaklı literal.
        has_direct_grid_filter = bool(
            re.search(r"(?:^|\s)[a-zçğıöşü0-9_]+\s*(?:>=|<=|<>|!=|=|>|<|\.\.)\s*\S", prompt_lower)
            or re.search(r"\b[a-zçğıöşü]+[-_]\d+\b", prompt_lower)
            or re.search(r"""["“'«].+["”'»]""", prompt_lower)
        )

        # 1. ⚡ SLM önce denenir (direktifler system'e enjekte edilmiş halde)
        # İstisna: promptta AÇIK tarih sinyali (yıl/ay adı) varsa tarihler deterministik
        # kural motorundan gelmeli — 45M modelin tarih tahmini güvenli değildir.
        date_signal = (
            bool(re.search(r"\b20\d\d\b", prompt))
            or any(_fold(m) in _fold(prompt_lower) for m in TURKISH_MONTHS)
        )
        slm_result: Optional[Tuple[str, Dict[str, Any]]] = None
        if not date_signal:
            slm_result = self._slm_extract(prompt, [t for t in tools if isinstance(t, dict)],
                                           system_text=self._directive_system(tools))
        slm_used = False
        slm_args: Optional[Dict[str, Any]] = None

        # Tool Scoring & Matching (her zaman çalışır — arbitraj için sinyal gerekir)
        best_tool = None
        max_score = -999
        directive_matched = False

        for tool in tools:
            if not isinstance(tool, dict):
                continue
            tool_name_str = tool.get("name", "")
            name = tool_name_str.lower().replace("filter_", "")
            desc = tool.get("description", "").lower()
            scope_type = tool.get("scope", {}).get("type", "")
            aliases = tool.get("ai", {}).get("aliases", [])
            score = 0

            # 0. Quick Prompts Matching (+800) — x-ai-quick-prompts direktifi: YETKİ KAYNAĞI
            prompt_folded = _fold(prompt_lower)
            quick_prompts = tool.get("ai", {}).get("quickPrompts", [])
            if isinstance(quick_prompts, list):
                for qp in quick_prompts:
                    qp_l = str(qp).lower()
                    qp_f = _fold(qp_l)
                    if qp_l == prompt_lower or (len(qp_l) >= 4 and qp_l in prompt_lower) \
                       or qp_f == prompt_folded or (len(qp_f) >= 4 and qp_f in prompt_folded) \
                       or fuzzy_similarity(prompt_lower, qp_l) >= 0.85:
                        score += 800
                        directive_matched = True
                        break

            # 1. Alias Matching (+600) — x-ai-aliases direktifi: YETKİ KAYNAĞI
            if isinstance(aliases, list):
                for alias in aliases:
                    alias_l = str(alias).lower()
                    alias_f = _fold(alias_l)
                    if alias_l == prompt_lower or (len(alias_l) >= 4 and alias_l in prompt_lower) \
                       or (len(prompt_lower) >= 4 and fuzzy_similarity(prompt_lower, alias_l) >= 0.85) \
                       or alias_f in prompt_folded:
                        score += 600
                        directive_matched = True
                        break

            # 2. Schema Enums & Properties Matching (+150 / +60)
            props = tool.get("parameters", {}).get("properties", {})
            if isinstance(props, dict):
                for p_key, p_def in props.items():
                    p_title = str(p_def.get("title", "")).lower()
                    enums = [str(e).lower() for e in p_def.get("enum", [])]
                    items_enums = [str(e).lower() for e in p_def.get("items", {}).get("enum", [])]
                    for ev in (enums + items_enums):
                        if len(ev) >= 3 and (ev in prompt_lower or ev.replace("i", "ı") in prompt_lower):
                            score += 150
                    if len(p_title) >= 4 and p_title in prompt_lower:
                        score += 60


            is_general_question = any(q in prompt_lower for q in ["kaç", "kac", "nedir", "neler", "kimsin", "kimdir", "nasıl", "nasil", "nerede", "nereden", "ne zaman", "ne işe", "yardım", "yardim", "bilgi", "anlat", "workspace"]) and not any(a in prompt_lower for a in ["hazırla", "hazirla", "filtrele", "süz", "suz", "çalıştır", "calistir", "seç", "sec", "ayarla"])

            # 4. Aktif Ekran / Mevcut Kriter Formu Önceliği (+550)
            if context and isinstance(context, dict) and not is_general_question:
                cur_screen = context.get("current_screen")
                if cur_screen and isinstance(cur_screen, dict):
                    active_scope = cur_screen.get("activeReportScope") or cur_screen.get("screenId", "")
                    if active_scope and active_scope not in ["home", "item-form"] and not is_viewing_results and not is_asking_new_report:
                        clean_id = str(active_scope).replace("-", "_").replace("filter_", "").lower()
                        if clean_id in tool_name_str.lower():
                            score += 550

            # 5. State-Driven Scope Bias
            if is_viewing_results and not is_asking_new_report:
                if scope_type != "screen" and not tool_name_str.startswith("filter_active_grid") and not tool_name_str.startswith("analyze_grid_data") and not tool_name_str.startswith("detect_grid_anomalies") and not tool_name_str.startswith("clear_grid_filters"):
                    score -= 500
                else:
                    score += 150
                if "analyze_grid_data" in tool_name_str and (has_any(_fold(prompt_lower), "summary") or any(k in prompt_lower for k in ["pasta", "çubuk", "cubuk"])):
                    score += 300
                if "detect_grid_anomalies" in tool_name_str and has_any(_fold(prompt_lower), "anomaly"):
                    score += 400
                if "filter_active_grid" in tool_name_str:
                    score += 280
                    if any(w in prompt_lower for w in ["süz", "filtre", "göster", "olan", "olanlar", "listele", "ara", "bul"]):
                        score += 100
                if "clear_grid_filters" in tool_name_str and has_any(_fold(prompt_lower), "clear"):
                    score += 300
            else:
                # Ekranda sonuç yokken veya yeni rapor istenirken SQL/Analyze araçlarına ceza ver
                if tool_name_str in ["query_report_data", "analyze_grid_data", "detect_grid_anomalies", "filter_active_grid", "clear_grid_filters"]:
                    score -= 400
                if tool_name_str == "filter_active_grid" and has_direct_grid_filter:
                    score += 700

            # Açık net "temizle" niyeti her durumda en üst öncelik — dal farkı gözetmez;
            # +1300: -400 viewing-dışı cezasını da aşarak kesin niyet eşiğini (900) garantiler
            if "clear_grid_filters" in tool_name_str and clear_intent:
                score += 1300

            for word in name.replace("_", " ").split():
                if len(word) > 2 and word in prompt_lower:
                    score += 15
            for word in desc.split():
                if len(word) > 3 and word in prompt_lower:
                    score += 3

            if score > max_score:
                max_score = score
                best_tool = tool

        if not best_tool and tools:
            # Context'e göre en uygun fallback
            best_tool = tools[0]

        # 2. ⚖️ Arbitraj: SLM tahmini ile kural sinyali çelişirse güçlü kural kazanır
        if slm_result:
            slm_name, slm_args = slm_result
            matched = next((t for t in tools if isinstance(t, dict) and t.get("name") == slm_name), None)
            rule_strong = best_tool is not None and max_score >= 300 and best_tool.get("name") != slm_name
            if matched is not None and not (rule_strong or directive_matched):
                best_tool = matched
                slm_used = True

        tool_name = best_tool.get("name", "") if best_tool else ""
        if slm_used:
            args = dict(slm_args or {})
            # Şema-davranış hizalaması: kullanıcı açık tarih vermediyse SLM'in
            # tahminini kural motoru varsayılanıyla değiştir (tek alan→dün,
            # başlangıç/bitiş çifti→son 30 gün..bugün).
            if not date_signal and isinstance(args, dict):
                runish = any(w in prompt_lower for w in [
                    "hazırla", "hazirla", "çalıştır", "calistir",
                    "oluştur", "olustur", "getir", "göster", "goster"])
                if runish:
                    slm_props = ((best_tool or {}).get("parameters") or {}).get("properties") or {}
                    date_keys = [k for k in slm_props if any(
                        x in k.lower() for x in ["kayit", "date", "tarih", "from", "to"])]
                    if date_keys:
                        today_dt = datetime.now()
                        y_str = (today_dt - timedelta(days=1)).strftime("%Y-%m-%d")
                        t_str = today_dt.strftime("%Y-%m-%d")
                        last30 = (today_dt - timedelta(days=30)).strftime("%Y-%m-%d")
                        from_k = next((k for k in date_keys if any(
                            x in k.lower() for x in ["from", "start", "baslangic", "başlangıç"])), None)
                        to_k = next((k for k in date_keys if any(
                            x in k.lower() for x in ["to", "end", "bitis", "bitiş"])), None)
                        single_k = next((k for k in date_keys if k not in (from_k, to_k)), None)
                        if from_k and to_k:
                            args[from_k] = last30
                            args[to_k] = t_str
                        elif single_k:
                            args[single_k] = y_str
            unsupported: List[str] = []
            single_notes: List[str] = []
        else:
            args, unsupported, single_notes = self.extract_and_validate(prompt, best_tool or {}, context)

        # 0a. Bileşik nitelik grameri (kriter formu araçları): "itemname timur" → {<isim-alanı>: timur}.
        # Grid araçları frontend'in synthesizeGridFilterArgs sözleşmesinde olduğundan burada atlanır.
        _GRID_TOOLS = {"filter_active_grid", "analyze_grid_data", "clear_grid_filters", "detect_grid_anomalies"}
        if tool_name not in _GRID_TOOLS:
            args = apply_compound_qualifier_args(prompt_lower, best_tool or {}, args if isinstance(args, dict) else {})

        # 0. JSON Schema Guard Validation & Sanitization (Zero hallucination & Enum guard)
        sanitized_args, rejected_reasons, guard_notes = SchemaGuard.validate_and_sanitize(best_tool or {}, args)
        single_notes.extend(guard_notes)
        args = sanitized_args

        # 0b. Yıl tutarlılık koruması: promptta açıkça geçen TEK bir yıl varsa,
        # tarih argümanlarının yılı buna zorlanır ("2025 yılı ocak" -> 2026-01 üretme hatası).
        explicit_years = set(re.findall(r"\b(20\d\d)\b", prompt))
        if len(explicit_years) == 1:
            forced_year = next(iter(explicit_years))
            for key in ("date_start", "date_end", "start_date", "end_date"):
                val = str(args.get(key) or "")
                if len(val) >= 4 and val[:4].isdigit() and val[:4] != forced_year:
                    args[key] = forced_year + val[4:]

        # 0c. Şema-tipi öz-düzeltme (Arrow/DuckDB grounding): filtre değeri hedef
        # kolonun FİZİKSEL tipiyle uyumsuzsa (örn. DATE kolona 'kaç kayıt var'
        # gibi serbest metin), bu bir soru/sayım niyetidir → analyze_grid_data'ya delege edilir.
        col_types: Dict[str, Any] = {}
        if context and isinstance(context, dict):
            cur_screen_ctx = context.get("current_screen") or {}
            if isinstance(cur_screen_ctx, dict):
                col_types = (cur_screen_ctx.get("activeDataSummary") or {}).get("columnTypes") or {}
        tool_name, args = self_correct_grid_filter(tool_name, args if isinstance(args, dict) else {}, col_types)

        elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)

        # Desteklenmeyen kriter rehberliği
        guidance_note = ""
        if unsupported:
            props = best_tool.get("parameters", {}).get("properties", {}) if best_tool else {}
            valid_titles = [str(p.get("description", k)).split(":")[0].strip() for k, p in props.items() if not str(p.get("description", "")).startswith("[")][:4]
            guidance_note = f"💡 **Bilgi:** Bu raporda **{', '.join(unsupported)}** filtresi bulunmamaktadır. Rapor desteklenen kriterlerle hazırlandı.\n*(Mevcut kriterler: {', '.join(valid_titles) or 'Tarih, Durum, Para Birimi'})*\n\n"

        combined_msg = "\n\n".join(filter(None, [guidance_note.strip(), "\n\n".join(single_notes).strip()]))

        # Realistic Confidence calculation (Ambiguous, general questions or empty extractions yield to Gemma 4)
        # Argümansız aksiyon araçları (örn. clear_grid_filters): niyet eşleştiyse eylemin kendisi yeterlidir
        argless_action = bool(best_tool) and not (((best_tool.get("parameters") or {}).get("properties")) or {})
        # SLM 'call' döndüyse veya direktif eşleştiyse eylem niyeti kesindir (args boş olsa da: form açma)
        has_extracted_args = bool(args) or slm_used or directive_matched or (argless_action and not is_general_question)
        if is_general_question and not slm_used:
            confidence = 0
        elif slm_used:
            confidence = 88
        elif directive_matched:
            confidence = 92
        elif max_score >= 400 and has_extracted_args:
            confidence = 95
        elif max_score >= 100 and has_extracted_args:
            confidence = 85
        elif has_extracted_args:
            confidence = 65
        else:
            confidence = 0

        return {
            "type": "tool_call",
            "tool": tool_name,
            "arguments": args,
            # main.py gate'i için: argümansız ama kesin aksiyon (temizle / direktifli rapor açma / SLM call vb.)
            "argless": bool(has_extracted_args),
            # Şema türevi eşleşme: x-ai-aliases / quick-prompts promptla buluştu mu?
            "aliasMatched": bool(directive_matched),
            "message": combined_msg.strip(),
            "telemetry": {
                # Şeffaf telemetri: hangi katman ürettiyse o etiketlenir; token üretilmez
                "model": "Needle 2 SLM (on-device)" if slm_used else "Needle Rule Engine",
                "engine": "Needle Engine",
                "promptTokens": 0,
                "completionTokens": 0,
                "totalTokens": 0,
                "durationMs": elapsed_ms,
                "confidence": confidence,
            }
        }
