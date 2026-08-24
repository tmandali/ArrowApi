"""Aktif rapor satırlarını XLSX/CSV dosyasına aktarır (bridged skill).

Sözleşme: run(rows=..., **args) imzası zorunludur; veri frontend executor'ından gelir.
Dönüş: {file_path, file_name, rows_written} — [[file:...]] chip'i bununla çizilir.
"""

import csv
import datetime
import pathlib
import tempfile

from skill_registry import skill

MAX_ROWS = 100_000


def _export_dir() -> pathlib.Path:
    base = pathlib.Path.home() / "Downloads" / "yula-exports"
    try:
        base.mkdir(parents=True, exist_ok=True)
        return base
    except Exception:
        fallback = pathlib.Path(tempfile.gettempdir()) / "yula-exports"
        fallback.mkdir(parents=True, exist_ok=True)
        return fallback


@skill(
    name="report_export_xlsx",
    description=(
        "Aktif raporun satırlarını XLSX veya CSV dosyasına aktarır ve indirme "
        "yolunu döndürür. Kullanıcı 'excel'e aktar', 'dışa aktar', 'indir' dediğinde kullan."
    ),
    needs_session=True,
    button="Excel'e Aktar",
    icon="download",
    scope={"screens": ["report-grid-*"]},
)
def run(rows=None, format: str = "xlsx", file_name=None, **_):
    rows = [dict(r) for r in (rows or [])]
    if not rows:
        return {"error": "Aktarıacak satır bulunamadı."}
    if len(rows) > MAX_ROWS:
        rows = rows[:MAX_ROWS]
        truncated = True
    else:
        truncated = False

    columns = list(rows[0].keys())
    out_dir = _export_dir()
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    stem = (file_name or f"rapor-{stamp}").strip()
    fmt = "csv" if str(format).lower() == "csv" else "xlsx"

    if fmt == "csv":
        path = out_dir / f"{stem}.csv"
        with open(path, "w", newline="", encoding="utf-8-sig") as fh:
            writer = csv.DictWriter(fh, fieldnames=columns, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)
    else:
        from openpyxl import Workbook

        path = out_dir / f"{stem}.xlsx"
        wb = Workbook(write_only=True)
        ws = wb.create_sheet("Rapor")
        ws.append(columns)
        for r in rows:
            ws.append([r.get(c) for c in columns])
        wb.save(path)

    result = {
        "file_path": str(path),
        "file_name": path.name,
        "rows_written": len(rows),
        "format": fmt,
    }
    if truncated:
        result["warning"] = f"İlk {MAX_ROWS:,} satır aktarıldı."
    return result
