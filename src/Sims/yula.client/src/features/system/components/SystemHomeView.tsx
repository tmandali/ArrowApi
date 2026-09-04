"use client";

import { usePathname } from "next/navigation";
import { AIChatPanel } from "@/components/layout/ai-chat-assistant";
import { WorkspacePageShell } from "@/components/layout/workspace-page-shell";
import { WorkspacePinnedItemsGrid } from "@/components/layout/workspace-pinned-items-grid";

export function SystemHomeView() {
  const pathname = usePathname();

  // Yula root (/): tüm pinler yerine aynı kutu biçimiyle çalışma alanları.
  // Workspace root'ları: o çalışma alanına ait pinler (path filtresi).
  const isYulaRoot = pathname === "/";

  // Ana sayfada yüzen header kartı yok: arama AppHeader'daki tetik + Cmd+K ile
  // yürür (arama açıkken shell içindeki dock WorkspaceSearchMainView'a döner).
  return (
    <WorkspacePageShell hideHeader>
      <AIChatPanel
        mode="main"
        belowInput={
          <WorkspacePinnedItemsGrid
            mode={isYulaRoot ? "workspaces" : "pins"}
            className="w-full"
          />
        }
      />
    </WorkspacePageShell>
  );
}
