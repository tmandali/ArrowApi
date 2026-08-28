"use client";

import { YulaMarkIcon } from "@/components/layout/yula-brand";
import { YULA } from "@/components/layout/yula-brand-data";
import { Button } from "@/components/ui/button";
import { useWorkspaceAiChat } from "@/context/workspace-ai-chat-context";

/**
 * Header'daki Yula simgesi — doğrudan dock aç/kapa tetikler.
 */
export function YulaSkillButtons() {
  const { toggle } = useWorkspaceAiChat();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => toggle()}
      className="group/ai size-7 border-none bg-transparent text-primary shadow-none hover:bg-transparent focus-visible:ring-0 active:scale-95"
      aria-label={YULA.ariaLabel}
      title={YULA.name}
    >
      <YulaMarkIcon className="size-5 transition-transform duration-200 group-hover/ai:scale-110" />
    </Button>
  );
}
