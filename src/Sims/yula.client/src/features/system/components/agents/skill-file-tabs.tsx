"use client";

import * as React from "react";
import { CodeBlock } from "@/components/ui/code-block";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface SkillFileTabItem {
  key: string;
  label: string;
  title?: string;
  /** Önizlenecek içerik; yoksa note gösterilir. */
  content?: string;
  language?: string;
  note?: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Skill paket dosyaları için sekmeli önizleme (salt-okunur ve düzenleme
 * kipinde ortak). Sekme durumu ebeveynde tutulur.
 */
export function SkillFileTabs({
  items,
  activeValue,
  onValueChange,
}: {
  items: SkillFileTabItem[];
  activeValue: string;
  onValueChange: (value: string) => void;
}) {
  const fallback = items[0]?.key ?? "";
  const value = items.some((f) => f.key === activeValue) ? activeValue : fallback;
  return (
    <Tabs value={value} onValueChange={onValueChange}>
      <TabsList variant="line" className="w-full justify-start">
        {items.map((f) => (
          <TabsTrigger
            key={f.key}
            value={f.key}
            className="max-w-40 truncate font-mono text-[11px]"
            title={f.title ?? f.key}
          >
            {f.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {items.map((f) => (
        <TabsContent key={f.key} value={f.key} className="mt-2">
          {f.content ? (
            <div className="overflow-hidden rounded-md border border-border/60 bg-muted/20">
              <div className="p-2">
                <CodeBlock
                  value={f.content}
                  language={f.language ?? "plaintext"}
                  className="max-h-64 border-border/60 shadow-none"
                />
              </div>
              {f.footer ? (
                <div className="flex items-center justify-between border-t border-border/60 px-2.5 py-1.5">
                  {f.footer}
                </div>
              ) : null}
            </div>
          ) : (
            f.note ?? null
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}
