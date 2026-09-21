"use client";

import * as React from "react";
import { Zap, ListOrdered, X } from "lucide-react";
import { useYulaChat } from "@/hooks/use-yula-chat";

export function YulaQueueBadge() {
  const yula = useYulaChat();
  const steeringQueue = yula.steeringQueue ?? [];
  const followUpQueue = yula.followUpQueue ?? [];

  if (steeringQueue.length === 0 && followUpQueue.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 py-1 text-[11.5px] transition-all">
      {steeringQueue.length > 0 ? (
        <div
          className="inline-flex items-center gap-1.5 rounded-full border border-pink-500/30 bg-pink-500/10 px-2.5 py-0.5 font-medium text-pink-600 dark:text-pink-400 shadow-2xs"
          title={steeringQueue.map((s) => s.content).join("\n")}
        >
          <Zap className="size-3 text-pink-500 animate-pulse" />
          <span>
            {steeringQueue.length === 1
              ? `⚡ ${steeringQueue[0].content.slice(0, 30)}${steeringQueue[0].content.length > 30 ? "…" : ""}`
              : `${steeringQueue.length} araya girme sırada`}
          </span>
          <button
            type="button"
            onClick={() => yula.clearSteering()}
            className="ml-0.5 rounded-full p-0.5 hover:bg-pink-500/20 text-pink-600 dark:text-pink-400 transition-colors cursor-pointer"
            title="Araya girmeyi iptal et"
          >
            <X className="size-3" />
            <span className="sr-only">Kaldır</span>
          </button>
        </div>
      ) : null}

      {followUpQueue.length > 0 ? (
        <div
          className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 font-medium text-violet-600 dark:text-violet-400 shadow-2xs"
          title={followUpQueue.map((s) => s.content).join("\n")}
        >
          <ListOrdered className="size-3 text-violet-500" />
          <span>
            {followUpQueue.length === 1
              ? `📥 ${followUpQueue[0].content.slice(0, 30)}${followUpQueue[0].content.length > 30 ? "…" : ""}`
              : `${followUpQueue.length} takip görevi sırada`}
          </span>
          <button
            type="button"
            onClick={() => yula.clearFollowUp()}
            className="ml-0.5 rounded-full p-0.5 hover:bg-violet-500/20 text-violet-600 dark:text-violet-400 transition-colors cursor-pointer"
            title="Takip görevini iptal et"
          >
            <X className="size-3" />
            <span className="sr-only">Kaldır</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
