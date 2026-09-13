"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslations } from "next-intl";
import { cn } from "@/utils/cn";
import { parseColonTitleLine } from "@/lib/finding-actions";
import {
  parseMarkdownBlocks,
  remarkYulaEntities,
  type MarkdownBlockNode,
} from "./markdown-entities";
import {
  ChatMarkdownCallbacksContext,
  type ChatMarkdownCallbacks,
  type ChatMarkdownT,
} from "./markdown-context";
import {
  renderBulletedItem,
  renderConfirmationLine,
  renderPlainBullet,
} from "./markdown-blocks";
import { markdownComponents } from "./markdown-component-map";

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
export const MarkdownBlock = React.memo(
  function MarkdownBlock({ content }: { content: string }) {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkYulaEntities]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    );
  },
  (prev, next) => prev.content === next.content,
);

function renderBlock(
  block: MarkdownBlockNode,
  key: number,
  cb: ChatMarkdownCallbacks,
  t: ChatMarkdownT,
): React.ReactNode {
  const trimmed = block.raw.trim();
  if (!trimmed) return null;

  // 3a — onay satırı (paragraf bloğu, tek satır)
  const confirmation = renderConfirmationLine(trimmed, key, cb, t);
  if (confirmation) return confirmation;

  const titleDesc = parseColonTitleLine(trimmed);
  if (titleDesc && (block.type === "paragraph" || block.type === "heading")) {
    return renderBulletedItem(trimmed, String(key), cb, t);
  }

  // Paragraf veya liste satırlarında bullet kontrolü:
  if (block.type === "list" || /^([-*•●]|\d+\.)\s+/.test(trimmed)) {
    const lines = block.raw.split("\n").filter((l) => l.trim());
    return (
      <React.Fragment key={`list-${key}`}>
        {lines.map((line, li) => {
          const trimmedLine = line.trim();
          if (/^([-*•●]|\d+\.)\s+/.test(trimmedLine)) {
            const bullet = renderBulletedItem(trimmedLine, `${key}-${li}`, cb, t);
            if (bullet) return bullet;
            const plain = renderPlainBullet(trimmedLine, `${key}-${li}`, cb, t);
            if (plain) return plain;
          }
          return (
            <MarkdownBlock key={`ml-${key}-${li}`} content={line} />
          );
        })}
      </React.Fragment>
    );
  }

  return <MarkdownBlock content={block.raw} />;
}

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
  text: string;
  isExecutionConfirmation: boolean;
  columns: string[];
  sourceTable?: string | null;
  onPrompt: (text: string) => void;
  onNavigateReport: (reportTitle: string) => boolean;
  onRunReport?: () => boolean;
  staticTitles?: string[];
  className?: string;
}) {
  const blocks = React.useMemo(() => parseMarkdownBlocks(text), [text]);
  const t = useTranslations("ChatMarkdown");
  const callbacks = React.useMemo<ChatMarkdownCallbacks>(
    () => ({ onPrompt, onNavigateReport, isExecutionConfirmation, columns, sourceTable, onRunReport, staticTitles }),
    [onPrompt, onNavigateReport, isExecutionConfirmation, columns, sourceTable, onRunReport, staticTitles],
  );

  return (
    <ChatMarkdownCallbacksContext.Provider value={callbacks}>
      <div className={cn("space-y-1 text-[12px] text-foreground/90", className)}>
        {blocks.map((block, i) => (
          <React.Fragment key={i}>{renderBlock(block, i, callbacks, t)}</React.Fragment>
        ))}
      </div>
    </ChatMarkdownCallbacksContext.Provider>
  );
}
