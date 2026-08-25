#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sims AI Agent Sidecar — Multi-Provider Pydantic AI Engine & Skill Bridge
"""

import sys
import json
import os
import re
from datetime import datetime, timedelta
from schema_guard import fuzzy_similarity
from intents import INTENTS, has_any, fold_tr
from ai_provider_factory import AiProviderFactory
from pydantic_ai_tool_adapter import PydanticAiToolAdapter
import skill_registry
import yula  # noqa: F401 — skill .py'larının `import yula` SDK'sı; PyInstaller bundle'a düşsün diye

# PyInstaller bundle'indaki native Needle motorunu kullan (son kullanici makinesinde
# ilk calistirmada ~14MB indirme gereksinimini ortadan kaldirir)
if getattr(sys, "frozen", False):
    try:
        meipass = getattr(sys, "_MEIPASS", "")
        if meipass:
            from needle.agent import fetch as _needle_fetch
            _bundled = os.path.join(meipass, _needle_fetch._lib_name())
            if os.path.exists(_bundled):
                os.environ.setdefault("NEEDLE_LIB_PATH", _bundled)
    except Exception:
        pass

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)
if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(line_buffering=True)

try:
    from needle_engine import NeedleEngine
    needle_engine = NeedleEngine()
except Exception as e:
    import traceback
    sys.stderr.write(f"[Needle Init Error] {e}\n{traceback.format_exc()}\n")
    sys.stderr.flush()
    needle_engine = None

active_ai_config = {
    "provider": "ollama",
    "model": "gemma4:12b-mlx",
    "endpoint": "http://127.0.0.1:11434",
    "apiKey": ""
}

conversation_history = []
registered_tools = []
active_request_id = None
awaiting_llm_tool_result = False

# Skill Registry: skills/<klasör>/SKILL.md + *.py (internal → agent içinde; bridged → frontend köprüsü)
loaded_skills = []


def _skill_base_dirs():
    dirs = [skill_registry.Path(__file__).resolve().parent / "skills"]
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", "")
        if meipass:
            dirs.insert(0, skill_registry.Path(meipass) / "skills")
    return dirs


def refresh_skills():
    global loaded_skills
    loaded_skills = skill_registry.discover_skill_dirs(_skill_base_dirs())
    return loaded_skills


def emit_skills_list():
    items = [
        {
            "folder": s.folder_name,
            "recipe_md": s.recipe_md,
            "functions": [
                {
                    "name": f.name,
                    "description": f.description,
                    "needs_session_data": f.needs_session_data,
                    "buttons": f.buttons,
                }
                for f in s.functions
            ],
        }
        for s in loaded_skills
    ]
    send_json({"type": "skills_list", "skills": items})


def internal_skill_tools():
    """Internal skill fonksiyonlarını pydantic_ai Tool'a çevirir (grafik içinde çalışırlar)."""
    from pydantic_ai import Tool as PaiTool

    tools = []
    for s in loaded_skills:
        for f in s.internal_functions:
            try:
                tools.append(
                    PaiTool.from_schema(
                        f.run_callable,
                        name=f.name,
                        description=f.description,
                        json_schema=f.parameters,
                    )
                )
            except Exception as e:
                sys.stderr.write(f"[Skill Registry] {f.name} Tool'a çevrilemedi: {e}\n")
    return tools


def send_json(data):
    """stdout kanalına tek satır JSON basar ve tamponu hemen boşaltır (flush)."""
    if active_request_id and isinstance(data, dict) and "requestId" not in data:
        data = {**data, "requestId": active_request_id}
    json_line = json.dumps(data, ensure_ascii=False)
    sys.stdout.write(json_line + "\n")
    sys.stdout.flush()

def get_system_prompt(context=None):
    today = datetime.now()
    yesterday = today - timedelta(days=1)
    last_week = today - timedelta(days=7)
    last_30_days = today - timedelta(days=30)
    first_of_month = today.replace(day=1)
    first_of_year = today.replace(month=1, day=1)
    
    today_str = today.strftime("%Y-%m-%d (%A)")
    today_iso = today.strftime("%Y-%m-%d")
    yesterday_str = yesterday.strftime("%Y-%m-%d")
    last_week_str = last_week.strftime("%Y-%m-%d")
    last_30_str = last_30_days.strftime("%Y-%m-%d")
    month_start_str = first_of_month.strftime("%Y-%m-%d")
    year_start_str = first_of_year.strftime("%Y-%m-%d")

    context_info = ""
    viewing_results = False
    if context and isinstance(context, dict):
        screen0 = context.get("current_screen") or {}
        viewing_results = bool(
            (screen0.get("activeDataSummary") or {}).get("isViewingResults")
        )
        raw_ws = context.get("active_workspace", "")
        screen = context.get("current_screen") or {}
        screen_title = screen.get("screenTitle", "")
        screen_id = screen.get("screenId", "")
        
        ws_display_names = {
            "selling": "Subcontracting (Fason & Dış Kaynak)",
            "subcontracting": "Subcontracting (Fason & Dış Kaynak)",
            "stock": "Stok (Stock)",
            "accounting": "Finans & Muhasebe (Accounting)",
            "financial-reports": "Finans & Muhasebe (Accounting)",
            "manufacturing": "Üretim (Manufacturing)",
            "landed_cost": "Maliyet Dağıtımı (Landed Cost)",
            "settings": "Kullanıcı Ayarları (Settings)"
        }
        workspace_display = ws_display_names.get(raw_ws, raw_ws)
        if not screen_title or screen_title.startswith("Home") or screen_title == "Home":
            screen_title = f"{workspace_display} Ana Ekran"

        context_info = f"\nACTIVE SCREEN & WORKSPACE CONTEXT:\n- Active Workspace: {workspace_display} (code: {raw_ws})\n- Active Screen: {screen_title}\n"
        if screen.get("activeFilters"):
            context_info += f"- Current Screen Filters: {json.dumps(screen.get('activeFilters'))}\n"
        sample_rows = screen.get("activeDataSummary", {}).get("sampleRows")
        if sample_rows and isinstance(sample_rows, list) and len(sample_rows) > 0:
            context_info += f"- Active Data Samples (Few-Shot Grounding):\n{json.dumps(sample_rows[:3], indent=2, ensure_ascii=False)}\n"
            context_info += "DATA GROUNDING DIRECTIVE: Inspect the sample data above to accurately determine which column holds the user's searched code or value and pass it to the 'column' argument.\n"

        # Arrow/DuckDB şema grounding: fiziksel kolon tipleri (tarih/sayı/metin)
        column_types = screen.get("activeDataSummary", {}).get("columnTypes")
        if isinstance(column_types, dict) and column_types:
            context_info += "- Column Types (from Arrow/DuckDB physical schema): " + json.dumps(column_types, ensure_ascii=False) + "\n"
            context_info += (
                "SCHEMA TYPE DIRECTIVE (MANDATORY):\n"
                "- Respect these PHYSICAL types when producing tool arguments.\n"
                "- NEVER write free text into a DATE or NUMBER column. Example: for a DATE column like 'Posting Date', values such as 'kaç kayıt var' or any question text are INVALID.\n"
                "- For DATE columns pass ISO dates (YYYY-MM-DD) or ranges like 2025-01-01..2025-01-31.\n"
                "- If the user's message is a QUESTION or aggregation (count/how many/kaç kayıt/total/average), DO NOT call filter tools — call 'analyze_grid_data' instead.\n"
            )

        # Kriter-formu sindirimi: raporun GERÇEK filtre alanları (JSON Schema'dan)
        criteria_digest = screen.get("criteriaDigest")
        if isinstance(criteria_digest, list) and criteria_digest:
            context_info += "- Report Criteria Digest (actual filterable fields, from JSON Schema): " + json.dumps(criteria_digest, ensure_ascii=False) + "\n"
            context_info += (
                "REPORT CRITERIA DIRECTIVE (MANDATORY when present): These are the ONLY filterable fields of the "
                "current report. When describing this report or answering 'ne hakkında / hangi kriterler / nasıl "
                "kullanılır' questions, ground your answer EXACTLY in these field titles/descriptions/enums — "
                "do not invent criteria or values beyond them.\n"
            )

        # Kolon sindirimi: şekil imzası + örnek değer (kompakt few-shot; ham satır basmadan)
        column_digest = screen.get("activeDataSummary", {}).get("columnDigest")
        if isinstance(column_digest, dict) and column_digest:
            context_info += "- Column Digest (shape signature + sample value per column): " + json.dumps(column_digest, ensure_ascii=False) + "\n"
            context_info += (
                "COLUMN DIGEST DIRECTIVE: In each digest, 'shape' maps letter-runs to 'a' and digit-runs to '#' "
                "(e.g. 'Sample 8' -> 'a #', 'SKU-001' -> 'aaa-###'). When a digest has a human-readable 'label', "
                "use it as the authoritative business meaning of that column — do not invent meanings beyond it. "
                "Before choosing the 'column' argument, "
                "match the SHAPE of the user's searched value against these digests and prefer the matching column. "
                "The final column is still resolved authoritatively by the frontend — your choice serves as a strong hint.\n"
            )

        # Deterministik ön-ranked aday listesi (Step-1 TS) → model yalnız bunlardan seçer (Step-2)
        column_candidates = screen.get("activeDataSummary", {}).get("columnCandidates")
        if isinstance(column_candidates, list) and column_candidates:
            context_info += "- Column Candidates (pre-ranked by deterministic schema/sample analysis, best first): " + json.dumps(column_candidates, ensure_ascii=False) + "\n"
            context_info += (
                "COLUMN CANDIDATES DIRECTIVE (MANDATORY when present): When a tool has a 'column' argument, "
                "you MUST use one of these EXACT names (best match first). "
                "If none fits the user's intent, OMIT the 'column' argument entirely — never invent another name.\n"
            )

        if screen.get("activeDataSummary", {}).get("isViewingResults"):
            context_info += (
                "\n*** MANDATORY RESULT GRID DIRECTIVE ***\n"
                "- The user is actively viewing the table results grid on the screen.\n"
                "- DO NOT invoke report criteria form tools (e.g. filter_stock_balance, filter_stock_analytics)!\n"
                "- To filter rows on this open table, ALWAYS invoke 'filter_active_grid'! (e.g. for in-stock, pass query: '<>0' or column: 'stock')\n"
                "- To summarize, count records ('kaç kayıt var', 'how many') or create charts on this table, ALWAYS invoke 'analyze_grid_data'!\n"
                "- To clear filters, ALWAYS invoke 'clear_grid_filters'!\n"
            )
        else:
            context_info += (
                "CONTEXT RULE: The user is currently on this active screen. "
                "If the user asks to filter or inspect data (e.g. SKU, city, date, etc.), "
                "PRIORITIZE executing the current screen's filter/update tool instead of opening a different report.\n"
            )

    ws_name = (context.get("active_workspace", "") if context else "") or "stok"
    if viewing_results:
        greeting_rule = (
            f"6. SELAMLAMA VE BAĞLAM DUYARLI REHBERLİK: Kullanıcı 'merhaba', 'selam', 'nasılsın' gibi "
            f"bir selamlama yazdığında ASLA ARAÇ ÇAĞIRMA. Kullanıcı ŞU ANDA EKRANDA AÇIK BİR SONUÇ TABLOSU "
            f"GÖRÜNTÜLÜYOR ({screen_title if (context and isinstance(context, dict)) else 'Aktif Tablo'}). "
            f"Sıcak ve profesyonel Türkçe karşılık ver; selamlamayı BU AKTİF TABLO üzerine kur ve "
            f"sadece SANA VERİLEN ARAÇ LİSTESİNDEKİ yeteneklere göre konuş: "
            f"- Listede filtre aracı varsa değer/kolon bazında filtreleme önerebilirsin.\n"
            f"- Analiz/KPI aracı varsa toplam-en yüksek-grafik özetleri önerebilirsin.\n"
            f"- Dışa aktarma (Excel) aracı varsa 'Excel'e aktar' demenin yeterli olduğunu belirt.\n"
            f"- LİSTEDE OLMAYAN hiçbir yeteneği VAAT ETME. Rapor menüsü LİSTELEME.\n"
            f"- Önerilerini madde madde ver ve HER maddeyi şu birebir biçimde yaz — frontend bu "
            f"maddeleri TIKLANABİLİR yapar: \n"
            f"  - **Kısa Başlık:** kullanıcının aynen gönderebileceği somut istek cümlesi\n"
            f"  En fazla 3 madde; her istek yalnızca verilen araç listesindeki bir yeteneğe "
            f"dönüşebilmelidir."
        )
    else:
        greeting_rule = (
            f"6. SELAMLAMA VE BAĞLAMA DUYARLI REHBERLİK: Kullanıcı 'merhaba', 'selam', 'nasılsın' gibi "
            f"bir selamlama yazdığında ASLA ARAÇ ÇAĞIRMA. Kullanıcıya sıcak ve profesyonel bir dille karşılık ver, "
            f"şu an bulunduğu aktif çalışma alanını ({ws_name}) ve ekranı belirt. Madde imi vereceksen YALNIZCA gerçek "
            f"ERP rapor adlarını listele (örn: '• **Stok Bakiyesi**', '• **Stok Analitik Raporu**'). 'Filtreleme' veya "
            f"'Arama' gibi genel eylemleri bağımsız rapor maddesi gibi listeleme; bunları cümle içinde "
            f"'Bu raporlar üzerinde tarih, ambar veya ürün bazında filtrelemeler yapabilirsiniz' şeklinde açıkla."
        )

    return (
        f"Sen Yula, akıllı ve kurumsal ERP yapay zeka asistanısın.\n"
        f"Kullanıcıya DAİMA TÜRKÇE, profesyonel, net ve yardımcı bir dille yanıt ver. Asla İngilizce konuşma.\n"
        f"Bugünün Tarihi: {today_str}.\n"
        f"Referans Tarihler:\n"
        f"- Bugün: {today_iso}\n"
        f"- Dün: {yesterday_str}\n"
        f"- Son 7 gün: {last_week_str}\n"
        f"- Son 30 gün: {last_30_str}\n"
        f"- Ay başı: {month_start_str}\n"
        f"- Yıl başı: {year_start_str}\n"
        f"{context_info}\n"
        f"SİSTEMDEKİ ÇALIŞMA ALANLARI VE GERÇEK MENÜLER (GROUNDED WORKSPACES):\n"
        f"1. Stock (Stok Yönetimi / stock):\n"
        f"   - Aktif AI Raporları: Stok Bakiyesi (Stock Balance), Stok Analitik Raporu (Stock Analytics).\n"
        f"   - Menü Sayfaları: Stok Kartı (Item), Ambarlar (Warehouse), Stok Girişi (Stock Entry), Satınalma Kabul (Purchase Receipt), İrsaliye (Delivery Note), Sayım (Stock Reconciliation), Malzeme Talebi (Material Request).\n"
        f"2. Subcontracting (Fason & Dış Kaynak / selling):\n"
        f"   - Menü Sayfaları: Gelen Fason Siparişi (Inward Subcontracting Order), Giden Fason Siparişi (Outward Subcontracting Order), Fason Teslimat (Subcontracting Delivery), Fason Kabul (Subcontracting Receipt), Satış Siparişi (Sales Order).\n"
        f"3. Financial Reports (Finans & Muhasebe / accounting):\n"
        f"   - Menü Sayfaları: Bilanço (Balance Sheet), Gelir Tablosu (Profit and Loss), Nakit Akışı (Cash Flow), Mizan (Trial Balance), Konsolide Rapor, Muavin Defter.\n"
        f"4. Manufacturing (Üretim / manufacturing):\n"
        f"   - Menü Sayfaları: İş Emirleri (Work Orders), Üretim Planlama, Ürün Reçeteleri (BOM), Operasyonlar.\n"
        f"5. Landed Cost (Maliyet Dağıtımı / landed_cost):\n"
        f"   - Menü Sayfaları: Maliyet Yükleme Fişi (Landed Cost Voucher), İthalat Masraf Dağıtımı.\n"
        f"6. Settings (Kullanıcı Ayarları / settings): AI model yapılandırması, API anahtarları ve tercihler.\n\n"
        f"HALÜSİNASYON ENGELLEME VE RAPOR ÖNERİ KURALI:\n"
        f"- Rapor veya analiz önerirken YALNIZCA aktif AI araçları olan 'Stok Bakiyesi' ve 'Stok Analitik Raporu'nu öner.\n"
        f"- Sistemde henüz AI JSON şeması bulunmayan diğer menü başlıklarını 'rapor hazırlayabilirim' şeklinde sunma.\n\n"
        f"GENEL ŞEMA TABANLI ARAÇ ÇAĞIRMA KURALLARI:\n"
        f"1. ERP JSON şemalarından dinamik olarak üretilmiş araçlara sahipsin.\n"
        f"2. Araç açıklamalarını ve parametrelerini dikkatlice oku:\n"
        f"   - Eğer bir araçta ayrı başlangıç/bitiş tarihleri varsa, YYYY-MM-DD olarak ayrı gönder.\n"
        f"   - Eğer tek tarih parametresi varsa ve aralık istendiyse 'YYYY-MM-DD..YYYY-MM-DD' gönder.\n"
        f"   - DYNAMICS 365 / BUSINESS CENTRAL FİLTRE SÖZDİZİMİ: Aralık: '100..500', Alt sınır: '50000..', Üst sınır: '..1000', Hariç tutma: '!Ankara' veya '!Ankara&!İzmir', Veya: 'Ankara|İzmir', Joker: 'SKU*', Sıfır olmayan: '<>0', Boş: '''' .\n"
        f"3. EKRANDA TABLO AÇIKKEN (RESULT GRID) — YALNIZCA verilen araç listesinde 'filter_active_grid' / 'analyze_grid_data' / 'clear_grid_filters' araçları GERÇEKTEN varsa:\n"
        f"   - Kullanıcı filtreleme istediğinde 'filter_active_grid' aracını çağır.\n"
        f"   - Kullanıcı özet, toplam, grafik veya metrik istediğinde 'analyze_grid_data' aracını çağır.\n"
        f"   - Kullanıcı filtreleri temizlemek istediğinde 'clear_grid_filters' aracını çağır.\n"
        f"   - Bu araçlar listede YOKSA (örn. kriter formu ekranındaysa) ASLA uydurma! Kullanıcının filtre talebini o ekranda kayıtlı olan rapor/kriter aracıyla karşıla; hiç uygun araç yoksa araç çağırmadan Türkçe yönlendirme yap.\n"
        f"   - GENEL KURAL: Yalnızca sana verilen araç listesindeki İSİMLERLE, birebir aynı yazımla araç çağır. TEK İSTİSNA: 'web_fetch' aracı yerleşiktir ve listede görünmese dahi çağrılabilir.\n"
        f"4. DESTEKLENMEYEN KRİTERLERDE REHBERLİK:\n"
        f"   - Kullanıcı şemada olmayan bir filtre talep ederse Türkçe olarak bu raporda bu filtrenin olmadığını ve mevcut geçerli kriterleri belirt.\n"
        f"5. GENEL BİLGİ, SORU-CEVAP VE SOHBET: Kullanıcı 'sistemde kaç workspace var', 'bu ekran ne işe yarıyor', 'kimsin', 'nasıl kullanılır' gibi bilgi/soru cümleleri sorduğunda ASLA ARAÇ ÇAĞIRMA (tool call yapma). Doğrudan akıcı, net ve kurumsal bir Türkçe dille soruyu yanıtla.\n"
        f"{greeting_rule}\n"
        f"7. ANLAŞILAMAYAN / BELİRSİZ İFADELER: Kullanıcı anlamsız veya belirsiz bir kelime yazdığında (örn: 'ddw', 'asdf', 'deneme'), bunu nezaketle belirtip şu anki aktif çalışma alanında yapabileceği işlemleri hatırlatarak yönlendir.\n"
        f"8. EYLEM VE ARAÇ ÇAĞIRMA (TOOL CALLING): Kullanıcı somut bir rapor, filtre veya kriter değişikliği talep ettiğinde DAİMA ilgili aracı (function tool_call) çağırarak parametreleri sisteme uygula.\n"
        f"9. Tüm yanıtlarını daima akıcı, kurumsal ve kusursuz Türkçe olarak üret.\n"
        f"10. WEB FETCH (URL İÇERİĞİ OKUMA): Kullanıcı bir web adresi/URL verirse veya cevap bir sayfanın güncel içeriğini gerektiriyorsa 'web_fetch' aracını çağır ({{\"url\": \"https://...\"}}). Sayfa içeriği sana markdown olarak döner; bunu Türkçe özetleyip yanıtla. Sayfaya erişilemezse bunu Türkçe olarak belirt ve içeriği UYDURMA. Sıradan sohbet/bilgi sorularında bu aracı çağırma."
    )

def handle_user_task(prompt_text, context=None):
    global conversation_history, registered_tools, awaiting_llm_tool_result
    
    prompt_lower = prompt_text.strip().lower()

    # 1. Rapor ve Yetenek Keşfi Sorguları (örn: "hangi raporlar var", "raporlar neler", "mevcut raporlar")
    report_discovery = INTENTS.get("reportDiscovery", [])
    if any(k in prompt_lower for k in report_discovery) and registered_tools:
        report_items = []
        for t in registered_tools:
            name = t.get("name", "")
            desc = t.get("description", "").split(" raporunun kriterlerini")[0].split(".")[0]
            if name.startswith("filter_") and not name.startswith("filter_active_grid"):
                clean_title = desc if desc else name.replace("filter_", "").replace("_", " ").title()
                report_items.append(f"• **{clean_title}** (`{name}`)")
        
        list_str = "\n".join(report_items) if report_items else "• Stok Bakiye Raporu\n• Stok Analitik Raporu"
        send_json({
            "type": "message",
            "content": f"📊 **Sistemde Kullanabileceğiniz Raporlar:**\n\n{list_str}\n\nİstediğiniz raporu açmak veya kriterlerini ayarlamak için raporun adını ya da görmek istediğiniz filtreleri (tarih, ambar, SKU vb.) yazabilirsiniz.",
            "telemetry": {
                "model": "Needle 2 (SLM)",
                "engine": "Needle Engine",
                "durationMs": 0.5,
                "totalTokens": 0
            }
        })
        return

    # 2. ⚡ Needle On-Device SLM Parameter Extractor & Validator
    if needle_engine and registered_tools:
        try:
            needle_res = needle_engine.process_task(prompt_text, registered_tools, context)
            confidence = needle_res.get("telemetry", {}).get("confidence", 0)
            has_actionable_args = bool(needle_res.get("arguments")) or needle_res.get("argless") is True
            is_new_report = has_any(fold_tr(prompt_lower), "newReport")

            # Pozitif kanıt sözleşmesi: yapısal veri sinyali (operatör / kod şekli /
            # tarih) yoksa yüksek güven bile aksiyona dönüşmez — soru cümleleri
            # LLM'e kalır ve kriter alanlarına çöp yazılması engellenir.
            data_signal = bool(
                re.search(r"(?:^|\s)[a-zçğıöşü0-9_]+\s*(?:>=|<=|<>|!=|=|>|<|\.\.)\s*\S", prompt_lower)
                or re.search(r"\b[a-zçğıöşü]+[-_]\d+\b", prompt_lower)
                or re.search(r"[\u201c\u2019'\u00ab].+[\u201d\u2019'\u00bb]", prompt_text)
                or re.search(r"\b20\d\d\b", prompt_text)
                # Sayısal eşik niyeti (şema-türevli): promptta sayı + Arrow
                # şemasında numeric kolon → filtre adayı
                or (re.search(r"\b\d+(?:[.,]\d+)?\b", prompt_text)
                    and any(v == "number" for v in ((context or {}).get("current_screen") or {})
                            .get("activeDataSummary", {}).get("columnTypes", {}).values()))
                or any(m in prompt_lower for m in [
                    "ocak","subat","şubat","mart","nisan","mayis","mayıs","haziran",
                    "temmuz","agustos","ağustos","eylul","eylül","ekim","kasim","kasım","aralik","aralık",
                    "dun","dün","bugun","bugün","gecen hafta","geçen hafta","bu ay","bu yil","bu yıl",
                ])
            )
            # Yalnızca gerçekten somut bir işlem yapabiliyorsa (argüman çıkardıysa veya yeni rapor açıyorsa) Needle yanıtlasın
            if confidence >= 80 and (has_actionable_args or is_new_report) and (
                data_signal or is_new_report
                or needle_res.get("aliasMatched")
                or needle_res.get("runVerb")
            ):
                duration = needle_res.get("telemetry", {}).get("durationMs", 0)
                sys.stderr.write(f"[Needle SLM Action] tool={needle_res.get('tool')} args={list(needle_res.get('arguments', {}).keys())} ({confidence}%) in {duration}ms\n")
                sys.stderr.flush()
                send_json(needle_res)
                return
            else:
                sys.stderr.write(f"[Needle -> Gemma 4 LLM Fallback] Somut işlem üretilemedi (argüman={has_actionable_args}, confidence={confidence}%), Gemma 4 LLM devreye giriyor...\n")
                sys.stderr.flush()
        except Exception as err:
            import traceback
            sys.stderr.write(f"[Needle Exception] Error: {err}\n{traceback.format_exc()}\n")
            sys.stderr.flush()

    # 3. Parametrik LLM / Pydantic AI Sağlayıcı Çağrısı (Gemma 4, Microsoft Foundry, Google Gemini vb.)
    if not conversation_history:
        conversation_history = [{
            "role": "system",
            "content": get_system_prompt(context)
        }]
    else:
        conversation_history[0] = {
            "role": "system",
            "content": get_system_prompt(context)
        }
        
    conversation_history.append({
        "role": "user",
        "content": prompt_text
    })
    
    tools = PydanticAiToolAdapter.to_function_tools(registered_tools)

    def _forward_delta(kind, text):
        # LLM üretirken düşünme/metin parçalarını canlı akıt (UI anında görsün)
        send_json({"type": "llm_delta", "delta_kind": kind, "text": text})

    def _forward_internal_tool(tool_name, args):
        # Sidecar-içinde yürütülen yetenekler (örn. web_fetch) → DevTools telemetrisi + sohbet bildirimi
        send_json({"type": "internal_tool", "tool": tool_name, "arguments": args})

    try:
        message_data, telemetry_info = AiProviderFactory.execute_chat(
            conversation_history, tools, active_ai_config,
            on_delta=_forward_delta,
            on_internal_tool=_forward_internal_tool,
            internal_tools=internal_skill_tools()
        )
        telemetry_info["systemPrompt"] = conversation_history[0]["content"] if conversation_history else ""
        
        conversation_history.append(message_data)
        conversation_history = [conversation_history[0], *conversation_history[1:][-20:]]
        
        tool_calls = message_data.get("tool_calls", [])
        text_content = (message_data.get("content") or "").strip()
        thinking_content = (message_data.get("thinking") or "").strip()
        awaiting_llm_tool_result = bool(tool_calls)
        
        if tool_calls:
            for tc in tool_calls:
                func_obj = tc.get("function", {})
                tool_name = func_obj.get("name")
                raw_args = func_obj.get("arguments", {})
                
                sanitized_args, rejected, guard_notes = PydanticAiToolAdapter.validate_tool_call(
                    tool_name, raw_args, registered_tools
                )
                
                msg_parts = [text_content or "", "\n\n".join(guard_notes)]
                combined_msg = "\n\n".join(filter(None, [p.strip() for p in msg_parts]))

                send_json({
                    "type": "tool_call",
                    "tool": tool_name,
                    "arguments": sanitized_args,
                    "message": combined_msg.strip(),
                    "thinking": thinking_content,
                    "telemetry": telemetry_info
                })
        
        if text_content and not tool_calls:
            send_json({
                "type": "message",
                "content": text_content,
                "thinking": thinking_content,
                "telemetry": telemetry_info
            })
        elif not tool_calls:
            if thinking_content:
                # Model üretim bütçesinin tamamını düşünmeye harcadıysa (content boş kaldı),
                # düşünce zincirini nihai yanıt olarak sun; "Komutunuz işlendi." düşmesin.
                send_json({
                    "type": "message",
                    "content": thinking_content,
                    "telemetry": telemetry_info
                })
            else:
                send_json({
                    "type": "message",
                    "content": "Komutunuz işlendi.",
                    "telemetry": telemetry_info
                })
            
    except Exception as e:
        import traceback as _tb
        sys.stderr.write("[Task Error]\n" + _tb.format_exc() + "\n")
        greetings = INTENTS.get("greeting", [])
        prompt_folded = fold_tr(prompt_lower)
        is_greeting = any(prompt_folded == g or prompt_folded.startswith(g + " ") or (len(prompt_folded) <= 12 and fuzzy_similarity(prompt_folded, g) >= 0.72) for g in greetings)
        
        if is_greeting and not any(w in prompt_lower for w in ["rapor", "filtre", "süz", "özet", "grafik", "analiz", "stok", "satış", "bakiye"]):
            ws_id = (context.get("active_workspace") or "") if context else ""
            ws_map = {
                "selling": ("Subcontracting (Fason & Dış Kaynak)", "Fason siparişleri (Inward/Outward), teslimatlar, irsaliyeler veya sözleşmeler hakkında rapor hazırlamak ya da veri incelemek isterseniz lütfen bana bildirin."),
                "subcontracting": ("Subcontracting (Fason & Dış Kaynak)", "Fason siparişleri (Inward/Outward), teslimatlar, irsaliyeler veya sözleşmeler hakkında rapor hazırlamak ya da veri incelemek isterseniz lütfen bana bildirin."),
                "stock": ("Stok (Stock)", "Stok Bakiyesi ve Stok Analitik Raporu üzerinde filtrelemeler yapabilir, ambar veya envanter hareketlerinizi inceleyebilirsiniz."),
                "accounting": ("Finans & Muhasebe (Accounting)", "Finansal tablolar, defterler, mizan, alacak/borç ve bakiye analizleri hakkında yardımcı olmaktan memnuniyet duyarım."),
                "financial-reports": ("Finans & Muhasebe (Accounting)", "Finansal tablolar, defterler, mizan, alacak/borç ve bakiye analizleri hakkında yardımcı olmaktan memnuniyet duyarım."),
                "manufacturing": ("Üretim (Manufacturing)", "İş emirleri, operasyonlar, ürün reçeteleri ve üretim hatları hakkında yardımcı olabilirim."),
                "landed_cost": ("Maliyet Dağıtımı (Landed Cost)", "İthalat masrafları ve maliyet yükleme fişleri hakkında raporlar hazırlayabilirim."),
                "settings": ("Kullanıcı Ayarları", "AI model tercihlerinizi, API anahtarlarınızı veya profil ayarlarınızı yapılandırabilirsiniz.")
            }
            if ws_id in ws_map:
                name, desc = ws_map[ws_id]
                msg = f"Merhaba! Size nasıl yardımcı olabilirim?\n\nŞu an **{name}** çalışma alanındasınız. {desc} Size yardımcı olmaktan memnuniyet duyarım."
            else:
                msg = "Merhaba! Size nasıl yardımcı olabilirim? ERP raporlarınızı hazırlayabilir, verileri filtreleyebilir ya da grafik ve özet analizler oluşturabilirim."
            
            send_json({
                "type": "message",
                "content": msg,
                "telemetry": {
                    "model": "Yula Context Engine",
                    "engine": "Context Responder",
                    "totalTokens": 0,
                    "durationMs": 0.2
                }
            })
            return

        provider_raw = (active_ai_config.get("provider") or "ollama").lower()
        provider = provider_raw.upper()
        model = active_ai_config.get("model", "")
        err_msg = str(e)
        err_kind = getattr(e, "kind", None)  # ProviderError: connection | timeout | forbidden | provider

        if err_kind == "forbidden":
            user_msg = f"⚠️ **AI Sağlayıcı Erişim Reddi ({provider} - {model}):**\nSunucuya erişim reddedildi (`HTTP 403 Forbidden`). Lütfen bulut portalınızdan ağ ve IP erişim izinlerinizi kontrol edin."
        elif provider_raw == "ollama" and err_kind in ("connection", "timeout"):
            # Gerçekten yerel servis erişilemedi (istisna tipinden sınıflandırıldı,
            # metin aramasıyla değil) → yerel kontrol listesi göster.
            endpoint = active_ai_config.get("endpoint", "")
            user_msg = (
                f"⚠️ **Yerel Model Bağlantı Hatası ({provider} - {model}):**\n\n"
                f"`{endpoint}` adresindeki model servisine {'erişilemedi' if err_kind == 'connection' else 'gönderilen istek zaman aşımına uğradı'}.\n\n"
                f"**Kontrol Listesi:**\n"
                f"1. Yerel model sunucusunun (Ollama vb.) açık olduğunu kontrol edin.\n"
                f"2. `{model}` modelinin yüklü olduğunu doğrulayın.\n"
                f"3. Dilerseniz Ayarlar sayfasından bulut AI sağlayıcılarına (OpenAI, Gemini, Azure) geçiş yapabilirsiniz.\n\n"
                f"_Teknik detay: {err_msg}_"
            )
        else:
            user_msg = f"⚠️ **AI Sağlayıcı Hatası ({provider}):** {err_msg}\nLütfen Ayarlar sayfasından model, API key veya endpoint tercihlerinizi kontrol edin."

        send_json({
            "type": "message",
            "content": user_msg,
            "telemetry": {
                "model": model or "Parametric LLM",
                "engine": f"Pydantic AI ({provider})",
                "totalTokens": 0,
                "durationMs": 0.5,
                "error": err_msg
            }
        })

def handle_tool_result(tool_name, result_data):
    global conversation_history, awaiting_llm_tool_result
    if not tool_name or not awaiting_llm_tool_result:
        return

    awaiting_llm_tool_result = False

    # Frontend, aracın deterministik kullanıcı mesajını zaten sohbete düşürdü.
    # Sonuçta kullanıcıya yönelik bir mesaj varsa ~2 sn'lik ikinci LLM turunu hiç açma.
    result_message = ""
    if isinstance(result_data, dict):
        result_message = str(result_data.get("message") or "").strip()
    elif isinstance(result_data, str):
        result_message = result_data.strip()

    if result_message:
        # Bağlam korunur: kompakt TOOL_RESULT kaydı (converter ToolReturnPart'a çevirir)
        compact = json.dumps({"tool": tool_name, "summary": result_message[:300]}, ensure_ascii=False)
        conversation_history.append({
            "role": "user",
            "content": f"TOOL_RESULT ({tool_name}): {compact}\nSonuç kullanıcıya gösterildi."
        })
        conversation_history = [conversation_history[0], *conversation_history[1:][-20:]]
        send_json({
            "type": "status",
            "status": "tool_result_ack",
            "message": f"{tool_name} sonucu işlendi (LLM özeti atlandı)."
        })
        return

    # Mesaj içermeyen sonuçlarda eski davranış: Gemma'dan kısa Türkçe özet iste
    conversation_history.append({
        "role": "user",
        "content": (
            f"TOOL_RESULT ({tool_name}): {json.dumps(result_data or {}, ensure_ascii=False)}\n"
            "Araç sonucu uygulandı. Kullanıcıya kısa ve Türkçe bir sonuç özeti ver; yeni araç çağrısı yapma."
        ),
    })
    conversation_history = [conversation_history[0], *conversation_history[1:][-20:]]

    try:
        message_data, telemetry_info = AiProviderFactory.execute_chat(
            conversation_history, [], active_ai_config,
            on_delta=lambda kind, text: send_json({"type": "llm_delta", "delta_kind": kind, "text": text})
        )
        conversation_history.append(message_data)
        content = (message_data.get("content") or "").strip()
        if content:
            send_json({
                "type": "message",
                "content": content,
                "thinking": (message_data.get("thinking") or "").strip(),
                "telemetry": telemetry_info,
            })
    except Exception as err:
        sys.stderr.write(f"[Tool Result Follow-up Error] {err}\n")
        sys.stderr.flush()

def main():
    global registered_tools, active_ai_config, active_request_id, conversation_history, awaiting_llm_tool_result
    send_json({
        "type": "status",
        "status": "ready",
        "message": f"Yula AI Sidecar (Needle 2 SLM & Multi-Provider Pydantic AI Engine) aktif ve dinliyor."
    })

    try:
        refresh_skills()
        emit_skills_list()
    except Exception as e:
        sys.stderr.write(f"[Skill Registry] keşif hatası: {e}\n")

    while True:
        line = sys.stdin.readline()
        if not line:
            break
        line = line.strip()
        if not line:
            continue
            
        try:
            payload = json.loads(line)
            action = payload.get("action")
            prompt = payload.get("prompt", "")
            context = payload.get("context")
            
            if action == "configure_ai":
                new_cfg = payload.get("config", {})
                active_ai_config.update(new_cfg)
                send_json({
                    "type": "status",
                    "status": "ai_configured",
                    "message": f"AI Yapılandırması Güncellendi: {active_ai_config.get('provider')} / {active_ai_config.get('model')}"
                })

            elif action == "register_tools":
                registered_tools = [t for t in payload.get("tools", []) if isinstance(t, dict) and t.get("name")]
                tool_names = [t.get("name") for t in registered_tools]
                send_json({
                    "type": "status",
                    "status": "tools_registered",
                    "message": f"{len(registered_tools)} adet araç başarıyla bağlandı: {', '.join(tool_names)}"
                })
                
            elif action == "tool_result":
                active_request_id = payload.get("requestId")
                try:
                    tool_name = payload.get("tool")
                    result_data = payload.get("result")
                    if not payload.get("skip_followup"):
                        handle_tool_result(tool_name, result_data)
                    # skip_followup: frontend deterministik yanıtı zaten gösterdi
                    # (örn. skill export) → ikinci LLM özet turu gereksiz.
                finally:
                    # Tüm yanıt zinciri bitti: UI işleme durumunu kapatabilir
                    send_json({"type": "status", "status": "agent_settled"})
                    active_request_id = None

            elif action == "task" or prompt:
                active_request_id = payload.get("requestId")
                try:
                    if payload.get("tools"):
                        registered_tools = payload.get("tools", [])
                    handle_user_task(prompt, context)
                finally:
                    # Tüm yanıt zinciri bitti (mesaj + araç çağrıları): UI işleme durumunu kapatabilir
                    send_json({"type": "status", "status": "agent_settled"})
                    active_request_id = None
                
            elif action == "list_skills":
                refresh_skills()
                emit_skills_list()

            elif action == "bridge_call":
                # Frontend köprüsü: session verisiyle çalışan skill fonksiyonunu yürüt
                active_request_id = payload.get("requestId")
                tool_name = payload.get("tool") or ""
                rows = payload.get("rows")
                args = payload.get("args") or {}
                fn = skill_registry.find_function(loaded_skills, tool_name)
                if fn is None:
                    send_json({"type": "bridge_result", "ok": False, "error": f"Skill fonksiyonu bulunamadı: {tool_name}"})
                elif not fn.needs_session_data and rows is None:
                    # Internal skill'ler agent içinde çalışır; buraya düşmemeli ama güvenli davran
                    outcome = skill_registry.safe_run(fn, None, args)
                    send_json({"type": "bridge_result", "tool": tool_name, **outcome})
                else:
                    outcome = skill_registry.safe_run(fn, rows, args)
                    send_json({"type": "bridge_result", "tool": tool_name, **outcome})
                active_request_id = None

            elif action == "reset":
                awaiting_llm_tool_result = False
                conversation_history = [{
                    "role": "system",
                    "content": get_system_prompt()
                }]
                send_json({
                    "type": "status",
                    "status": "conversation_reset",
                    "message": "Konuşma geçmişi sıfırlandı."
                })
                
            elif action == "ping":
                send_json({"type": "pong", "timestamp": datetime.now().isoformat()})
                
            else:
                send_json({
                    "type": "error",
                    "message": f"Bilinmeyen eylem: {action}"
                })
                
        except json.JSONDecodeError as e:
            send_json({
                "type": "error",
                "message": f"Geçersiz JSON formatı: {str(e)}"
            })
        except Exception as e:
            import traceback as _tb2
            sys.stderr.write("[Dispatch Error]\n" + _tb2.format_exc() + "\n")
            send_json({
                "type": "error",
                "message": f"İşlem hatası: {str(e)}"
            })

if __name__ == "__main__":
    main()
