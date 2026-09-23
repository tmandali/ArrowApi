import { z } from "zod";
import type { ActionContract, EventContract } from "@my-agent/core";

/**
 * Deterministic Screen AI Capability Tiers.
 * - `interactive_operator`: Full DOM mutation, form editing, and UI component actions.
 * - `report_results`: Analytical inspection of DuckDB WASM grids, saved views, and SQL charts.
 * - `workspace_hub`: Module-level dashboard & global navigation only (form actions disallowed).
 * - `restricted`: Sensitive security, auth, or password screens (AI completely blocked pre-flight).
 */
export type ScreenCategory =
  | "interactive_operator"
  | "report_results"
  | "workspace_hub"
  | "restricted";

export const ScreenCategorySchema = z.enum([
  "interactive_operator",
  "report_results",
  "workspace_hub",
  "restricted",
]);

export interface ScreenContract<
  TActions extends Record<string, ActionContract> = Record<string, ActionContract>,
  TEvents extends Record<string, EventContract> = Record<string, EventContract>,
> {
  screenId: string;
  screenTitle: string;
  workspace: string;
  category: ScreenCategory;
  aiEnabled: boolean;
  actions: TActions;
  events?: TEvents;
  /**
   * next-intl translation namespace (e.g. "SkillManagement", "AgentManagement").
   * When provided, useScreenBinding automatically resolves quick prompts and action descriptions.
   */
  i18nNamespace?: string;
  /**
   * Translation keys for quick action prompts displayed in chat dock.
   */
  quickPromptKeys?: string[];
  /**
   * Encapsulated domain rules/guidelines dynamically injected into LLM system prompt
   * ONLY when this screen is active on the DOM.
   */
  promptGuidelines?: string[];
  /**
   * Zod schema validating the live state mirrored upstream to LLM.
   */
  stateSchema?: z.ZodTypeAny;
  meta?: Record<string, unknown>;
}

/**
 * Creates a code-safe, type-checked ScreenContract definition.
 */
export function defineScreenContract<
  TActions extends Record<string, ActionContract> = Record<string, ActionContract>,
  TEvents extends Record<string, EventContract> = Record<string, EventContract>,
>(contract: ScreenContract<TActions, TEvents>): ScreenContract<TActions, TEvents> {
  return contract;
}

/**
 * Resolves the deterministic ScreenCategory for any given pathname.
 * Used by the client-side Gatekeeper to intercept requests before calling LLM APIs.
 */
export function resolveRouteCategory(pathname: string): ScreenCategory {
  const clean = pathname.split("?")[0] || "/";

  // 1. Restricted / Auth Boundaries
  if (
    clean.startsWith("/(auth)") ||
    clean.startsWith("/sign-in") ||
    clean.startsWith("/sign-up") ||
    clean.startsWith("/forgot-password") ||
    clean.startsWith("/login")
  ) {
    return "restricted";
  }

  // 2. Report Results Screens (Single-page reports with DuckDB grids)
  if (
    clean.includes("/stock-balance") ||
    clean.includes("/stock-analytics") ||
    clean.includes("/retail-sales-report") ||
    clean.includes("/stock-ledger")
  ) {
    return "report_results";
  }

  // 3. Interactive Management & Entity Screens
  if (
    clean.startsWith("/my/") ||
    clean.startsWith("/system/") ||
    clean.startsWith("/agents/") ||
    clean === "/stock/item"
  ) {
    return "interactive_operator";
  }

  // 4. Default to Workspace Hub for module landing pages and root
  return "workspace_hub";
}

/**
 * Checks whether an active screen route is allowed to invoke LLM turn streaming.
 */
export function isAiAllowedOnRoute(pathname: string): boolean {
  return resolveRouteCategory(pathname) !== "restricted";
}
