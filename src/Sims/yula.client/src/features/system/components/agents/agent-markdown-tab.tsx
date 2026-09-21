import * as React from "react";
import { useTranslations } from "next-intl";
import { TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { lintAgentInstructions } from "@/lib/yula-user-agent";
import { MarkdownDoc } from "./skill-markdown-doc";

export interface AgentMarkdownTabProps {
  isRO: boolean;
  agentMd: string;
  setAgentMd: (value: string) => void;
  fillRef?: React.Ref<HTMLDivElement>;
}

export function AgentMarkdownTab({
  isRO,
  agentMd,
  setAgentMd,
  fillRef,
}: AgentMarkdownTabProps) {
  const t = useTranslations("AgentEditor");
  const tv = useTranslations("Validation");

  return (
    <TabsContent
      ref={fillRef}
      value="agentmd"
      className="mt-0 flex min-h-full flex-1 flex-col min-w-0"
    >
      {!isRO && lintAgentInstructions(agentMd).length > 0 ? (
        <div
          role="note"
          className="mb-2 shrink-0 space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/[0.07] px-3 py-2"
        >
          {lintAgentInstructions(agentMd).map((code) => (
            <p
              key={code}
              className="text-[11.5px] leading-relaxed text-amber-700 dark:text-amber-300"
            >
              ⚠ {tv(code)}
            </p>
          ))}
        </div>
      ) : null}
      {isRO ? (
        <MarkdownDoc value={agentMd} className="min-h-48 flex-1" />
      ) : (
        <Textarea
          value={agentMd}
          onChange={(e) => setAgentMd(e.target.value)}
          placeholder={t("instructions_placeholder")}
          rows={1}
          aria-label={t("agent_md_aria")}
          className="min-h-48 w-full flex-1 rounded-none border-0 bg-transparent px-0 font-mono text-xs shadow-none resize-none focus-visible:border-0 focus-visible:ring-0 data-disabled:opacity-80"
        />
      )}
    </TabsContent>
  );
}
