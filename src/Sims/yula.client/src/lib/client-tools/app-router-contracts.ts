import { z } from "zod";
import type { ActionContract } from "@my-agent/core";

/**
 * Action Contract for `app_router.actions.NAVIGATE`.
 */
export const APP_ROUTER_NAVIGATE_CONTRACT = {
  description: "Navigates the user to a target page or report ({ path }).",
  inputSchema: z.object({
    path: z
      .string()
      .describe("Target page path or report route (e.g. '/stock/retail-sales-report', '/stock/stock-balance')"),
  }),
  outputSchema: z.object({
    success: z.boolean().describe("Whether navigation succeeded"),
    navigatedTo: z.string().optional().describe("Destination path navigated to"),
    error: z.string().optional().describe("Error message if navigation failed"),
  }),
  whenToCall: "When the user wants to navigate to another report, workspace, or page.",
  whenNotToCall: "When the user is already on the target screen.",
} satisfies ActionContract;

export type AppRouterNavigateInput = z.infer<typeof APP_ROUTER_NAVIGATE_CONTRACT.inputSchema>;
export type AppRouterNavigateOutput = z.infer<typeof APP_ROUTER_NAVIGATE_CONTRACT.outputSchema>;
export type AppRouterAction = "NAVIGATE";

