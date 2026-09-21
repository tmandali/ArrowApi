import { tool } from "ai";
import { z } from "zod";

/**
 * Thinking Tool: synthesize_collected_information
 * Direct Reference: ServiceNow AgentArch (arXiv:2509.10769) Appendix B.1
 *
 * Provides non-reasoning models with a dedicated scratchpad to perform
 * intermediate analysis, multi-step date arithmetic, and business rule cross-checks
 * before triggering mutations or final decisions.
 *
 * Has zero side-effects on the UI, returning the synthesis directly back
 * into the agent's observation history.
 */
export const synthesizeCollectedInformationTool = tool({
  description: [
    "Scratchpad tool for step-by-step reasoning, date interval calculations, and multi-step data synthesis.",
    "Use this before dispatching mutations to verify complex date ranges (e.g. fiscal quarters, leap years, month boundaries),",
    "reconcile stock balances across stores, or organize criteria parameters.",
    "This tool has ZERO side-effects on the UI or database."
  ].join(" "),
  inputSchema: z.object({
    synthesis: z
      .string()
      .describe("Step-by-step reasoning, date arithmetic, balance comparisons, or synthesized parameters"),
  }),
  outputSchema: z.object({
    acknowledgment: z.string(),
  }),
  execute: async ({ synthesis }) => {
    return {
      acknowledgment: synthesis,
    };
  },
});

export const THINKING_TOOLS = {
  synthesize_collected_information: synthesizeCollectedInformationTool,
};

export type ThinkingTools = typeof THINKING_TOOLS;
