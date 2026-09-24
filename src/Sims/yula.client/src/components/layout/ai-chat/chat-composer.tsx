"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/utils/cn";
import {
  ArrowUp, FileCode, FileText, History, ListOrdered, Plus, Square, X, Zap,
} from "lucide-react";
import { formatHistoryAgo } from "./use-history-suggestions";
import type { ChatComposerState } from "./use-chat-composer";
import { HitlDecisionComposer } from "./hitl-decision-composer";

/** Sohbet besteci görünümü: komut paleti + geçmiş önerileri + girdi formu. */
export function ChatComposer({
  composer,
  isLoading,
  onStop,
}: {
  composer: ChatComposerState;
  isLoading: boolean;
  onStop: () => void;
}) {
  const t = useTranslations("ChatAssistant");
  const locale = useLocale();
  const router = useRouter();
  const {
    input, setInput, attachments, setAttachments, selectedCommand, pastedChip, setPastedChip,
    selectedIndex, setSelectedIndex, historyIndex, setHistoryIndex, setHistoryClosed,
    fileInputRef, textareaRef, commandMatches, isRefreshingModels, showCommands,
    showNewAgentItem, paletteItemCount, isNewAgentSelected, historySuggestions,
    showHistory, openHistoryConversation, handleSend, handleSteer, handleFollowUp,
    applyCommand, onFilesSelected, canSubmit, modelTag, closeCommands,
    isModelSubmenu, isProviderSubmenu, isSuspended, pendingChoice, respondToChoice,
  } = composer;

  const commandPaletteRef = React.useRef<HTMLDivElement>(null);
  const historyPaletteRef = React.useRef<HTMLDivElement>(null);

  const selectedCommandValue = isNewAgentSelected
    ? "__new-agent__"
    : (commandMatches?.[selectedIndex]?.slash ?? "");

  const selectedHistoryValue = historySuggestions[historyIndex]?.text ?? "";

  React.useEffect(() => {
    if (!showCommands) return;
    commandPaletteRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, showCommands]);

  React.useEffect(() => {
    if (!showHistory) return;
    historyPaletteRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [historyIndex, showHistory]);

  React.useEffect(() => {
    if (!showCommands) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeCommands();
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (commandPaletteRef.current && !commandPaletteRef.current.contains(target) && textareaRef.current && !textareaRef.current.contains(target)) {
        closeCommands();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showCommands, closeCommands, textareaRef]);

  // HITL (Human-in-the-Loop) Decision & Approval Gate
  if (isSuspended && pendingChoice) {
    return (
      <HitlDecisionComposer
        prompt={pendingChoice}
        onSubmit={(val) => {
          if (respondToChoice) {
            respondToChoice(val);
          } else {
            handleSend(val);
          }
        }}
        disabled={false}
      />
    );
  }

  const paletteTitle = isModelSubmenu
    ? (locale === "tr" ? "Modeller" : "Models")
    : isProviderSubmenu
      ? (locale === "tr" ? "Sağlayıcılar" : "Providers")
      : (locale === "tr" ? "Komutlar" : "Commands");

  return (
    <div className="relative mx-auto w-full max-w-3xl shrink-0 space-y-1.5 px-3 pb-2 pt-1.5">
      {showCommands ? (
        <div
          ref={commandPaletteRef}
          className="absolute inset-x-3 bottom-full z-20 mb-1.5 overflow-hidden rounded-xl border border-border/80 bg-popover/95 backdrop-blur-md shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-border/40 px-2.5 py-1 text-[11px] text-muted-foreground bg-muted/20 select-none">
            <span className="font-medium text-[10.5px]">{paletteTitle}</span>
            <button
              type="button"
              onClick={closeCommands}
              className="size-5 flex items-center justify-center rounded text-muted-foreground/70 hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
              aria-label="Kapat"
              title="Kapat (Esc)"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <Command
            shouldFilter={false}
            disablePointerSelection
            value={selectedCommandValue}
            className="p-1"
          >
            <CommandList className="max-h-56 overflow-y-auto overscroll-contain [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/50">
              <CommandEmpty className="py-2 text-[11px] text-muted-foreground text-center">
                {t("command_empty")}
              </CommandEmpty>
              <CommandGroup className="p-0">
                {(commandMatches ?? []).map((command, idx) => {
                  const Icon = command.icon;
                  const isSelected = idx === selectedIndex;
                  return (
                    <CommandItem
                      key={command.id}
                      value={command.slash}
                      onSelect={() => applyCommand(command)}
                      onMouseMove={(e) => { if (e.movementX !== 0 || e.movementY !== 0) if (!isSelected) setSelectedIndex(idx); }}
                      data-active={isSelected ? "true" : undefined}
                      className={cn("flex items-center gap-2 rounded-lg px-2 py-1 text-[11.5px] cursor-pointer min-h-0 transition-colors", isSelected ? "bg-accent text-accent-foreground font-medium" : "hover:bg-accent/80")}
                    >
                      <Icon className={cn("size-3.5 shrink-0", command.badgeVariant === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-primary", command.id === "model:refresh" && isRefreshingModels && "animate-spin")} />
                      <span className="font-semibold text-foreground shrink-0">/{command.slash}</span>
                      <span className="text-[10.5px] text-muted-foreground truncate flex-1 min-w-0">{command.description || command.label}</span>
                      {command.badge ? (
                        <span className={cn(
                          "shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-medium transition-colors",
                          command.badgeVariant === "active" && "border border-primary/30 bg-primary/10 text-primary font-semibold",
                          command.badgeVariant === "success" && "border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                          command.badgeVariant !== "active" && command.badgeVariant !== "success" && "border border-border/60 bg-muted/40 text-muted-foreground"
                        )}>
                          {(command.badgeVariant === "active" || command.badgeVariant === "success") && (
                            <span className={cn("size-1.5 rounded-full shrink-0", command.badgeVariant === "active" ? "bg-primary" : "bg-emerald-500")} />
                          )}
                          {command.badge}
                        </span>
                      ) : command.source === "user" ? (
                        <span className="shrink-0 rounded border border-primary/30 bg-primary/10 px-1 py-px text-[9.5px] font-medium text-primary">skill</span>
                      ) : null}
                    </CommandItem>
                  );
                })}
                {showNewAgentItem ? (
                  <CommandItem
                    value="__new-agent__"
                    onSelect={() => router.push("/my/agents")}
                    onMouseMove={(e) => { if (e.movementX !== 0 || e.movementY !== 0) if (!isNewAgentSelected) setSelectedIndex(commandMatches?.length ?? 0); }}
                    data-active={isNewAgentSelected ? "true" : undefined}
                    className={cn("flex items-center gap-2 rounded-lg px-2 py-1 text-[11.5px] cursor-pointer min-h-0 transition-colors", isNewAgentSelected ? "bg-accent text-accent-foreground font-medium" : "hover:bg-accent/80")}
                  >
                    <Plus className="size-3.5 text-primary shrink-0" />
                    <span className="font-semibold text-foreground shrink-0">{t("agent_create")}</span>
                    <span className="text-[10.5px] text-muted-foreground truncate flex-1 min-w-0">{t("agent_manage_open")}</span>
                  </CommandItem>
                ) : null}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      ) : showHistory ? (
        <div
          ref={historyPaletteRef}
          className="absolute inset-x-3 bottom-full z-20 mb-1.5 overflow-hidden rounded-xl border border-border/80 bg-popover/95 backdrop-blur-md shadow-lg"
        >
          <div className="px-2.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            {t("history_suggestions")}
          </div>
          <Command
            shouldFilter={false}
            disablePointerSelection
            value={selectedHistoryValue}
            className="p-1 pt-0.5"
          >
            <CommandList className="max-h-56 overflow-y-auto overscroll-contain [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
              <CommandGroup className="p-0">
                {historySuggestions.map((s, idx) => (
                  <CommandItem
                    key={`${s.convId}-${s.text.slice(0, 48)}-${idx}`}
                    value={s.text}
                    onSelect={() => openHistoryConversation(s.convId)}
                    onMouseMove={(e) => { if (e.movementX !== 0 || e.movementY !== 0) setHistoryIndex(idx); }}
                    data-active={idx === historyIndex ? "true" : undefined}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2 py-1 text-[11.5px] cursor-pointer min-h-0 transition-colors",
                      idx === historyIndex ? "bg-accent text-accent-foreground font-medium" : "hover:bg-accent/80"
                    )}
                  >
                    <History className="size-3.5 text-primary shrink-0" />
                    <span className="truncate flex-1 min-w-0 text-foreground">{s.text.length > 120 ? `${s.text.slice(0, 120)}…` : s.text}</span>
                    <span className="shrink-0 text-[10px] font-medium text-muted-foreground/70">{formatHistoryAgo(s.createdAt, t)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      ) : null}

      {isLoading ? (
        <p className="px-1 text-[11px] text-muted-foreground">
          {t("still_answering")}
        </p>
      ) : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (showCommands && commandMatches?.length) {
            const target = commandMatches[selectedIndex] ?? commandMatches[0];
            if (target) {
              applyCommand(target);
              return;
            }
          }
          if (isLoading) handleSteer();
          else handleSend();
        }}
        className="rounded-xl border border-primary/15 bg-card p-1.5 shadow-sm focus-within:border-primary/35 focus-within:ring-2 focus-within:ring-primary/15 dark:border-primary/20"
      >
        <div className="flex flex-wrap items-center gap-1.5 px-1 py-0.5 min-h-[36px]">
          {selectedCommand ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-semibold text-primary select-none animate-in fade-in zoom-in-95 duration-150">
              {React.createElement(selectedCommand.icon, { className: "size-3.5 shrink-0 text-primary" })}
              <span className="truncate">{selectedCommand.label}</span>
            </span>
          ) : null}

          {pastedChip ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-semibold text-orange-600 dark:text-orange-400 select-none animate-in fade-in zoom-in-95 duration-150">
              <FileCode className="size-3.5 shrink-0 text-orange-500" />
              <span className="max-w-[220px] truncate">{pastedChip.preview}</span>
            </span>
          ) : null}

          {attachments.map((file) => (
            <span key={file.id} className="inline-flex shrink-0 max-w-full items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
              <FileText className="size-3 shrink-0" />
              <span className="truncate">{file.name}</span>
              <button
                type="button"
                className="rounded-full p-0.5 hover:bg-muted hover:text-foreground cursor-pointer"
                onClick={() => setAttachments((current) => current.filter((item) => item.id !== file.id))}
                aria-label={t("remove_attachment", { name: file.name })}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}

          <textarea
            ref={textareaRef}
            value={input}
            rows={1}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                if (showCommands) {
                  event.preventDefault();
                  closeCommands();
                  return;
                }
                if (showHistory) {
                  event.preventDefault();
                  setHistoryClosed(true);
                  return;
                }
              }

              if (showCommands && paletteItemCount > 0) {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setSelectedIndex((prev) => (prev + 1) % paletteItemCount);
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setSelectedIndex((prev) => (prev - 1 + paletteItemCount) % paletteItemCount);
                  return;
                }
                if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey) {
                  event.preventDefault();
                  if (isNewAgentSelected) {
                    router.push("/my/agents");
                    return;
                  }
                  const targetCmd = commandMatches?.[selectedIndex] ?? commandMatches?.[0];
                  if (targetCmd) applyCommand(targetCmd);
                  return;
                }
              }

              if (showHistory) {
                if (event.key === "ArrowDown") { event.preventDefault(); setHistoryIndex((prev) => (prev + 1) % historySuggestions.length); return; }
                if (event.key === "ArrowUp") { event.preventDefault(); setHistoryIndex((prev) => (prev - 1 + historySuggestions.length) % historySuggestions.length); return; }
                if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey) {
                  event.preventDefault();
                  const target = historySuggestions[historyIndex] ?? historySuggestions[0];
                  if (target) openHistoryConversation(target.convId);
                  return;
                }
                if (event.key === "Escape") { event.preventDefault(); setHistoryClosed(true); return; }
              }

              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (isLoading) handleSteer();
                else handleSend();
              }
              if (event.key === "Backspace" && !input) {
                if (pastedChip) setPastedChip(null);
                else if (selectedCommand) composer.setSelectedCommand(null);
              }
            }}
            onPaste={(event) => {
              const items = event.clipboardData?.items;
              if (items) {
                const imageFiles = Array.from(items)
                  .filter((it) => it.type.startsWith("image/"))
                  .map((it) => it.getAsFile())
                  .filter((f): f is File => Boolean(f));
                if (imageFiles.length > 0) {
                  const dt = new DataTransfer();
                  imageFiles.forEach((f) => dt.items.add(f));
                  onFilesSelected(dt.files);
                }
              }

              const pastedText = event.clipboardData.getData("text");
              if (!pastedText) return;

              const lines = pastedText.split(/\r?\n/);
              if ((lines.length > 5 && pastedText.trim().length > 300) || pastedText.trim().length > 500) {
                event.preventDefault();
                const preview = lines.length > 5 ? t("paste_lines", { count: lines.length }) : t("paste_chars", { count: pastedText.trim().length });
                setPastedChip({ id: `paste-${Date.now()}`, content: pastedText, preview });
              }
            }}
            placeholder={
              isLoading
                ? t("input_placeholder_running")
                : composer.isSuspended
                  ? (composer.pendingChoice?.customPlaceholder || t("choice_pending_placeholder"))
                  : selectedCommand || pastedChip
                    ? t("input_placeholder_secondary")
                    : t("yula_placeholder")
            }
            className="flex-1 min-w-[120px] min-h-[28px] max-h-32 resize-none border-0 bg-transparent px-1 py-1 text-[12px] leading-relaxed outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex items-center justify-between gap-2 px-0.5 pt-0.5">
          <div className="flex items-center gap-1 min-w-0">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                onFilesSelected(event.target.files);
                event.target.value = "";
              }}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className={cn(
                "size-7 shrink-0 rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer",
                input.startsWith("/") && "bg-primary/10 text-primary font-medium"
              )}
              onClick={() => {
                setInput((prev) => (prev.startsWith("/") ? "" : "/"));
                requestAnimationFrame(() => textareaRef.current?.focus());
              }}
              aria-label={t("show_commands")}
              title={t("show_commands")}
            >
              <Plus className="size-3.5" />
            </Button>
            {modelTag ? (
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("yula:open-context-window"));
                }}
                className="text-[10.5px] text-muted-foreground/60 hover:text-muted-foreground/90 transition-colors select-none truncate max-w-[200px] cursor-pointer hover:underline"
                title={`Model: ${modelTag} (Bağlam Penceresi & Ayarlar)`}
              >
                {modelTag}
              </button>
            ) : null}
          </div>

          {isLoading ? (
            <div className="flex items-center gap-1.5 animate-in fade-in duration-150">
              <Button
                type="button"
                size="icon"
                onClick={onStop}
                className="size-7 rounded-full border border-red-500/40 bg-red-500/10 text-red-600 hover:bg-red-500/20 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-all cursor-pointer"
                aria-label={t("stop")}
                title={t("stop")}
              >
                <Square className="size-3 fill-current" />
              </Button>

              {canSubmit ? (
                <>
                  <Button type="button" size="sm" onClick={() => handleFollowUp()} className="h-7 px-2.5 rounded-full text-[11px] font-medium border border-violet-500/40 bg-violet-500/10 text-violet-700 hover:bg-violet-500/20 dark:text-violet-300 dark:border-violet-500/30 transition-all gap-1 cursor-pointer" title={t("pi_follow_up_title")}>
                    <ListOrdered className="size-3 text-violet-500 shrink-0" />
                    <span>{t("pi_follow_up_label")}</span>
                  </Button>
                  <Button type="button" size="sm" onClick={() => handleSteer()} className="h-7 px-2.5 rounded-full text-[11px] font-semibold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-xs transition-all gap-1 cursor-pointer" title={t("pi_steer_title")}>
                    <Zap className="size-3 fill-current shrink-0" />
                    <span>{t("pi_steer_label")}</span>
                  </Button>
                </>
              ) : null}
            </div>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={!canSubmit}
              className={cn(
                "size-7 rounded-full transition-all cursor-pointer",
                composer.isSuspended
                  ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 shadow-xs"
                  : "bg-gradient-to-br from-primary to-orange-500 text-primary-foreground hover:from-primary/90 hover:to-orange-500/90"
              )}
              aria-label={composer.isSuspended ? (t("confirm_send") || "Onayla") : t("send_aria")}
              title={composer.isSuspended ? (t("confirm_send") || "Onayla ve Gönder") : undefined}
            >
              <ArrowUp className="size-3.5" />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
