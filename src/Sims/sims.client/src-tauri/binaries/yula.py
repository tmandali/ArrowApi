"""Yula Skill SDK — skill .py dosyaları içinde tek satırla kullanılır:

    import yula
    from pydantic import BaseModel, Field

    class IndirimSemasi(BaseModel):
        fiyat: float = Field(..., gt=0, description="Orijinal fiyat")
        indirim_orani: int = Field(..., ge=0, le=100, description="İndirim yüzdesi")

    @yula.skill(name="indirim_uygula", sema=IndirimSemasi,
                needs_session=True, button="İndirim Uygula")
    def run(fiyat: float, indirim_orani: int, **_):
        out = yula.exports_dir() / "cikti.xlsx"
        ...

sema verilirse: LLM şeması model_json_schema()'dan üretilir (Field açıklamaları +
gt/ge/le kısıtları dahil), argümanlar yürütme öncesi model_validate ile doğrulanır.
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

from skill_registry import (
    MAX_BRIDGE_ROWS,
    find_function,
    skill,
)

__all__ = ["skill", "MAX_ROWS", "log", "exports_dir"]

# Geriye dönük kısayol adları
MAX_ROWS = MAX_BRIDGE_ROWS


def log(message: str) -> None:
    """Sidecar stderr'ine skill günlüğü basar (kullanıcıyı rahatsız etmez)."""
    print(f"[yula-skill] {message}", file=sys.stderr, flush=True)


def exports_dir(subdir: str | None = None) -> Path:
    """Skill çıktıları için standart klasör: ~/Downloads/yula-exports[/<subdir>].

    Yazılamazsa (kısıtlı makine vb.) geçici dizine düşer. Dizin yoksa oluşturulur.
    """
    base = Path.home() / "Downloads" / "yula-exports"
    target = base / subdir if subdir else base
    try:
        target.mkdir(parents=True, exist_ok=True)
        return target
    except Exception:
        fallback = Path(tempfile.gettempdir()) / "yula-exports"
        if subdir:
            fallback = fallback / subdir
        fallback.mkdir(parents=True, exist_ok=True)
        return fallback
