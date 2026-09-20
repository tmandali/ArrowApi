import { marked } from "marked";
import {
  KNOWN_SYSTEM_ACTIONS,
} from "@/lib/yula-actions";
import { findReport, REGISTERED_REPORTS } from "@/features/reports/report-registry";

/** Bozuk eksik-scope `yula-criteria:` URL'leri için varsayılan: ilk tescilli rapor (tek kaynak registry).
 * Modül yüklenirken DEĞİL, çağrı anında okunur — report-registry ile
 * döngüsel import'ta TDZ yememek için (erişim render anında, init sonrası). */
export function defaultReportScope(): string {
  return REGISTERED_REPORTS[0]?.scope ?? "";
}

export const FILE_TOKEN_RE = /\[\[file:(.+?)\|(.+?)\]\]/g;
export const QUOTE_RE = /(["“])([^"“”\n]{4,120}?)(["”])/g;

export function buildEntityRegex(): RegExp {
  const sorted = [...KNOWN_SYSTEM_ACTIONS].sort(
    (a, b) => b.pattern.source.length - a.pattern.source.length,
  );
  return new RegExp(`(${sorted.map((a) => a.pattern.source).join("|")})`, "gi");
}

/** Bir metni düz text + link node parçalarına böler (mdast yapıları). */
export function extractInteractiveNodes(value: string): Array<Record<string, unknown>> {
  const matches: Array<{ start: number; end: number; node: Record<string, unknown> }> = [];

  // 1) [[file:yol|etiket]] tokenları
  for (const m of value.matchAll(FILE_TOKEN_RE)) {
    const url = `yula-file:${encodeURIComponent(m[1])}?label=${encodeURIComponent(m[2])}`;
    matches.push({
      start: m.index!,
      end: m.index! + m[0].length,
      node: {
        type: "link",
        url,
        children: [{ type: "text", value: m[2] }],
      },
    });
  }

  // 2) Tırnaklı bilinen rapor/ekran adları
  for (const qm of value.matchAll(QUOTE_RE)) {
    const inner = qm[2].trim();
    const known = KNOWN_SYSTEM_ACTIONS.find((a) => a.pattern.test(inner));
    if (!known) continue;
    const url = `yula-report:${encodeURIComponent(known.prompt)}|${encodeURIComponent(known.label)}`;
    matches.push({
      start: qm.index!,
      end: qm.index! + qm[0].length,
      node: {
        type: "link",
        url,
        children: [{ type: "text", value: qm[0] }],
      },
    });
  }

  // 3) Bilinen rapor/ekran adları
  const entityRe = buildEntityRegex();
  for (const em of value.matchAll(entityRe)) {
    const matched = em[0];
    const action = KNOWN_SYSTEM_ACTIONS.find((a) => a.pattern.test(matched));
    if (!action) continue;
    const start = em.index!;
    // Tırnak/file aralıklarıyla çakışıyorsa atla (onlar önceliklidir)
    if (matches.some((m) => start < m.end && m.start < start + matched.length)) {
      continue;
    }
    matches.push({
      start,
      end: start + matched.length,
      node: {
        type: "link",
        url: `yula-report:${encodeURIComponent(action.prompt)}|${encodeURIComponent(action.label)}`,
        children: [{ type: "text", value: matched }],
      },
    });
  }

  if (matches.length === 0) return [{ type: "text", value }];

  matches.sort((a, b) => a.start - b.start);
  const out: Array<Record<string, unknown>> = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start < cursor) continue;
    if (m.start > cursor) {
      out.push({ type: "text", value: value.slice(cursor, m.start) });
    }
    out.push(m.node);
    cursor = m.end;
  }
  if (cursor < value.length) {
    out.push({ type: "text", value: value.slice(cursor) });
  }
  return out;
}

/** mdast ağacındaki tüm text node'ları entity linklerine dönüştürür. */
export function transformEntityNodes(node: Record<string, unknown>): void {
  const children = node.children as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(children)) return;
  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i];
    if (child.type === "text" && typeof child.value === "string") {
      const parts = extractInteractiveNodes(child.value);
      const isPlain =
        parts.length === 1 && (parts[0] as { type?: string }).type === "text";
      if (!isPlain) children.splice(i, 1, ...parts);
      continue;
    }
    transformEntityNodes(child);
  }
}

export function remarkYulaEntities() {
  return (tree: Record<string, unknown>) => {
    transformEntityNodes(tree);
  };
}

/**
 * Kayıtlı rapor aksiyonu → rapor ekranı yolu (katalog listesinde tıklama
 * "X hazırla" mesajı göndermek yerine ekranı açar). Scope kayıtsızsa null.
 */
export function reportPageForAction(action: { scope?: string } | undefined): string | null {
  if (!action?.scope) return null;
  return findReport(action.scope)?.pagePath ?? null;
}

export interface MarkdownBlockNode {
  type: string;
  raw: string;
}

export function parseMarkdownBlocks(text: string): MarkdownBlockNode[] {
  const lexer = marked.lexer(text);
  return lexer.map((b) => ({ type: b.type, raw: b.raw }));
}
