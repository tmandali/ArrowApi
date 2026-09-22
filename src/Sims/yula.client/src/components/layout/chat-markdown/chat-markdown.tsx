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
import {
  isQuestionText,
  isBulletBlock,
  normalizeChoiceBullets,
} from "@/lib/yula-choice-inference";

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
  questionContext?: string,
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
  if (block.type === "list" || isBulletBlock(trimmed)) {
    const lines = block.raw.split("\n").filter((l) => l.trim());
    let currentQuestionContext = questionContext;
    return (
      <React.Fragment key={`list-${key}`}>
        {lines.map((line, li) => {
          const trimmedLine = line.trim();
          if (isQuestionText(trimmedLine)) {
            currentQuestionContext = trimmedLine;
          }
          if (isBulletBlock(trimmedLine)) {
            const bullet = renderBulletedItem(trimmedLine, `${key}-${li}`, cb, t);
            if (bullet) return bullet;
            const plain = renderPlainBullet(trimmedLine, `${key}-${li}`, cb, t, currentQuestionContext);
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
  onChoiceSelect,
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
  onChoiceSelect?: (value: string, context?: { question?: string; field?: string }) => void;
  className?: string;
}) {
  const normalizedText = React.useMemo(() => normalizeChoiceBullets(text), [text]);
  const blocks = React.useMemo(() => parseMarkdownBlocks(normalizedText), [normalizedText]);
  const t = useTranslations("ChatMarkdown");
  const callbacks = React.useMemo<ChatMarkdownCallbacks>(
    () => ({
      onPrompt,
      onNavigateReport,
      isExecutionConfirmation,
      columns,
      sourceTable,
      onRunReport,
      staticTitles,
      onChoiceSelect,
    }),
    [onPrompt, onNavigateReport, isExecutionConfirmation, columns, sourceTable, onRunReport, staticTitles, onChoiceSelect],
  );

  let activeQuestion: string | undefined;

  // Soru bağlamı altındaki ardışık seçim çipleri yatay flex kutusunda toplanır:
  const renderedElements: React.ReactNode[] = [];
  let choiceGroup: React.ReactNode[] = [];

  const flushChoiceGroup = (groupKey: string) => {
    if (choiceGroup.length > 0) {
      renderedElements.push(
        <div key={`choice-group-${groupKey}`} className="flex flex-wrap items-center gap-1.5 py-1">
          {choiceGroup}
        </div>,
      );
      choiceGroup = [];
    }
  };

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const trimmed = block.raw.trim();

    if (isQuestionText(trimmed)) {
      flushChoiceGroup(String(i));
      activeQuestion = trimmed;
      renderedElements.push(
        <React.Fragment key={i}>
          {renderBlock(block, i, callbacks, t, activeQuestion)}
        </React.Fragment>,
      );
      continue;
    }

    if (isBulletBlock(trimmed)) {
      const rendered = renderBlock(block, i, callbacks, t, activeQuestion);
      if (activeQuestion) {
        choiceGroup.push(<React.Fragment key={i}>{rendered}</React.Fragment>);
        continue;
      }
      flushChoiceGroup(String(i));
      renderedElements.push(<React.Fragment key={i}>{rendered}</React.Fragment>);
      continue;
    }

    // Normal metin veya başlık
    flushChoiceGroup(String(i));
    activeQuestion = undefined;
    renderedElements.push(
      <React.Fragment key={i}>
        {renderBlock(block, i, callbacks, t, undefined)}
      </React.Fragment>,
    );
  }

  flushChoiceGroup("end");

  return (
    <ChatMarkdownCallbacksContext.Provider value={callbacks}>
      <div className={cn("space-y-1 text-[12px] text-foreground/90", className)}>
        {renderedElements}
      </div>
    </ChatMarkdownCallbacksContext.Provider>
  );
}
