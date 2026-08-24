import * as React from "react"
import {
  Download,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react"

import { useAgentBridgeStore } from "@/hooks/useAgentBridge"
import { invokeSkillDirect } from "@/lib/skills-bridge"
import { WorkspaceAiChatContext } from "@/context/workspace-ai-chat-context"
import type { SkillHeaderButton, SkillUi } from "@/hooks/yula/types"
import { cn } from "@/utils/cn"

/**
 * Skill'lerin SKILL.md `ui.header_buttons` bildiriminden üretilen header buton grubu.
 *
 * - Butonlar skill yüklüyse register olur; tıklama LLM'e HİÇ gitmeden sidecar'daki
 *   Python fonksiyonunu tetikler (bridge_call) → deterministik kullanıcı eylemi.
 * - scope.workspaces / scope.screens ("report-grid-*" gibi) eşleşmezse gizlenir.
 * İkon seti kapalı enum'dur (AGENTS.md kelime-listesi kuralı).
 */
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  plus: Plus,
  trash: Trash2,
  download: Download,
  upload: Upload,
  refresh: RefreshCw,
  play: Play,
}

function matchesScope(
  btn: SkillHeaderButton,
  workspaceId?: string,
  screenId?: string
): boolean {
  const ws = btn.scope?.workspaces;
  const screens = btn.scope?.screens;
  if (!ws && !screens) return true;
  if (ws && workspaceId && ws.includes(workspaceId)) return true;
  if (screens && screenId) {
    for (const pattern of screens) {
      if (pattern.endsWith("*")) {
        if (screenId.startsWith(pattern.slice(0, -1))) return true;
      } else if (screenId === pattern) {
        return true;
      }
    }
  }
  return false;
}

export function YulaSkillButtons({ className }: { className?: string }) {
  const skills = useAgentBridgeStore((s) => s.skills);
  const screenContext = useAgentBridgeStore((s) => s.screenContext);
  const appendMessage = useAgentBridgeStore((s) => s.appendMessage);
  const aiChat = React.useContext(WorkspaceAiChatContext);
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const workspaceId =
    screenContext?.workspaceId ||
    (typeof window !== "undefined" ? window.location.pathname.split("/")[1] : "");
  const screenId = screenContext?.screenId || "";

  const buttons: Array<{ skill: string; btn: SkillHeaderButton }> = [];
  for (const s of skills) {
    const uiButtons = (s.ui as SkillUi | undefined)?.header_buttons || [];
    // Öncelik: @skill(buttons=[...]) dekoratörü → frontmatter ui.header_buttons
    const fnButtons = s.functions.flatMap((f) =>
      (f.buttons || []).map((b) => ({ ...b, call: b.call || f.name }))
    );
    const source = fnButtons.length ? fnButtons : uiButtons;
    for (const btn of source) {
      if (btn.call && btn.label && matchesScope(btn, workspaceId, screenId)) {
        buttons.push({ skill: s.folder, btn });
      }
    }
  }
  if (!buttons.length) return null;

  const run = async (entry: { skill: string; btn: SkillHeaderButton }) => {
    const id = entry.btn.id;
    setPendingId(id);
    try {
      const outcome = await invokeSkillDirect(entry.btn.call, entry.btn.args || {});
      const res = outcome.result || {};
      // Sonuç Yula sohbetine düşer → panel kapalıysa kullanıcı görebilsin diye aç
      aiChat?.setOpen(true);
      if (res.file_path) {
        const rowsTxt = typeof res.rows_written === "number" ? ` (${res.rows_written.toLocaleString("tr-TR")} satır)` : "";
        appendMessage({
          sender: "agent",
          content: `📄 Hazır: [[file:${res.file_path}|${res.file_name || "Dosya"}]]${rowsTxt}`,
        });
      } else if (!outcome.ok || res.error) {
        appendMessage({
          sender: "system",
          content: `⚠️ "${entry.btn.label}": ${outcome.error || res.error}`,
        });
      } else {
        appendMessage({
          sender: "system",
          content: `✓ ${entry.btn.label} tamamlandı.`,
        });
      }
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className={cn("flex shrink-0 items-center gap-1.5", className)}>
      {buttons.map(({ skill, btn }) => {
        const Icon = ICONS[btn.icon || "play"] || Play;
        const isPending = pendingId === btn.id;
        return (
          <button
            key={`${skill}:${btn.id}`}
            type="button"
            disabled={isPending}
            onClick={() => void run({ skill, btn })}
            title={btn.label}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-lg border bg-card px-2 text-[11px] font-medium text-foreground/80 shadow-xs transition-colors",
              "hover:bg-muted/70 hover:text-foreground",
              isPending && "cursor-wait opacity-60"
            )}
          >
            {isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Icon className="size-3" />
            )}
            <span className="max-w-28 truncate">{btn.label}</span>
          </button>
        );
      })}
    </div>
  );
}
