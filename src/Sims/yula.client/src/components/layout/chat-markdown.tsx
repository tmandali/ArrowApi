"use client";

import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { marked } from "marked";
import { Check, Copy, FileSpreadsheet } from "lucide-react";
import { CodeBlock } from "@/components/ui/code-block";
import { cn } from "@/utils/cn";
import {
  KNOWN_SYSTEM_ACTIONS,
  isPromptSentenceLike,
  type KnownSystemAction,
} from "@/lib/yula-actions";

export type { KnownSystemAction };
import { extractFindingFilterPrompt } from "@/lib/finding-actions";

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
}

/* ----------------------------- blok renderları ---------------------------- */

/** 3a — onay/çalıştırma satırı: "✓ Stok Bakiye Raporu: ..." */
function renderConfirmationLine(
  trimmed: string,
  lIdx: number,
  cb: ChatMarkdownCallbacks,
): React.ReactNode {
  const confirmationMatch = trimmed.match(
    /^([✓📊⚡]\s*)?(\*\*)?([A-Za-zÇĞİÖŞÜçğıöşü0-9\s&/()_-]{3,70}?)(?:\s+Report Started|\s+Raporu Başlatıldı|\s+Raporu Hazırlandı)?(\*\*)?\s*:\s*(.*)$/iu,
  )
  if (
    !confirmationMatch ||
    !(confirmationMatch[1] || cb.isExecutionConfirmation || trimmed.includes("Report Started"))
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
        title={`${reportTitle} ${cb.isExecutionConfirmation ? "canlı sonuçlarını açmak" : "işlemini başlatmak"} için tıklayın`}
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

/** 3b — bulgu/rapor maddesi: "● Başlık: açıklama" */
function renderBulletedItem(
  line: string,
  lIdx: string,
  cb: ChatMarkdownCallbacks,
): React.ReactNode {
  const bulletMatch = line
    .trim()
    .match(/^([-*•]|\d+\.)\s+(\*\*)?([A-Za-zÇĞİÖŞÜçğıöşü0-9\s&/()_-]{3,50}?)(\*\*)?\s*:\s*(.+)$/i)
  if (!bulletMatch) return null

  const itemTitle = bulletMatch[3].trim()
  const itemDesc = bulletMatch[5].trim()

  // Madde sınıflandırması kelime listesiyle DEĞİL: başlık bilinen rapor
  // desenine uyuyorsa "rapor başlat" yolu; UYMUYORSA gözlem/bulgudur →
  // açık doğrulama prompt'u. Filtre şekli çıkarılabilirse hızlı yol.
  const knownAction = KNOWN_SYSTEM_ACTIONS.find((a) => a.pattern.test(itemTitle))
  const findingPrompt = extractFindingFilterPrompt({
    text: `${itemTitle} ${itemDesc}`,
    columns: cb.columns,
  })
  const findingOpenPrompt = knownAction
    ? null
    : `Bu gözlemi doğrula ve uygula: ${itemTitle}: ${itemDesc}`

  return (
    <div key={lIdx} className="flex items-start gap-2 py-0.5 pl-1">
      <span className="mt-1 shrink-0 text-[10px] text-orange-500/70 dark:text-orange-400/70">●</span>
      <div className="flex-1 leading-relaxed text-[12px]">
        <button
          type="button"
          onClick={() => {
            if (findingPrompt) {
              cb.onPrompt(findingPrompt)
              return
            }
            if (!knownAction && findingOpenPrompt) {
              cb.onPrompt(findingOpenPrompt)
              return
            }
            if (knownAction) {
              if (cb.isExecutionConfirmation) {
                const navigated = cb.onNavigateReport(knownAction.label)
                if (navigated) return
              }
              cb.onPrompt(knownAction.prompt)
              return
            }
            cb.onPrompt(`${itemTitle} hazırla`)
          }}
          title={
            findingPrompt
              ? `"${findingPrompt}" filtresini uygulamak için tıklayın`
              : !knownAction && findingOpenPrompt
                ? "Bu gözlemi Yula ile doğrulamak/uygulamak için tıklayın"
                : `${itemTitle} ${cb.isExecutionConfirmation ? "sonuçlarını açmak" : "işlemini başlatmak"} için tıklayın`
          }
          className={cn(
            "mr-1 inline border-0 bg-transparent p-0 text-left align-baseline text-[12px] font-semibold text-foreground hover:text-orange-600 dark:hover:text-orange-400 hover:underline cursor-pointer",
            findingPrompt && "text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300",
          )}
        >
          {itemTitle}:
        </button>
        <span className="text-foreground/90">{itemDesc}</span>
      </div>
    </div>
  )
}

/** 3c — kolonsuz standart madde */
function renderPlainBullet(
  line: string,
  lIdx: string,
): React.ReactNode {
  const cleanBulletText = line.trim().replace(/^([-*•]|\d+\.)\s+/, "")
  const boldParts = cleanBulletText.split(/(\*\*[^*]+\*\*)/g)
  return (
    <div key={lIdx} className="flex items-start gap-2 py-0.5 pl-1">
      <span className="mt-1 shrink-0 text-[10px] text-orange-500/70 dark:text-orange-400/70">●</span>
      <p className="flex-1 leading-relaxed text-[12px]">
        {boldParts.map((bp, bIdx) => {
          if (bp.startsWith("**") && bp.endsWith("**")) {
            return (
              <strong key={bIdx} className="font-semibold text-foreground">
                {bp.slice(2, -2)}
              </strong>
            )
          }
          return bp
        })}
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
  const [copied, setCopied] = React.useState(false)
  const { text, language } = React.useMemo(() => extractCodeDetails(children), [children])

  const handleCopy = React.useCallback(() => {
    if (!text) return
    void navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [text])

  return (
    <div className="group relative my-1.5 overflow-hidden rounded-md border border-border/60 bg-muted/30">
      <div className="flex items-center justify-between border-b border-border/40 bg-muted/50 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
        <span className="font-mono uppercase tracking-wider text-muted-foreground/80">
          {language ?? "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          title={copied ? "Kopyalandı" : "Kodu kopyala"}
          className="rounded-md p-1 text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100 cursor-pointer"
        >
          {copied ? (
            <Check className="size-3.5 text-emerald-500" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </button>
      </div>
      {language ? (
        <CodeBlock value={text} language={language} className="max-h-72 border-0 shadow-none rounded-none" />
      ) : (
        <pre className="max-h-72 overflow-auto p-2.5 font-mono text-[12px] leading-relaxed">
          {children}
        </pre>
      )}
    </div>
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
  const { onPrompt, onNavigateReport, isExecutionConfirmation } =
    useChatMarkdownCallbacks()

  if (!href) return <span>{children}</span>

  if (href.startsWith("yula-prompt:")) {
    const prompt = decodeURIComponent(href.slice("yula-prompt:".length))
    return (
      <button
        type="button"
        onClick={() => onPrompt(prompt)}
        title={`"${prompt}" komutunu çalıştırmak için tıklayın`}
        className="font-medium text-foreground/90 underline decoration-dotted underline-offset-2 hover:text-orange-600 dark:hover:text-orange-400 cursor-pointer"
      >
        {children}
      </button>
    )
  }

  if (href.startsWith("yula-report:")) {
    const [promptEnc, labelEnc] = href.slice("yula-report:".length).split("|")
    const prompt = decodeURIComponent(promptEnc ?? "")
    const label = decodeURIComponent(labelEnc ?? "")
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
        title={`${label} ${isExecutionConfirmation ? "sonuçlarını açmak" : "raporunu açmak"} için tıklayın`}
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

  return (
    <a href={href} className="text-orange-600 hover:underline dark:text-orange-400">
      {children}
    </a>
  )
}

/** Yatay bar kartındaki "En Yüksek 5" tablosu gibi dış kullanımlar için file çipi */
export function FileOpenChip({ path, label }: { path: string; label: string }) {
  const [failed, setFailed] = React.useState(false)

  const open = async () => {
    try {
      window.open(`/api/yula-exports/${encodeURIComponent(path)}`, "_blank")
      setFailed(false)
    } catch (err) {
      console.warn("[FileChip] açılamadı:", err)
      setFailed(true)
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      title={failed ? `Açılamadı — yol: ${path}` : path}
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
): React.ReactNode {
  const trimmed = block.raw.trim()
  if (!trimmed) return null

  // 3a — onay satırı (paragraf bloğu, tek satır)
  const confirmation = renderConfirmationLine(trimmed, key, cb)
  if (confirmation) return confirmation

  // 3b — bulgu/rapor maddeleri (list bloğu → satır satır eski davranış)
  if (block.type === "list") {
    const lines = block.raw.split("\n").filter((l) => l.trim())
    return (
      <React.Fragment key={`list-${key}`}>
        {lines.map((line, li) => {
          const bullet = renderBulletedItem(line, `${key}-${li}`, cb)
          if (bullet) return bullet
          const plain = renderPlainBullet(line, `${key}-${li}`)
          if (plain) return plain
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
  onPrompt,
  onNavigateReport,
  className,
}: {
  text: string
  isExecutionConfirmation: boolean
  columns: string[]
  onPrompt: (text: string) => void
  onNavigateReport: (reportTitle: string) => boolean
  className?: string
}) {
  const blocks = React.useMemo(() => parseMarkdownBlocks(text), [text])
  const callbacks = React.useMemo<ChatMarkdownCallbacks>(
    () => ({ onPrompt, onNavigateReport, isExecutionConfirmation, columns }),
    [onPrompt, onNavigateReport, isExecutionConfirmation, columns],
  )

  return (
    <ChatMarkdownCallbacksContext.Provider value={callbacks}>
      <div className={cn("space-y-1 text-[12px] text-foreground/90", className)}>
        {blocks.map((block, i) => (
          <React.Fragment key={i}>{renderBlock(block, i, callbacks)}</React.Fragment>
        ))}
      </div>
    </ChatMarkdownCallbacksContext.Provider>
  )
}
