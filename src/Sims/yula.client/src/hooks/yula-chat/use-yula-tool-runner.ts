"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { YulaMessage, YulaTools } from "@/app/api/agent/chat/route";
import {
  SERVER_EXECUTED_TOOLS,
  DEDUPE_SKIP_MARKER,
} from "@/lib/yula-tool-info";
import { executeClientTool } from "@/lib/yula-client-tools";
import {
  blockedIncompleteIntent,
  hasExplicitReportRunIntent,
} from "@/lib/report-run-intent";
import { useChatsStore } from "@/lib/stores/chats";
import { useYulaDockStore } from "@/lib/stores/dock";
import { upsertTurnTrace } from "@/lib/yula-turn-trace";
import { lastUserTextFromMessages } from "./chat-loop-policy";
import {
  stableSignature,
  isApplyNavigateOutput,
  waitForPathname,
  getActiveConversationId,
} from "./chat-shared";

type ChatHelpers = UseChatHelpers<YulaMessage>;

export type PendingToolPart = {
  toolCallId: string;
  toolName: string;
  input?: unknown;
  state?: string;
};

/**
 * İstemci-tarafı araç yürütücüsü — orijinal ChatInstance.runPendingTool
 * gövdesinin birebir taşınmış hali (davranış değişikliği yok).
 */
export function useYulaToolRunner(
  chat: ChatHelpers,
  executedCallsRef: { current: Map<string, string> },
) {
  const router = useRouter();

  return React.useCallback(
    async (
      part: PendingToolPart,
      opts?: { skipAsDuplicate?: string },
    ) => {
      if (part.state && part.state !== "input-available") return;
      // Sunucu-execute araçlar istemcide koşmaz (çift yürütme + bozuk resubmit).
      if (SERVER_EXECUTED_TOOLS.has(part.toolName)) return;
      // Aynı-adım yinelenen soru: koşturmadan dedupe çıktısıyla kapat
      // (kart render edilmez, tur terminal kalır, modele tekrar sinyali gider).
      if (opts?.skipAsDuplicate) {
        console.info(
          `[Yula Agent Loop] aynı adımdaki yinelenen soru çağrısı atlandı → ${part.toolCallId}`,
        );
        chat.addToolOutput({
          tool: part.toolName as keyof YulaTools,
          toolCallId: part.toolCallId,
          state: "output-error",
          errorText: opts.skipAsDuplicate,
        });
        return;
      }
      // Yürütme tamamen patlarsa bile SDK kanonik hata çıktısı ekle
      // (state:"output-error" + errorText) — aksi halde satır "Çalışıyor…"da
      // asılı kalır ve resubmit hatalı geçmişle sunucuda patlar.
      // Tekrar-çağrı kesici: aynı araç + aynı girdi bu turda zaten koştuysa
      // yeniden ÇALIŞTIRMA; modele düzeltme sinyali ver (SDK sözleşmesi:
      // state:"output-error" + errorText).
      const callSignature = `${part.toolName}:${stableSignature(part.input ?? null)}`;
      if (executedCallsRef.current.has(callSignature)) {
        chat.addToolOutput({
          tool: part.toolName as keyof YulaTools,
          toolCallId: part.toolCallId,
          state: "output-error",
          errorText:
            DEDUPE_SKIP_MARKER +
            " and the result would not change. " +
            "Do not call the same tool again; give your final answer in one go with the results at hand.",
        });
        return;
      }

      let output: unknown;
      let errorText: string | undefined;
      try {
        const userText = lastUserTextFromMessages(chat.messages);
        const gatedRun =
          part.toolName === "run_job" && !hasExplicitReportRunIntent(userText);

        if (gatedRun) {
          output = blockedIncompleteIntent("run_job");
        } else {
          const timeoutMs =
            part.toolName === "profile_grid_table" ||
            part.toolName === "run_expert_sql"
              ? 45_000
              : 25_000;
          output = await Promise.race([
            executeClientTool(part.toolName, part.input),
            new Promise<never>((_, reject) => {
              window.setTimeout(() => {
                reject(
                  new Error(
                    `${part.toolName} ${Math.round(timeoutMs / 1000)} sn içinde bitmedi. Tablo yükleniyor veya meşgul olabilir — Durdur'a basıp birkaç saniye sonra tekrar deneyin.`,
                  ),
                );
              }, timeoutMs);
            }),
          ]);
        }
      } catch (err) {
        console.warn("[Yula exec] araç yürütme hatası:", part.toolName, err);
        output = undefined;
        errorText = err instanceof Error ? err.message : String(err);
      }
      executedCallsRef.current.set(callSignature, "");

      if (part.toolName === "run_job") {
        // Statik araç → outputSchema tipiyle birebir (cast yok)
        chat.addToolOutput({
          tool: part.toolName as keyof YulaTools,
          toolCallId: part.toolCallId,
          state: "output-available",
          output: output as YulaTools["run_job"]["output"],
        });
      } else if (part.toolName === "apply_criteria") {
        // Navigating apply: navigate to the target screen and wait for arrival
        // BEFORE appending the output — the resubmit then carries the fresh
        // pathname/screenState, and the model continues with the confirmation
        // sentence/link (or run_job on explicit run intent).
        // On timeout the output is still appended, so the model writes the link fallback.
        if (isApplyNavigateOutput(output)) {
          const target = (output as Record<string, unknown>).navigateTo as string;
          useChatsStore.getState().beginConversationFollow(getActiveConversationId());
          useYulaDockStore.getState().setOpen(true);
          void router.push(target);
          await waitForPathname(target);
        }
        chat.addToolOutput({
          tool: "apply_criteria",
          toolCallId: part.toolCallId,
          state: "output-available",
          output: output as YulaTools["apply_criteria"]["output"],
        });
      } else if (part.toolName === "navigate_to_page") {
        chat.addToolOutput({
          tool: "navigate_to_page",
          toolCallId: part.toolCallId,
          state: "output-available",
          output: output as YulaTools["navigate_to_page"]["output"],
        });
      } else if (errorText !== undefined) {
        // SDK ToolUIPart sözleşmesi: hata → state:"output-error" + errorText
        chat.addToolOutput({
          tool: part.toolName as keyof YulaTools,
          toolCallId: part.toolCallId,
          state: "output-error",
          errorText,
        });
      } else {
        // Dinamik grid araçları → runtime şema; isim cast'i SDK deseni
        chat.addToolOutput({
          tool: part.toolName as keyof YulaTools,
          toolCallId: part.toolCallId,
          state: "output-available",
          output: output as never,
        });
      }

      // Prepare-chain telemetrisi: zincir araçlarının sonucu tek satırda
      // (schema → apply → navigate → run). Atlanan/hata veren adımın nedeni
      // "yarım kaldı" teşhisinde 10 saniyede görünür.
      if (
        part.toolName === "apply_criteria" ||
        part.toolName === "navigate_to_page" ||
        part.toolName === "run_job" ||
        part.toolName === "get_report_schema" ||
        part.toolName === "find_matching_report"
      ) {
        const statusText =
          typeof output === "object" && output !== null
            ? String((output as Record<string, unknown>).status ?? "")
            : "";
        const chainLabel =
          part.toolName === "get_report_schema"
            ? "Zincir: şema"
            : part.toolName === "find_matching_report"
              ? "Zincir: eşleşme"
              : part.toolName === "apply_criteria"
                ? "Zincir: kriter doldurma"
                : part.toolName === "navigate_to_page"
                  ? "Zincir: yönlendirme"
                  : "Zincir: çalıştırma";
        upsertTurnTrace(getActiveConversationId(), {
          id: `prepare-chain:${part.toolCallId}`,
          toolName: part.toolName,
          label: chainLabel,
          subLabel: statusText || (errorText ? "hata" : "ok"),
          isError:
            errorText !== undefined ||
            statusText === "error" ||
            statusText === "validation-error" ||
            statusText === "blocked",
          detailText:
            errorText ??
            (statusText && statusText !== "ok" && statusText !== "navigated" && statusText !== "executed"
              ? `Durum: ${statusText} — zincir bu adımda durdu.`
              : undefined),
          input: part.input,
        });
      }

      const execOut =
        typeof output === "object" && output !== null
          ? (output as Record<string, unknown>)
          : undefined;

      // Route when a real job opened or a page navigation was requested.
      // (apply_criteria navigation is handled above, with arrival awaited.)
      if (
        (execOut?.status === "executed" || execOut?.status === "navigated") &&
        typeof execOut.navigateTo === "string"
      ) {
        useChatsStore.getState().beginConversationFollow(getActiveConversationId());
        useYulaDockStore.getState().setOpen(true);
        void router.push(execOut.navigateTo as string);
      }
      // sendAutomaticallyWhen=true → resubmission SDK tarafında otomatik
    },
    [chat, router, executedCallsRef],
  );
}
