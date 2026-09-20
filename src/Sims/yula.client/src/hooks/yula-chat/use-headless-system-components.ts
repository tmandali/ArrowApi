"use client";

import * as React from "react";
import { z } from "zod";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  uiRegistry,
  uiEventBus,
  type ComponentSchema,
  piEventStream,
} from "@my-agent/core";
import { executeDispatchComponentAction } from "@/lib/client-tools/dispatch-bridge";
import { REGISTERED_REPORTS } from "@/features/reports/report-registry";
import { useYulaDockStore } from "@/lib/stores/dock";

/**
 * Headless UI-Agent Sistem Bileşenleri Kayıt Kancası
 * app_router, job_history ve REGISTERED_REPORTS formlarını headless olarak kaydeder.
 */
export function useHeadlessSystemComponents(router: AppRouterInstance) {
  React.useEffect(() => {
    const routerSchema: ComponentSchema = {
      id: "app_router",
      meta: { description: "Page and Route Navigator" },
      actions: {
        NAVIGATE: {
          description: "Navigates the user to a target page or report ({ path }).",
          whenToCall: "When the user wants to navigate to another report, workspace, or page.",
          whenNotToCall: "When the user is already on the target screen.",
        },
      },
    };
    uiRegistry.register(routerSchema);
    const unsubRouter = uiEventBus.subscribe("app_router", (action, payload) => {
      if (action === "NAVIGATE" && payload?.path) {
        let rawPath = String(payload.path).trim();
        const [basePath, search] = rawPath.split("?");
        const clean = basePath.replace(/^\//, "").toLowerCase();
        const matched = REGISTERED_REPORTS.find(
          (r) =>
            r.pagePath.toLowerCase() === basePath.toLowerCase() ||
            r.scope.toLowerCase() === clean ||
            clean.endsWith(r.scope.toLowerCase()) ||
            r.aliases.some((a) => a.toLowerCase() === clean),
        );
        let targetPath = matched ? matched.pagePath : basePath;
        if (search) {
          targetPath = `${targetPath}?${search}`;
        }
        useYulaDockStore.getState().setExpanded(false);
        useYulaDockStore.getState().setOpen(true);
        router.push(targetPath);
        return { success: true, navigatedTo: targetPath };
      }
      return { success: false, error: "Unknown router action" };
    });

    const jobHistorySchema: ComponentSchema = {
      id: "job_history",
      meta: { description: "Report Execution History and Job Tracker" },
      actions: {
        OPEN_LAST: {
          description: "Opens the most recently completed report result on the screen ({ report?: string }). Defaults to active report if omitted.",
          whenToCall: "When the user asks to 'open last report', 'show latest result', etc.",
          whenNotToCall: "When the user intends to execute a new report.",
        },
        LIST: {
          description: "Lists past execution jobs ({ report?: string, limit?: number }). If report is omitted, defaults to the active screen's report, or lists recent runs across all reports if not on a report screen.",
          whenToCall: "When the user asks 'how many reports ran' ('kaç rapor çalışmış'), 'which reports ran', 'show history', 'list past jobs', etc.",
          whenNotToCall: "When the user wants to execute a new report run (use SUBMIT or RUN).",
        },
        FIND: {
          description: "Searches past report executions or matching jobs ({ query, report?: string }). Defaults to active report if omitted.",
          whenToCall: "When the user wants to find a specific job, execution, or report run.",
          whenNotToCall: "When requesting the entire list or running a new report.",
        },
        CANCEL: {
          description: "Cancels an active or running job ({ jobId }).",
          whenToCall: "When the user explicitly asks to 'stop', 'abort', or 'cancel' an execution.",
          whenNotToCall: "When the job is already finished or terminated.",
        },
      },
    };
    uiRegistry.register(jobHistorySchema);
    const unsubJob = uiEventBus.subscribe("job_history", async (action, payload) => {
      let finalPayload = payload || {};
      if (!finalPayload.report) {
        const { useYulaGridStore } = await import("@/lib/stores/grid");
        const activeScope = useYulaGridStore.getState().screen?.reportScope;
        if (activeScope) {
          finalPayload = { ...finalPayload, report: activeScope };
        }
      }
      return executeDispatchComponentAction({ component_id: "job_history", action, payload: finalPayload }) as any;
    });

    // Headless Platform Rapor Kriter Formları (REGISTERED_REPORTS):
    const unsubReports: Array<() => void> = [];
    REGISTERED_REPORTS.forEach((report) => {
      const formCompId = `criteria_form:${report.scope}`;
      const formSchema: ComponentSchema = {
        id: formCompId,
        meta: {
          reportScope: report.scope,
          screenTitle: report.title,
          pagePath: report.pagePath,
          workspaceId: report.workspace,
          isHeadless: true,
        },
        events: {
          field_change: {
            description: `Triggered when criteria fields for ${report.title} are updated`,
            schema: z.object({ field: z.string(), value: z.any() }),
          },
          job_queued: {
            description: `Triggered when ${report.title} report execution starts`,
            schema: z.object({ jobId: z.string(), report: z.string() }),
          },
        },
        actions: {
          SET_FIELDS: {
            description: `Populates criteria form fields for ${report.title} without triggering execution ({ criteria }).`,
            outputSchema: z.object({ success: z.boolean(), updatedFields: z.array(z.string()).optional() }),
            whenToCall: "When the user specifies store, date, or filter parameters to fill in the form.",
            whenNotToCall: "When the user explicitly wants to run the report (call SUBMIT or RUN).",
          },
          APPLY: {
            description: `Applies criteria field values for ${report.title} and navigates to the report screen.`,
            outputSchema: z.object({ success: z.boolean(), navigatedTo: z.string().optional() }),
            whenToCall: `When the user wants to fill or update criteria for ${report.title} and inspect the form.`,
            whenNotToCall: "When the user wants to directly run the report or perform non-form operations.",
          },
          SUBMIT: {
            description: `Executes the ${report.title} report and queues the job ({ criteria, report }).`,
            outputSchema: z.object({ success: z.boolean(), jobId: z.string().optional(), queued: z.boolean().optional() }),
            whenToCall: "When the user explicitly asks to 'run', 'start', 'fetch', or 'execute' the report.",
            whenNotToCall: "When required parameters are missing or when user is only drafting criteria.",
          },
          RUN: {
            description: `Executes the ${report.title} report and navigates to the result screen.`,
            outputSchema: z.object({ success: z.boolean(), jobId: z.string().optional(), navigatedTo: z.string().optional() }),
            whenToCall: `When the user wants to execute ${report.title} and inspect the result grid.`,
            whenNotToCall: "When only drafting or setting criteria without execution.",
          },
          SCHEMA: {
            description: `Inspects the criteria schema and parameters for ${report.title}.`,
            whenToCall: `When the agent needs to discover available parameters, types, or constraints.`,
            whenNotToCall: "When the criteria schema is already known.",
          },
          READ: {
            description: `Reads current draft criteria values for ${report.title}.`,
            whenToCall: `To inspect the current values filled in the criteria form.`,
            whenNotToCall: "When assigning or overwriting new values.",
          },
          VALIDATE: {
            description: `Validates criteria input parameters against schema rules for ${report.title}.`,
            whenToCall: `To check parameter constraints and validation rules before submission.`,
            whenNotToCall: "When no criteria have been supplied.",
          },
        },
      };
      uiRegistry.register(formSchema);
      const unsub = uiEventBus.subscribe(formCompId, async (action, payload) => {
        const res = (await executeDispatchComponentAction({
          component_id: formCompId,
          action,
          payload: { ...payload, report: report.scope },
        })) as Record<string, unknown> | null;

        if (res && typeof res === "object") {
          const navTarget =
            (res.navigateTo as string) ||
            (action === "APPLY" || action === "RUN" ? report.pagePath : undefined);
          if (navTarget) {
            const navToolCallId = `nav_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            piEventStream.emit({
              type: "tool_execution_start",
              toolCallId: navToolCallId,
              toolName: "dispatch_component_action",
              args: {
                component_id: "app_router",
                action: "NAVIGATE",
                payload: { path: navTarget },
              },
            });
            let navOutcome: any;
            try {
              if (uiRegistry.get("app_router")) {
                navOutcome = uiEventBus.dispatch({
                  component_id: "app_router",
                  action: "NAVIGATE",
                  payload: { path: navTarget },
                });
              } else {
                router.push(navTarget);
                navOutcome = { success: true, result: { navigatedTo: navTarget } };
              }
            } catch (err) {
              router.push(navTarget);
              navOutcome = { success: false, error: String(err) };
            }
            const cleanNavOutput =
              navOutcome?.result ?? { success: navOutcome?.success, navigatedTo: navTarget };
            piEventStream.emit({
              type: "tool_execution_end",
              toolCallId: navToolCallId,
              toolName: "dispatch_component_action",
              result: cleanNavOutput,
              isError: !navOutcome?.success,
            });
          }
        }
        return res;
      });
      unsubReports.push(unsub);
    });

    return () => {
      unsubRouter();
      unsubJob();
      unsubReports.forEach((unsub) => unsub());
      uiRegistry.unregister("app_router");
      uiRegistry.unregister("job_history");
      REGISTERED_REPORTS.forEach((report) => {
        uiRegistry.unregister(`criteria_form:${report.scope}`);
      });
    };
  }, [router]);
}
