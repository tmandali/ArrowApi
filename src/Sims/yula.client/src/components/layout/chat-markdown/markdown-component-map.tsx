import * as React from "react";
import type { Components } from "react-markdown";
import { ChatMarkdownLink, MarkdownHeading, MarkdownPreBlock } from "./markdown-components";

/** react-markdown override haritası: grid-dili temalı tablo/başlık/liste/kod. */
export const markdownComponents: Components = {
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
    const isBlock = /language-/.test(className ?? "");
    if (isBlock) return <code className="font-mono">{children}</code>;
    return (
      <code className="rounded border border-border/60 bg-muted/40 px-1 py-0.5 font-mono text-[11px]">
        {children}
      </code>
    );
  },
};

export function extractCodeDetails(children: React.ReactNode): { text: string; language?: string } {
  let text = "";
  let language: string | undefined;

  const extract = (node: React.ReactNode) => {
    if (typeof node === "string") {
      text += node;
      return;
    }
    if (typeof node === "number") {
      text += String(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(extract);
      return;
    }
    if (React.isValidElement(node) && node.props) {
      const props = node.props as { className?: string; children?: React.ReactNode };
      if (props.className) {
        const langMatch = props.className.match(/language-([a-zA-Z0-9_-]+)/);
        if (langMatch) language = langMatch[1];
      }
      if (props.children) extract(props.children);
    }
  };

  extract(children);
  return { text: text.trimEnd(), language };
}
