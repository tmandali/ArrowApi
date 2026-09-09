"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useYulaChat } from "@/hooks/use-yula-chat";
import { useChatsStore } from "@/lib/stores/chats";
import { useYulaDockStore } from "@/lib/stores/dock";
import { FileSpreadsheet } from "lucide-react";

/**
 * Başarılı run_job çıktısından beslenen garanti tıklanabilir kart.
 * Modelin metin kalıbına (✓/Report Started/UUID) bağımlı değildir.
 */
export function YulaJobStartedCard({
  jobId,
  navigateTo,
  title,
}: {
  jobId?: string;
  navigateTo: string;
  title?: string;
}) {
  const router = useRouter();
  const yula = useYulaChat();

  const handleOpen = React.useCallback(() => {
    useChatsStore.getState().beginConversationFollow(yula.activeId);
    useYulaDockStore.getState().setOpen(true);
    void router.push(navigateTo);
  }, [navigateTo, router, yula.activeId]);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-emerald-500/35 bg-emerald-500/[0.07] px-3 py-2 dark:border-emerald-400/25 dark:bg-emerald-400/[0.06]">
      <span className="font-bold text-emerald-600 dark:text-emerald-400">✓</span>
      <div className="flex min-w-0 flex-1 flex-col leading-snug">
        <span className="text-[12px] font-semibold text-foreground">
          {title ?? "Rapor çalıştırıldı"}
        </span>
        {jobId ? (
          <span className="font-mono text-[11px] text-muted-foreground">
            iş: {jobId.slice(0, 8)}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={handleOpen}
        title="Sonuç ekranını açmak için tıklayın"
        className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-emerald-600/40 px-2.5 text-[12px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/15 dark:text-emerald-300"
      >
        <FileSpreadsheet className="size-3.5" />
        Sonuçları aç
      </button>
    </div>
  );
}
