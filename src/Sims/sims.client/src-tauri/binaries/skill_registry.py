"""Yula Skill Registry — skills/<ad>/SKILL.md + *.py konvansiyonunun yükleyicisi.

Sözleşme:
- Her skill bir klasördür: en az biri `TOOL` dict'i + `run()` fonksiyonu içeren .py dosya(lar)ı.
- SKILL.md varsa frontmatter'daki `name`/`description` TOOL metadata'sını ezer (tarife gövdesi
  LLM'e talep üzerine enjekte edilmek üzere saklanır).
- TOOL["needs_session_data"]=True ise skill BRIDGED'dir: verisini frontend'ten alır
  (`bridge_call` aksiyonu), asla LLM tarafından doğrudan çağrılmaz.
- Değilse INTERNAL'dir: pydantic-ai Tool olarak agent toolset'ine girer, grafik içinde çalışır.
"""

from __future__ import annotations

import importlib.util
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    import yaml
except ImportError:  # PyYAML pydantic-ai ile gelir; yoksa frontmatter atlanır
    yaml = None


MAX_BRIDGE_ROWS = 100_000


# ---------------------------------------------------------------------------
# Dekoratör API — UI/meta bilgisini fonksiyonun üzerine mühürler.
#
#     @skill(name=..., description=..., needs_session=True,
#            buttons=[Button("Excel'e Aktar", icon="download", ...)])
#     def run(rows=None, **_): ...
#
# Frontmatter'daki ui.header_buttons'a göre ÖNCELİKLİDİR; birden fazla aksiyon
# için her fonksiyona kendi @skill'i verilir.
# ---------------------------------------------------------------------------

def Button(label: str, *, icon: str = "play", id: Optional[str] = None,
           args: Optional[Dict[str, Any]] = None,
           scope: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Bildirimsel header-buton tanımı (kapalı ikon seti frontend'de doğrulanır)."""
    return {"id": id, "label": label, "icon": icon, "args": args or {}, "scope": scope}


def skill(name: str, *, description: str = "", needs_session: bool = False,
          params: Optional[Dict[str, Any]] = None,
          buttons: Optional[List[Dict[str, Any]]] = None):
    def deco(fn):
        sealed = []
        for i, b in enumerate(buttons or []):
            sealed.append({
                **b,
                "id": b.get("id") or f"{name}-{i}",
                "call": b.get("call") or name,
            })
        fn.__yula_meta__ = {
            "name": name,
            "description": description,
            "needs_session": needs_session,
            "parameters": params or {"type": "object", "properties": {}},
            "buttons": sealed,
        }
        return fn
    return deco


@dataclass
class SkillFunction:
    """Bir .py dosyasındaki skill fonksiyonu (decorator veya TOOL/run sözleşmesi)."""

    name: str
    description: str
    parameters: Dict[str, Any]
    needs_session_data: bool
    run_callable: Any
    skill_dir: Path
    buttons: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class Skill:
    """skills/<klasör>/ — birden fazla fonksiyon içerebilir."""

    folder_name: str
    dir_path: Path
    recipe_md: Optional[str] = None  # SKILL.md gövdesi (frontmatter hariç tarife)
    functions: List[SkillFunction] = field(default_factory=list)
    # Frontmatter'daki bildirimsel UI bağları (örn. ui.header_buttons)
    ui: Dict[str, Any] = field(default_factory=dict)

    @property
    def internal_functions(self) -> List[SkillFunction]:
        return [f for f in self.functions if not f.needs_session_data]

    @property
    def bridged_functions(self) -> List[SkillFunction]:
        return [f for f in self.functions if f.needs_session_data]


def _parse_frontmatter(md_text: str) -> tuple[Dict[str, Any], str]:
    """---fensli YAML frontmatter'ı ayrıştırır; (meta, gövde) döner."""
    if yaml is None or not md_text.startswith("---"):
        return {}, md_text
    parts = md_text.split("---", 2)
    if len(parts) < 3:
        return {}, md_text
    try:
        meta = yaml.safe_load(parts[1]) or {}
    except Exception:
        meta = {}
    return (meta if isinstance(meta, dict) else {}), parts[2].strip()


def _load_skill_module(py_path: Path, skill_dir: Path) -> List[SkillFunction]:
    """Modülü yükler; öncelik @skill dekoratörlü fonksiyonlar, yoksa TOOL/run çifti."""
    mod_name = f"yula_skill_{skill_dir.name}_{py_path.stem}"
    try:
        spec = importlib.util.spec_from_file_location(mod_name, py_path)
        if spec is None or spec.loader is None:
            return []
        module = importlib.util.module_from_spec(spec)
        sys.modules[mod_name] = module
        spec.loader.exec_module(module)
    except Exception as e:  # bozuk skill tüm sidecar'ı düşürmesin
        print(f"[skill_registry] {py_path} yüklenemedi: {e}", file=sys.stderr)
        return []

    out: List[SkillFunction] = []

    # 1) @skill dekoratörlü fonksiyonlar (öncelikli, çoklu aksiyon destekli)
    for attr in vars(module).values():
        meta = getattr(attr, "__yula_meta__", None)
        if isinstance(meta, dict) and callable(attr):
            out.append(SkillFunction(
                name=str(meta["name"]),
                description=str(meta.get("description") or ""),
                parameters=meta.get("parameters") or {"type": "object", "properties": {}},
                needs_session_data=bool(meta.get("needs_session")),
                run_callable=attr,
                skill_dir=skill_dir,
                buttons=list(meta.get("buttons") or []),
            ))
    if out:
        return out

    # 2) Eski TOOL + run() sözleşmesi (geriye dönük uyumluluk)
    tool = getattr(module, "TOOL", None)
    run_fn = getattr(module, "run", None)
    if isinstance(tool, dict) and callable(run_fn) and tool.get("name"):
        out.append(SkillFunction(
            name=str(tool["name"]),
            description=str(tool.get("description") or ""),
            parameters=tool.get("parameters") or {"type": "object", "properties": {}},
            needs_session_data=bool(tool.get("needs_session_data")),
            run_callable=run_fn,
            skill_dir=skill_dir,
        ))
    return out


def discover_skill_dirs(base_dirs: List[Path]) -> List[Skill]:
    """Verilen köklerdeki `*/SKILL.md` + `*.py` klasörlerini tarar."""
    skills: Dict[str, Skill] = {}

    for base in base_dirs:
        if not base.is_dir():
            continue
        for skill_dir in sorted(base.iterdir()):
            if not skill_dir.is_dir() or skill_dir.name.startswith(("_", ".")):
                continue
            skill = skills.setdefault(skill_dir.name, Skill(folder_name=skill_dir.name, dir_path=skill_dir))

            md_path = skill_dir / "SKILL.md"
            if md_path.exists() and skill.recipe_md is None:
                try:
                    meta, body = _parse_frontmatter(md_path.read_text(encoding="utf-8"))
                    skill.recipe_md = body or None
                    if meta.get("description"):
                        skill.description_override = str(meta["description"])
                    if isinstance(meta.get("ui"), dict):
                        skill.ui = meta["ui"]
                except Exception:
                    pass

            for py_path in sorted(skill_dir.glob("*.py")):
                for fn in _load_skill_module(py_path, skill_dir):
                    override = getattr(skill, "description_override", None)
                    if override and (fn.description == ""):
                        fn.description = f"{override} ({fn.name})"
                    if not any(f.name == fn.name for f in skill.functions):
                        skill.functions.append(fn)
    return list(skills.values())


def find_function(skills: List[Skill], tool_name: str) -> Optional[SkillFunction]:
    for s in skills:
        for f in s.functions:
            if f.name == tool_name:
                return f
    return None


def safe_run(fn: SkillFunction, rows: Optional[List[Dict[str, Any]]], args: Dict[str, Any]) -> Dict[str, Any]:
    """Bridge çağrısı için güvenli yürütme: satır limiti + istisna yakalama."""
    if rows is not None and len(rows) > MAX_BRIDGE_ROWS:
        return {"ok": False, "error": f"Satır sayısı limiti aşıldı ({len(rows)} > {MAX_BRIDGE_ROWS})."}
    try:
        result = fn.run_callable(rows=rows, **(args or {}))
        return {"ok": True, "result": result}
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}
