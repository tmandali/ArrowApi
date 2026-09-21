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
import {
  JOB_OPEN_LAST_ACTION_CONTRACT,
  JOB_DETAIL_ACTION_CONTRACT,
  JOB_LIST_ACTION_CONTRACT,
  JOB_FIND_ACTION_CONTRACT,
  JOB_CANCEL_ACTION_CONTRACT,
  JOB_SELECT_ACTION_CONTRACT,
  JOB_REFRESH_ACTION_CONTRACT,
} from "@/lib/client-tools/job-history-contracts";
import { APP_ROUTER_NAVIGATE_CONTRACT } from "@/lib/client-tools/app-router-contracts";
import {
  CRITERIA_SET_FIELDS_CONTRACT,
  CRITERIA_APPLY_CONTRACT,
  CRITERIA_SUBMIT_CONTRACT,
  CRITERIA_RUN_CONTRACT,
  CRITERIA_SCHEMA_CONTRACT,
  CRITERIA_READ_CONTRACT,
  CRITERIA_VALIDATE_CONTRACT,
} from "@/lib/client-tools/criteria-form-contracts";

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
        NAVIGATE: APP_ROUTER_NAVIGATE_CONTRACT,
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
        OPEN_LAST: JOB_OPEN_LAST_ACTION_CONTRACT,
        GET_DETAIL: JOB_DETAIL_ACTION_CONTRACT,
        LIST: JOB_LIST_ACTION_CONTRACT,
        FIND: JOB_FIND_ACTION_CONTRACT,
        CANCEL: JOB_CANCEL_ACTION_CONTRACT,
        SELECT: JOB_SELECT_ACTION_CONTRACT,
        REFRESH: JOB_REFRESH_ACTION_CONTRACT,
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
          SET_FIELDS: CRITERIA_SET_FIELDS_CONTRACT,
          APPLY: CRITERIA_APPLY_CONTRACT,
          SUBMIT: CRITERIA_SUBMIT_CONTRACT,
          RUN: CRITERIA_RUN_CONTRACT,
          SCHEMA: CRITERIA_SCHEMA_CONTRACT,
          READ: CRITERIA_READ_CONTRACT,
          VALIDATE: CRITERIA_VALIDATE_CONTRACT,
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
