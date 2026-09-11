"use client";

import * as React from "react";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { marked } from "marked";
import { useTranslations } from "next-intl";
import { Check, Copy, FileSpreadsheet, ChevronDown, Table, Sparkles } from "lucide-react";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { CodeBlock } from "@/components/ui/code-block";
import { cn } from "@/utils/cn";
import { copyToClipboard } from "@/lib/clipboard";
import { useYulaGridStore } from "@/lib/stores/grid";
import {
  KNOWN_SYSTEM_ACTIONS,
  isPromptSentenceLike,
  isRunConfirmPhrase,
  type KnownSystemAction,
} from "@/lib/yula-actions";

export type { KnownSystemAction };
import { parseColonTitleLine, extractFindingFilterPrompt } from "@/lib/finding-actions";
import { buildFindingDrillPrompt } from "@/lib/yula-finding-drill";
import { findReport } from "@/features/reports/report-registry";

/**
 * Sohbet markdown çekirdeği — react-markdown + remark-gfm + blok memoization.
 *
 * Katmanlar:
 *   1. parseMarkdownBlocks: marked.lexer ile top-level bloklar
 *   2. Blok sınıflandırıcı: onay satırları (3a) ve bulgu maddeleri (3b)
 *      mevcut etkileşimli JSX ile; geri kalan her blok MarkdownBlock'a gider
 *   3. remarkYulaEntities: tüm text node'larda rapor adları → tıklanabilir
 *      link, tırnaklı öneriler → prompt linki, [[file:..|..]] → dosya çipi
 *   4. components override'ları: grid-dili temalı tablo/başlık/liste/kod
 */

/* ---------------------------------- plugin --------------------------------- */

const FILE_TOKEN_RE = /\[\[file:(.+?)\|(.+?)\]\]/g;
const QUOTE_RE = /(["“])([^"“”\n]{4,120}?)(["”])/g;

/** Saft render yardımcılarına `useTranslations("ChatMarkdown")` taşınır. */
type ChatMarkdownT = ReturnType<typeof useTranslations>;

function buildEntityRegex(): RegExp {
  const sorted = [...KNOWN_SYSTEM_ACTIONS].sort(
    (a, b) => b.pattern.source.length - a.pattern.source.length,
  );
  return new RegExp(`(${sorted.map((a) => a.pattern.source).join("|")})`, "gi");
}

/** Bir metni düz text + link node parçalarına böler (mdast yapıları). */
function extractInteractiveNodes(value: string): Array<Record<string, unknown>> {
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

  // 2) Tırnaklı komut önerileri
  for (const qm of value.matchAll(QUOTE_RE)) {
    const inner = qm[2].trim();
    const known = KNOWN_SYSTEM_ACTIONS.find((a) => a.pattern.test(inner));
    if (!known && !isPromptSentenceLike(inner)) continue;
    const url = known
      ? `yula-report:${encodeURIComponent(known.prompt)}|${encodeURIComponent(known.label)}`
      : `yula-prompt:${encodeURIComponent(inner)}`;
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
function transformEntityNodes(node: Record<string, unknown>): void {
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

function remarkYulaEntities() {
  return (tree: Record<string, unknown>) => {
    transformEntityNodes(tree);
  };
}

/**
 * Kayıtlı rapor aksiyonu → rapor ekranı yolu (katalog listesinde tıklama
 * "X hazırla" mesajı göndermek yerine ekranı açar). Scope kayıtsızsa null.
 */
function reportPageForAction(action: { scope?: string } | undefined): string | null {
  if (!action?.scope) return null
  return findReport(action.scope)?.pagePath ?? null
}

/* ------------------------------- blok parsing ------------------------------ */

interface MarkdownBlockNode {
  type: string
  raw: string
}

function parseMarkdownBlocks(text: string): MarkdownBlockNode[] {
  const lexer = marked.lexer(text);
  return lexer.map((b) => ({ type: b.type, raw: b.raw }));
}

/* ------------------------------ aksiyon tipi ------------------------------ */

export interface ChatMarkdownCallbacks {
  /** Tırnaklı öneri/bulgu prompt'u gönder */
  onPrompt: (text: string) => void
  /** Onay mesajı bağlamında rapor/eq sayfasına yönlenir; yönlenemezse false */
  onNavigateReport: (reportTitle: string) => boolean
  isExecutionConfirmation: boolean
  /** Bulgu → filtre prompt çıkarımı için açık grid kolonları */
  columns: string[]
  /** Turun analizinin üretildiği kaynak tablo (yoksa aktif view kullanılır) */
  sourceTable?: string | null
  /**
   * Metin-içi "çalıştır" tıklaması önce buraya delege edilir (ekranın Run
   * akışı); true dönerse koştu sayılır, aksi halde metin prompt olarak gider.
   */
  onRunReport?: () => boolean
  /**
   * Kriter yankısı başlıkları (küçük harf): bu başlıklı maddeler bulgu
   * değildir, statik render edilir (tıklama yok).
   */
  staticTitles?: string[]
}

/* ----------------------------- blok renderları ---------------------------- */

/** 3a — onay/çalıştırma satırı: "✓ Stok Bakiye Raporu: ..." */
function renderConfirmationLine(
  trimmed: string,
  lIdx: number,
  cb: ChatMarkdownCallbacks,
  t: ChatMarkdownT,
): React.ReactNode {
  const confirmationMatch = trimmed.match(
    /^([✓📊⚡]\s*)?(\*\*)?([A-Za-zÇĞİÖŞÜçğıöşü0-9\s&/()_-]{3,70}?)(?:\s+Report Started|\s+Raporu Başlatıldı|\s+Raporu Hazırlandı)?(\*\*)?\s*:\s*(.*)$/iu,
  )
  if (
    !confirmationMatch ||
    !(
      confirmationMatch[1] ||
      trimmed.includes("Report Started") ||
      trimmed.includes("Raporu Başlatıldı") ||
      trimmed.includes("Raporu Hazırlandı")
    )
  ) {
    return null
  }
  const iconPrefix = confirmationMatch[1]?.trim() || (cb.isExecutionConfirmation ? "📊" : "")
  const rawTitle = confirmationMatch[3].trim()
  const reportTitle = rawTitle
    .replace(/\s+Report Started$/i, "")
    .replace(/\s+Raporu Başlatıldı$/i, "")
    .replace(/\s+Raporu Hazırlandı$/i, "")
  const messageDesc = confirmationMatch[5]?.trim() || ""

  return (
    <p key={lIdx} className="leading-relaxed text-[12px]">
      {iconPrefix && (
        <span className="mr-1 font-bold text-orange-500 dark:text-orange-400">{iconPrefix}</span>
      )}
      <button
        type="button"
        onClick={() => {
          const navigated = cb.onNavigateReport(reportTitle)
          if (!navigated) cb.onPrompt(`${reportTitle} hazırla`)
        }}
        title={cb.isExecutionConfirmation ? t("open_live_results", { title: reportTitle }) : t("start_process", { title: reportTitle })}
        className="group mr-1 inline-flex cursor-pointer items-center gap-0.5 align-baseline font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 hover:underline"
      >
        <span>{reportTitle}:</span>
        {cb.isExecutionConfirmation && (
          <FileSpreadsheet className="size-3 shrink-0 text-orange-500/80 transition-transform group-hover:translate-x-0.5 dark:text-orange-400/80" />
        )}
      </button>
      {messageDesc && <span className="text-foreground/90">{messageDesc}</span>}
    </p>
  )
}

/** 3b — öneri/bulgu: tıklanan başlık maddeyi prompt olarak yeniden sorar */
function renderBulletedItem(
  line: string,
  lIdx: string,
  cb: ChatMarkdownCallbacks,
  t: ChatMarkdownT,
): React.ReactNode {
  const parsed = parseColonTitleLine(line)
  if (!parsed) return null

  const { title: itemTitle, desc: itemDesc } = parsed
  // Kriter yankısı ("Hareket Tarihi: ...") bulgu değildir — statik satır.
  if (cb.staticTitles?.includes(itemTitle.trim().toLowerCase())) {
    return (
      <div key={lIdx} className="flex items-start gap-2 py-0.5 pl-1 group">
        <span className="mt-1 shrink-0 text-[10px] text-orange-500/70 dark:text-orange-400/70">●</span>
        <div className="flex-1 leading-relaxed text-[12px]">
          <span className="mr-1.5 inline align-baseline text-[12px] font-semibold text-foreground">
            {itemTitle}:
          </span>
          <span className="text-foreground/90 line-clamp-2 break-words">{itemDesc}</span>
        </div>
      </div>
    )
  }
  // "Çalıştır" başlığı doğrudan koşar (ekranın Run akışı); delege yoksa
  // eski bulgu/aksiyon çözümüne düşer.
  const isRunTitle = isRunConfirmPhrase(itemTitle)
  const knownAction = KNOWN_SYSTEM_ACTIONS.find((a) => a.pattern.test(itemTitle))
  // Bulgu tıklaması iki kademeli çözülür: önce yapısal filtre çıkarımı
  // (ucuz, deterministik grid filtresi), çıkarılamazsa başlık + açıklamayı
  // taşıyan tıklama-bağlamı (LLM tespit sorgusunu üretir).
  // View pini: analiz farklı bir tablodan üretildiyse ve kullanıcı o zamandan
  // beri view değiştirdiyse, grid filtresi (aktif view'a işler) atlanır ve
  // drill doğrudan kaynak tabloya pinlenir.
  const findingText = `${itemTitle}: ${itemDesc}`
  const pinnedTable = cb.sourceTable ?? null
  const liveTable = useYulaGridStore.getState().spec?.tableName ?? null
  const sameView =
    !pinnedTable ||
    !liveTable ||
    pinnedTable.toLowerCase() === liveTable.toLowerCase()
  const findingClickPrompt = sameView
    ? (extractFindingFilterPrompt({ text: findingText, columns: cb.columns }) ??
      buildFindingDrillPrompt(findingText))
    : buildFindingDrillPrompt(findingText, pinnedTable)

  // Kayıtlı rapor adı: tıklama prompt göndermek yerine rapor ekranını açar.
  const knownPage = knownAction ? reportPageForAction(knownAction) : null
  const titleClass = cn(
    "mr-1.5 inline border-0 bg-transparent p-0 text-left align-baseline text-[12px] font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 underline decoration-dotted underline-offset-2 hover:decoration-solid cursor-pointer transition-colors",
  )

  return (
    <div key={lIdx} className="flex items-start gap-2 py-0.5 pl-1 group">
      <span className="mt-1 shrink-0 text-[10px] text-orange-500/70 dark:text-orange-400/70 group-hover:text-orange-500 transition-colors">●</span>
      <div className="flex-1 leading-relaxed text-[12px]">
        {knownAction && knownPage && !isRunTitle ? (
          <Link
            href={knownPage}
            title={t("open_report_screen", { title: itemTitle })}
            className={titleClass}
          >
            {itemTitle}:
          </Link>
        ) : (
        <button
          type="button"
          onClick={() => {
            if (isRunTitle && cb.onRunReport?.()) return
            if (knownAction) {
              if (cb.isExecutionConfirmation) {
                const navigated = cb.onNavigateReport(knownAction.label)
                if (navigated) return
              }
              cb.onPrompt(knownAction.prompt)
              return
            }
            cb.onPrompt(findingClickPrompt)
          }}
          title={
            isRunTitle && cb.onRunReport
              ? t("run_report")
              : t("ask_finding", { prompt: findingClickPrompt })
          }
          className={titleClass}
        >
          {itemTitle}:
        </button>
        )}
        <span className="text-foreground/90 line-clamp-2 break-words">{itemDesc}</span>
      </div>
    </div>
  )
}

/** 3c — kolonsuz veya düz öneri maddesi */
function renderPlainBullet(
  line: string,
  lIdx: string,
  cb?: ChatMarkdownCallbacks,
  t?: ChatMarkdownT,
): React.ReactNode {
  if (cb && t) {
    const titled = renderBulletedItem(line, lIdx, cb, t)
    if (titled) return titled
  }
  const cleanBulletText = line.trim().replace(/^([-*•●]|\d+\.)\s+/, "").trim()
  if (!cleanBulletText) return null

  const boldParts = cleanBulletText.split(/(\*\*[^*]+\*\*)/g)
  const hasBold = boldParts.some((bp) => bp.startsWith("**") && bp.endsWith("**"))

  if (hasBold) {
    return (
      <div key={lIdx} className="flex items-start gap-2 py-0.5 pl-1 group">
        <span className="mt-1 shrink-0 text-[10px] text-orange-500/70 dark:text-orange-400/70 group-hover:text-orange-500 transition-colors">●</span>
        <p className="flex-1 leading-relaxed text-[12px] text-foreground/90">
          {boldParts.map((bp, bIdx) => {
            if (bp.startsWith("**") && bp.endsWith("**")) {
              const boldText = bp.slice(2, -2).trim()
              const isRunBold = isRunConfirmPhrase(boldText)
              // Kriter yankısı bold'u da statik kalır (tıklama yok).
              const isStaticBold = Boolean(
                cb?.staticTitles?.includes(boldText.toLowerCase()),
              )
              if (cb?.onPrompt && boldText.length > 1 && !isStaticBold) {
                return (
                  <button
                    key={bIdx}
                    type="button"
                    onClick={() => {
                      if (isRunBold && cb.onRunReport?.()) return
                      cb.onPrompt(boldText)
                    }}
                    title={
                      isRunBold && cb.onRunReport
                        ? t ? t("run_report") : ""
                        : t ? t("run_cmd", { cmd: boldText }) : ""
                    }
                    className="font-semibold text-foreground hover:text-orange-600 dark:hover:text-orange-400 cursor-pointer border-0 bg-transparent p-0 transition-colors inline"
                  >
                    {boldText}
                  </button>
                )
              }
              return (
                <strong key={bIdx} className="font-semibold text-foreground">
                  {boldText}
                </strong>
              )
            }
            return bp
          })}
        </p>
      </div>
    )
  }

  // Bold yoksa: parantez öncesi başlığı tıklanabilir yap (örn: "En çok satılan ürün (ItemName bazlı Qty)")
  const parenMatch = cleanBulletText.match(/^([^()\n]{2,60})\s*(\(.+\))$/)
  if (parenMatch && cb?.onPrompt) {
    const titleText = parenMatch[1].trim()
    const descText = parenMatch[2].trim()
    return (
      <div key={lIdx} className="flex items-start gap-2 py-0.5 pl-1 group">
        <span className="mt-1 shrink-0 text-[10px] text-orange-500/70 dark:text-orange-400/70 group-hover:text-orange-500 transition-colors">●</span>
        <div className="flex-1 leading-relaxed text-[12px]">
          <button
            type="button"
            onClick={() => cb.onPrompt(titleText)}
            title={t ? t("run_cmd", { cmd: titleText }) : ""}
            className="font-semibold text-foreground hover:text-orange-600 dark:hover:text-orange-400 cursor-pointer border-0 bg-transparent p-0 transition-colors inline mr-1"
          >
            {titleText}
          </button>
          <span className="text-foreground/90">{descText}</span>
        </div>
      </div>
    )
  }

  // Standart düz madde: Eğer öneri/aksiyon cümlesiyse tıklanabilir aksiyon düğmesi yap.
  // Run cümlesi önce doğrudan koşmaya çalışır (ekranın Run akışı).
  const isRunBullet = isRunConfirmPhrase(cleanBulletText)
  const isActionLike =
    isPromptSentenceLike(cleanBulletText) ||
    /(?:filtrele|özetle|çıkar|analiz|grafik|hesapla|göster|listele|hazırla|yap|incele|sorgula|çalıştır|calistir|run|execute|başlat)/i.test(cleanBulletText)

  if (isActionLike && cb?.onPrompt) {
    return (
      <div key={lIdx} className="flex items-start gap-2 py-0.5 pl-1 group">
        <span className="mt-1 shrink-0 text-[10px] text-orange-500/70 dark:text-orange-400/70 group-hover:text-orange-500 transition-colors">●</span>
          <button
            type="button"
            onClick={() => {
              if (isRunBullet && cb.onRunReport?.()) return
              cb.onPrompt(cleanBulletText)
            }}
            title={
              isRunBullet && cb.onRunReport
                ? t ? t("run_report") : ""
                : t ? t("run_cmd", { cmd: cleanBulletText }) : ""
            }
            className="flex-1 leading-snug text-[12px] text-left border-0 bg-transparent p-0 text-foreground/90 hover:text-orange-600 dark:hover:text-orange-400 underline decoration-dotted underline-offset-2 hover:decoration-solid cursor-pointer transition-colors line-clamp-2"
          >
          {cleanBulletText}
        </button>
      </div>
    )
  }

  // Düz bilgilendirme maddesi
  return (
    <div key={lIdx} className="flex items-start gap-2 py-0.5 pl-1 group">
      <span className="mt-1 shrink-0 text-[10px] text-orange-500/70 dark:text-orange-400/70">●</span>
      <p className="flex-1 leading-relaxed text-[12px] text-foreground/90">
        {cleanBulletText}
      </p>
    </div>
  )
}

/* ------------------------------ markdown block ----------------------------- */

const markdownComponents: Components = {
  p: ({ children }) => (
    <p className="leading-relaxed text-[12px] text-foreground/90">{children}</p>
  ),
  h1: ({ children }) => <MarkdownHeading>{children}</MarkdownHeading>,
  h2: ({ children }) => <MarkdownHeading>{children}</MarkdownHeading>,
  h3: ({ children }) => <MarkdownHeading>{children}</MarkdownHeading>,
  h4: ({ children }) => <MarkdownHeading>{children}</MarkdownHeading>,
  h5: ({ children }) => <MarkdownHeading>{children}</MarkdownHeading>,
  h6: ({ children }) => <MarkdownHeading>{children}</MarkdownHeading>,
  ul: ({ children }) => <ul className="space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="space-y-0.5">{children}</ol>,
  li: ({ children }) => (
    <div className="flex items-start gap-2 py-0.5 pl-1">
      <span className="mt-1 shrink-0 text-[10px] text-orange-500/70 dark:text-orange-400/70">●</span>
      <div className="flex-1 leading-relaxed text-[12px]">{children}</div>
    </div>
  ),
  table: ({ children }) => (
    <div className="my-1 w-full overflow-x-auto">
      <table className="w-full border-collapse text-[11px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  th: ({ children }) => (
    <th className="h-7 border-b border-border/60 bg-muted/40 px-2 text-left text-[11px] font-medium leading-none text-muted-foreground">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border/40 px-2 py-1 align-top text-foreground/90">{children}</td>
  ),
  tr: ({ children }) => <tr>{children}</tr>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border/60 pl-3 text-[11px] text-muted-foreground">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-2 border-border/60" />,
  a: ({ href, children }) => <ChatMarkdownLink href={href}>{children}</ChatMarkdownLink>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  pre: ({ children }) => <MarkdownPreBlock>{children}</MarkdownPreBlock>,
  code: ({ children, className }) => {
    const isBlock = /language-/.test(className ?? "")
    if (isBlock) return <code className="font-mono">{children}</code>
    return (
      <code className="rounded border border-border/60 bg-muted/40 px-1 py-0.5 font-mono text-[11px]">
        {children}
      </code>
    )
  },
}

function extractCodeDetails(children: React.ReactNode): { text: string; language?: string } {
  let text = ""
  let language: string | undefined

  const extract = (node: React.ReactNode) => {
    if (typeof node === "string") {
      text += node
      return
    }
    if (typeof node === "number") {
      text += String(node)
      return
    }
    if (Array.isArray(node)) {
      node.forEach(extract)
      return
    }
    if (React.isValidElement(node) && node.props) {
      const props = node.props as { className?: string; children?: React.ReactNode }
      if (props.className) {
        const langMatch = props.className.match(/language-([a-zA-Z0-9_-]+)/)
        if (langMatch) language = langMatch[1]
      }
      if (props.children) extract(props.children)
    }
  }

  extract(children)
  return { text: text.trimEnd(), language }
}

function MarkdownPreBlock({ children }: { children?: React.ReactNode }) {
  const t = useTranslations("ChatMarkdown")
  const [copied, setCopied] = React.useState(false)
  const [open, setOpen] = React.useState(true)
  const { text, language } = React.useMemo(() => extractCodeDetails(children), [children])

  const lineCount = React.useMemo(() => (text ? text.split("\n").length : 1), [text])

  const handleCopy = React.useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!text) return
      const success = await copyToClipboard(text)
      if (success) {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    },
    [text],
  )

  const isSql = language === "sql" || language === "sqlite" || /select\s+.*from\s+/i.test(text)

  const handleShowInGrid = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!text) return
      useYulaGridStore.getState().setCustomQuerySql(text)
    },
    [text]
  )

  const langTitle = (language ?? "code").toUpperCase()

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="group relative my-1 overflow-hidden rounded-lg border border-border/40 bg-muted/20 dark:bg-muted/20"
    >
      <div
        onClick={() => setOpen((prev) => !prev)}
        className="flex cursor-pointer items-center justify-between border-b border-border/30 bg-muted/40 px-2.5 py-1 text-[10.5px] font-medium text-muted-foreground hover:bg-muted/60 transition-colors select-none"
      >
        <div className="flex items-center gap-1.5">
          <ChevronDown
            className={cn(
              "size-3 text-muted-foreground/70 transition-transform duration-200",
              !open && "-rotate-90"
            )}
          />
          <span className="font-mono font-semibold tracking-wider text-foreground/80">
            {langTitle}
          </span>
          <span className="text-[10px] text-muted-foreground/60 font-mono">
            ({t("line_count", { count: lineCount })})
          </span>
        </div>

        <div className="flex items-center gap-1">
          {isSql ? (
            <button
              type="button"
              onClick={handleShowInGrid}
              title={t("show_in_grid")}
              className="rounded-md p-0.5 text-sky-600 dark:text-sky-400 hover:bg-sky-500/10 transition-colors cursor-pointer select-none"
            >
              <Table className="size-3.5 shrink-0" />
            </button>
          ) : null}

          <button
            type="button"
            onClick={handleCopy}
            title={copied ? t("code_copied") : t("copy_code")}
            className="rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
          >
            {copied ? (
              <Check className="size-3.5 text-emerald-500" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
        </div>
      </div>

      <CollapsibleContent>
        {language ? (
          <CodeBlock
            value={text}
            language={language}
            showCopyButton={false}
            className="max-h-64 border-0 p-2 text-[11px] shadow-none rounded-none"
          />
        ) : (
          <pre className="max-h-64 overflow-auto p-2 font-mono text-[11px] leading-snug text-foreground/90">
            {children}
          </pre>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

function MarkdownHeading({ children }: { children?: React.ReactNode }) {
  return (
    <div className="mb-0.5 mt-2 flex items-center gap-1.5">
      <span className="h-3 w-0.5 rounded-full bg-orange-500/70 dark:bg-orange-400/70" />
      <span className="text-[12px] font-semibold text-foreground">{children}</span>
    </div>
  )
}

/** yula-prompt / yula-report / yula-file protokollü linkleri bileşenlere çevirir */
function ChatMarkdownLink({
  href,
  children,
}: {
  href?: string
  children?: React.ReactNode
}) {
  const t = useTranslations("ChatMarkdown")
  const { onPrompt, onNavigateReport, isExecutionConfirmation } =
    useChatMarkdownCallbacks()

  if (!href) return <span>{children}</span>

  if (href.startsWith("yula-prompt:")) {
    const prompt = decodeURIComponent(href.slice("yula-prompt:".length))
    return (
      <button
        type="button"
        onClick={() => onPrompt(prompt)}
        title={t("run_cmd", { cmd: prompt })}
        className="inline-flex items-center gap-1.5 my-0.5 mx-1 px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 hover:bg-orange-500/20 font-medium text-[11.5px] border border-orange-500/25 transition-all cursor-pointer select-none align-middle hover:scale-[1.02] active:scale-[0.98]"
      >
        <Sparkles className="size-3 shrink-0 text-orange-500" />
        <span>{children}</span>
      </button>
    )
  }

  if (href.startsWith("yula-report:")) {
    const [promptEnc, labelEnc] = href.slice("yula-report:".length).split("|")
    const prompt = decodeURIComponent(promptEnc ?? "")
    const label = decodeURIComponent(labelEnc ?? "")
    // Kayıtlı rapor: "X hazırla" mesajı göndermek yerine ekranı açar.
    const action = KNOWN_SYSTEM_ACTIONS.find((a) => a.prompt === prompt)
    const page = reportPageForAction(action)
    if (page) {
      return (
        <Link
          href={page}
          title={t("open_report_screen", { title: label })}
          className="inline cursor-pointer bg-transparent p-0 text-left align-baseline font-semibold text-foreground transition-colors hover:text-orange-600 dark:hover:text-orange-400 hover:underline"
        >
          {children}
        </Link>
      )
    }
    return (
      <button
        type="button"
        onClick={() => {
          if (isExecutionConfirmation) {
            const navigated = onNavigateReport(label)
            if (navigated) return
          }
          onPrompt(prompt)
        }}
        title={isExecutionConfirmation ? t("open_report_results", { title: label }) : t("open_report_screen", { title: label })}
        className="inline cursor-pointer bg-transparent p-0 text-left align-baseline font-semibold text-foreground transition-colors hover:text-orange-600 dark:hover:text-orange-400 hover:underline"
      >
        {children}
      </button>
    )
  }

  if (href.startsWith("yula-file:")) {
    const [pathEnc, query] = href.slice("yula-file:".length).split("?label=")
    const path = decodeURIComponent(pathEnc ?? "")
    const label = decodeURIComponent((query ?? "").replace(/^label=/, ""))
    return <FileOpenChip path={path} label={label || path} />
  }

  if (href.startsWith("yula-criteria:")) {
    const raw = href.slice("yula-criteria:".length)
    let scope = "stock-balance"
    const criteria: Record<string, unknown> = {}

    try {
      if (raw.startsWith("{")) {
        const parsed = JSON.parse(decodeURIComponent(raw))
        scope = parsed.scope || "stock-balance"
        Object.assign(criteria, parsed.criteria || {})
      } else {
        const [scopePart, queryPart] = raw.split("?")
        scope = decodeURIComponent(scopePart || "stock-balance")
        if (queryPart) {
          const params = new URLSearchParams(queryPart)
          params.forEach((v, k) => {
            criteria[k] = v
          })
        }
      }
    } catch (e) {
      console.warn("Failed to parse yula-criteria URL:", e)
    }

    return (
      <CriteriaApplyChip scope={scope} criteria={criteria}>
        {children}
      </CriteriaApplyChip>
    )
  }

  if (href.startsWith("/")) {
    return (
      <Link
        href={href}
        className="text-orange-600 font-semibold hover:underline dark:text-orange-400"
      >
        {children}
      </Link>
    )
  }

  return (
    <a href={href} className="text-orange-600 hover:underline dark:text-orange-400">
      {children}
    </a>
  )
}

/** Yatay bar kartındaki "En Yüksek 5" tablosu gibi dış kullanımlar için file çipi */
export function FileOpenChip({ path, label }: { path: string; label: string }) {
  const t = useTranslations("ChatMarkdown")
  const [failed, setFailed] = React.useState(false)

  const open = async () => {
    try {
      window.open(`/api/yula-exports/${encodeURIComponent(path)}`, "_blank")
      setFailed(false)
    } catch (err) {
      console.warn("[FileChip] Could not open the file:", err)
      setFailed(true)
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      title={failed ? t("file_failed", { path }) : path}
      className={cn(
        "mx-0.5 inline-flex max-w-64 items-center gap-1 rounded-md border bg-card px-1.5 py-0.5 align-middle text-[11px] font-medium shadow-xs transition-colors",
        failed
          ? "border-amber-500/40 text-amber-600 dark:text-amber-400"
          : "cursor-pointer text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400",
      )}
    >
      <FileSpreadsheet className="size-3 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  )
}
export function CriteriaApplyChip({
  scope,
  criteria,
  children,
}: {
  scope: string
  criteria: Record<string, unknown>
  children?: React.ReactNode
}) {
  const [applied, setApplied] = React.useState(false)
  const t = useTranslations("ChatMarkdown")

  const handleApply = async () => {
    try {
      const { applyCriteriaToDraft } = await import(
        "@/features/report-criteria/lib/apply-criteria-to-draft"
      )
      applyCriteriaToDraft(scope, criteria)
      setApplied(true)
      setTimeout(() => setApplied(false), 3000)
    } catch (err) {
      console.warn("[CriteriaApplyChip] Criteria could not be applied:", err)
    }
  }

  return (
    <button
      type="button"
      onClick={handleApply}
      title={t("apply_criteria_desc")}
      className={cn(
        "inline-flex items-center gap-1.5 my-1 mx-1 px-2.5 py-1 rounded-md text-[11.5px] font-medium border transition-all cursor-pointer select-none align-middle shadow-xs hover:scale-[1.02] active:scale-[0.98]",
        applied
          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
          : "bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400 hover:bg-orange-500/20"
      )}
    >
      {applied ? (
        <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <Sparkles className="size-3.5 shrink-0 text-orange-500" />
      )}
      <span className="font-semibold">{children}</span>
      <span className="text-[10px] opacity-85 underline ml-0.5 font-normal">
        {applied ? t("criteria_applied") : t("criteria_apply")}
      </span>
    </button>
  )
}

/* --------------------------- callbacks + block loop ----------------------- */

const ChatMarkdownCallbacksContext = React.createContext<ChatMarkdownCallbacks | null>(null)

function useChatMarkdownCallbacks(): ChatMarkdownCallbacks {
  const ctx = React.useContext(ChatMarkdownCallbacksContext)
  if (!ctx) {
    throw new Error("ChatMarkdownLink must be used within <ChatMarkdown />")
  }
  return ctx
}

const MarkdownBlock = React.memo(
  function MarkdownBlock({ content }: { content: string }) {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkYulaEntities]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    )
  },
  (prev, next) => prev.content === next.content,
)

function renderBlock(
  block: MarkdownBlockNode,
  key: number,
  cb: ChatMarkdownCallbacks,
  t: ChatMarkdownT,
): React.ReactNode {
  const trimmed = block.raw.trim()
  if (!trimmed) return null

  // 3a — onay satırı (paragraf bloğu, tek satır)
  const confirmation = renderConfirmationLine(trimmed, key, cb, t)
  if (confirmation) return confirmation

  const titleDesc = parseColonTitleLine(trimmed)
  if (titleDesc && (block.type === "paragraph" || block.type === "heading")) {
    return renderBulletedItem(trimmed, String(key), cb, t)
  }

  // Paragraf veya liste satırlarında bullet kontrolü:
  if (block.type === "list" || /^([-*•●]|\d+\.)\s+/.test(trimmed)) {
    const lines = block.raw.split("\n").filter((l) => l.trim())
    return (
      <React.Fragment key={`list-${key}`}>
        {lines.map((line, li) => {
          const trimmedLine = line.trim()
          if (/^([-*•●]|\d+\.)\s+/.test(trimmedLine)) {
            const bullet = renderBulletedItem(trimmedLine, `${key}-${li}`, cb, t)
            if (bullet) return bullet
            const plain = renderPlainBullet(trimmedLine, `${key}-${li}`, cb, t)
            if (plain) return plain
          }
          return (
            <MarkdownBlock key={`ml-${key}-${li}`} content={line} />
          )
        })}
      </React.Fragment>
    )
  }

  return <MarkdownBlock content={block.raw} />
}

/* --------------------------------- bileşen -------------------------------- */

export function ChatMarkdown({
  text,
  isExecutionConfirmation,
  columns,
  sourceTable,
  onPrompt,
  onNavigateReport,
  onRunReport,
  staticTitles,
  className,
}: {
  text: string
  isExecutionConfirmation: boolean
  columns: string[]
  sourceTable?: string | null
  onPrompt: (text: string) => void
  onNavigateReport: (reportTitle: string) => boolean
  onRunReport?: () => boolean
  staticTitles?: string[]
  className?: string
}) {
  const blocks = React.useMemo(() => parseMarkdownBlocks(text), [text])
  const t = useTranslations("ChatMarkdown")
  const callbacks = React.useMemo<ChatMarkdownCallbacks>(
    () => ({ onPrompt, onNavigateReport, isExecutionConfirmation, columns, sourceTable, onRunReport, staticTitles }),
    [onPrompt, onNavigateReport, isExecutionConfirmation, columns, sourceTable, onRunReport, staticTitles],
  )

  return (
    <ChatMarkdownCallbacksContext.Provider value={callbacks}>
      <div className={cn("space-y-1 text-[12px] text-foreground/90", className)}>
        {blocks.map((block, i) => (
          <React.Fragment key={i}>{renderBlock(block, i, callbacks, t)}</React.Fragment>
        ))}
      </div>
    </ChatMarkdownCallbacksContext.Provider>
  )
}
