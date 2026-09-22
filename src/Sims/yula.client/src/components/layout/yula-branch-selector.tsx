"use client";

import * as React from "react";
import { GitBranch, GitFork, Check } from "lucide-react";
import { useChatsStore } from "@/lib/stores/chats";

export function YulaBranchSelector() {
  const activeId = useChatsStore((s) => s.activeId);
  const conversations = useChatsStore((s) => s.conversations);
  const forkBranch = useChatsStore((s) => s.forkBranch);
  const switchBranch = useChatsStore((s) => s.switchBranch);

  const [isOpen, setIsOpen] = React.useState(false);
  const [isForking, setIsForking] = React.useState(false);
  const [newBranchName, setNewBranchName] = React.useState("");

  const activeConv = React.useMemo(
    () => conversations.find((c) => c.id === activeId),
    [conversations, activeId]
  );

  if (!activeConv || !activeId) return null;

  const currentBranch = activeConv.activeBranch || "main";
  const branches = activeConv.branches || {
    main: { name: "main", createdAt: activeConv.createdAt },
  };
  const branchKeys = Object.keys(branches);

  const handleCreateFork = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newBranchName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    if (!clean || branches[clean]) return;
    forkBranch(activeId, clean);
    setNewBranchName("");
    setIsForking(false);
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition hover:border-border hover:bg-muted hover:text-foreground"
        title="Oturum Dallanması (Session Branch)"
      >
        <GitBranch className="size-3 text-emerald-500" />
        <span className="max-w-[100px] truncate">{currentBranch}</span>
        {branchKeys.length > 1 && (
          <span className="rounded-full bg-emerald-500/10 px-1 text-[9px] text-emerald-600 font-semibold">
            {branchKeys.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-1.5 z-50 w-56 rounded-md border border-border bg-popover p-1.5 shadow-md">
          <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground">
            Oturum Dalları ({branchKeys.length})
          </div>

          <div className="my-1 space-y-0.5 max-h-40 overflow-y-auto">
            {branchKeys.map((bName) => (
              <button
                key={bName}
                type="button"
                onClick={() => {
                  switchBranch(activeId, bName);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs transition ${
                  bName === currentBranch
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-foreground/80 hover:bg-muted"
                }`}
              >
                <span className="truncate">🌿 {bName}</span>
                {bName === currentBranch && <Check className="size-3 text-emerald-500" />}
              </button>
            ))}
          </div>

          <div className="mt-1 border-t border-border/50 pt-1">
            {isForking ? (
              <form onSubmit={handleCreateFork} className="flex flex-col gap-1 p-1">
                <input
                  type="text"
                  placeholder="dal-adı (örn. senaryo-1)"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  autoFocus
                  className="w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => setIsForking(false)}
                    className="px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="submit"
                    disabled={!newBranchName.trim()}
                    className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Dal Aç
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setIsForking(true)}
                className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <GitFork className="size-3" />
                <span>Yeni Dal Aç (Fork)</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
