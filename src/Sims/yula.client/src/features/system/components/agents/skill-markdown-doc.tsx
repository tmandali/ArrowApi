"use client";

import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/utils/cn";
import { stripSkillFrontmatter } from "@/lib/skill-discovery";

const mdComponents: Components = {
  h1: ({ children }) => (
    <h1 className="text-[13px] font-semibold tracking-tight text-foreground">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-[12.5px] font-semibold tracking-tight text-foreground">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-[12px] font-semibold text-foreground">{children}</h3>
  ),
  p: ({ children }) => <p className="leading-relaxed">{children}</p>,
  ul: ({ children }) => (
    <ul className="list-disc space-y-0.5 pl-5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal space-y-0.5 pl-5">{children}</ol>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  code: ({ children }) => (
    <code className="rounded bg-muted px-1 py-px font-mono text-[11px]">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="overflow-auto rounded-md bg-muted/40 p-2.5 font-mono text-[11px] leading-relaxed">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border pl-2.5 text-muted-foreground">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[11px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-border px-2 py-1 text-left font-medium text-muted-foreground">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border/60 px-2 py-1 align-top">{children}</td>
  ),
  hr: () => <hr className="border-border/60" />,
  // Salt-okunur önizleme: bağlantılar gezinmez, vurgu olarak basılır.
  a: ({ children }) => (
    <span className="font-medium text-foreground">{children}</span>
  ),
};

/**
 * Salt-okunur markdown önizleme (etkileşimsiz): skill SKILL.md ve .md
 * referans dosyaları için. Frontmatter başlıkta zaten gösterildiği için
 * düşürülür; `ChatMarkdown` aksine tıklama/sohbet yan etkisi yoktur.
 */
export function MarkdownDoc({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 space-y-2 text-[12px] leading-relaxed text-foreground/90",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {stripSkillFrontmatter(value)}
      </ReactMarkdown>
    </div>
  );
}
