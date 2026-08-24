"""Yula Skill SDK — skill .py dosyaları içinde tek satırla kullanılır:

    import yula

    @yula.skill(name="...", description="...", needs_session=True,
                button="Etiket", icon="download", scope={"screens": [...]})
    def run(rows=None, **_):
        out = yula.exports_dir() / "cikti.xlsx"
        yula.log("dışa aktarma başladı")
        ...

Meta/dekoratör `skill_registry`'de yaşar; bu modül onu yeniden dışa açar ve
skill'lerin tekrar tekrar kopyalayacağı yardımcıları sunar.
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
