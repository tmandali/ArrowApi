/**
 * @file playbook-subagent.ts
 * Isolated Playbook Knowledge & Procedural Memory Sub-Agent.
 * Implements the Vercel AI SDK "Tool-as-a-Subagent" (Nested Worker) pattern.
 * Resolves user business intent into concrete verified recipes and DAGs
 * without polluting the Level-0 system prompt or main conversation context.
 */

import { generateText, tool } from "ai";
import { z } from "zod";
import type { PlaybookEntry, PlaybookIndexItem } from "@my-agent/core";
import { serverPlaybookService, serverPlaybookStorage } from "../playbook-server";
import { getYulaLanguageModel } from "../yula-provider";
import { resolveProvider } from "../yula-config";

export interface PlaybookSubagentParams {
  task: string;
  workspace?: string;
  provider?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface PlaybookRetrievalResult {
  status: "ok" | "not_found" | "fallback";
  matched: boolean;
  confidence: number;
  recipe?: PlaybookEntry | null;
  screenRules?: string[];
  relevantIndex?: PlaybookIndexItem[];
  explanation: string;
}

const DEFAULT_TIMEOUT_MS = 3500;

/**
 * Executes the isolated Playbook Retrieval Sub-Agent.
 * Falls back to deterministic local index search if the LLM fails or times out.
 */
export async function runPlaybookSubagent(
  params: PlaybookSubagentParams,
): Promise<PlaybookRetrievalResult> {
  const { task, workspace = "stock", provider, baseUrl, timeoutMs = DEFAULT_TIMEOUT_MS } = params;
  const wsId = workspace || "stock";

  // 1. Zero-latency pre-check: If index is completely empty, return immediately
  let index: PlaybookIndexItem[] = [];
  try {
    index = await serverPlaybookStorage.readIndex(wsId);
  } catch {
    index = [];
  }

  // Always fetch screen rules for the task if task is a route
  let screenRules: string[] = [];
  try {
    screenRules = await serverPlaybookService.getScreenRules(task, wsId);
  } catch {
    screenRules = [];
  }

  if (index.length === 0 && screenRules.length === 0) {
    return {
      status: "not_found",
      matched: false,
      confidence: 0,
      recipe: null,
      screenRules: [],
      relevantIndex: [],
      explanation: `No verified recipes or operational rules exist for workspace "${wsId}".`,
    };
  }

  // 2. Sub-agent Runner with strict timeout
  try {
    const activeProvider = resolveProvider(provider);
    const model = getYulaLanguageModel(undefined, {
      provider: activeProvider,
      baseUrl,
    });

    let chosenRecipe: any = null;
    let finishResolution: { matched: boolean; recipe_id?: string; confidence: number; explanation: string } | null = null;

    const subagentTools = {
      search_catalog: tool({
        description: "Search workspace playbook index items by keywords, screen route, or topic.",
        inputSchema: z.object({
          query: z.string().describe("Keywords to search index titles and summaries"),
        }),
        execute: async ({ query }) => {
          const q = query.toLowerCase();
          const matches = index.filter(
            (i) =>
              i.title.toLowerCase().includes(q) ||
              (i.summary && i.summary.toLowerCase().includes(q)) ||
              (i.targetPath && i.targetPath.toLowerCase().includes(q)),
          );
          return matches.slice(0, 5).map((m) => ({
            id: m.id,
            title: m.title,
            category: m.category,
            targetPath: m.targetPath,
            summary: m.summary,
          }));
        },
      }),

      inspect_recipe: tool({
        description: "Inspect the full procedural recipe, markdown content, and DAG steps for a candidate recipe ID.",
        inputSchema: z.object({
          recipe_id: z.string().describe("Candidate recipe ID to inspect"),
        }),
        execute: async ({ recipe_id }) => {
          const entries = await serverPlaybookStorage.readEntries(wsId);
          const found = entries.find((e) => e.id === recipe_id && e.status !== "draft");
          if (found) {
            chosenRecipe = found;
            return {
              id: found.id,
              title: found.title,
              targetPath: found.targetPath,
              summary: found.contentMarkdown.split("\n")[0] || found.title,
              stepCount: found.graph?.nodes?.length ?? 0,
              contentMarkdown: found.contentMarkdown,
            };
          }
          return { error: `Recipe "${recipe_id}" not found or still in draft.` };
        },
      }),

      submit_verdict: tool({
        description: "Submit the final verified playbook matching verdict.",
        inputSchema: z.object({
          matched: z.boolean().describe("Whether a verified matching recipe was confirmed"),
          recipe_id: z.string().optional().describe("ID of the confirmed recipe if matched"),
          confidence: z.number().min(0).max(1).describe("Confidence score between 0.0 and 1.0"),
          explanation: z.string().describe("Explanation of the match or why no recipe fits the user intent"),
        }),
        execute: async (args) => {
          finishResolution = args;
          return { status: "recorded", ...args };
        },
      }),
    };

    // Sub-agent system prompt
    const systemPrompt = [
      "You are the Corporate Knowledge & Workflow Playbook Specialist.",
      "Your sole mission is to analyze the user's business intent, search the enterprise playbook index, and retrieve the exact matching procedural recipe with high precision.",
      "Rules:",
      "1. Check the catalog using 'search_catalog'.",
      "2. If candidate recipes are found, inspect the most promising one using 'inspect_recipe'.",
      "3. Conclude by calling 'submit_verdict' with your match assessment and confidence score.",
      "4. Do NOT engage in casual chit-chat. Be precise, technical, and grounded.",
      "5. If no recipe matches the intent, call 'submit_verdict' with matched=false.",
    ].join("\n");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      await (generateText as any)({
        model: model as any,
        system: systemPrompt,
        prompt: `Analyze user intent and find matching playbook recipe for: "${task}" in workspace "${wsId}". Catalog index count: ${index.length}.`,
        tools: subagentTools,
        maxSteps: 3,
        abortSignal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    // Process verdict
    let resolvedRecipe: PlaybookEntry | null = chosenRecipe;
    if (finishResolution && (finishResolution as any).matched && (finishResolution as any).recipe_id) {
      if (!resolvedRecipe || resolvedRecipe.id !== (finishResolution as any).recipe_id) {
        const entries = await serverPlaybookStorage.readEntries(wsId);
        resolvedRecipe = entries.find((e) => e.id === (finishResolution as any).recipe_id) || null;
      }
      if (resolvedRecipe) {
        return {
          status: "ok",
          matched: true,
          confidence: (finishResolution as any).confidence ?? 0.9,
          recipe: resolvedRecipe,
          screenRules,
          relevantIndex: index.filter((i) => i.id === resolvedRecipe?.id),
          explanation: (finishResolution as any).explanation || `Matched recipe "${resolvedRecipe.title}"`,
        };
      }
    }

    if (resolvedRecipe) {
      return {
        status: "ok",
        matched: true,
        confidence: 0.85,
        recipe: resolvedRecipe,
        screenRules,
        relevantIndex: index.filter((i) => i.id === resolvedRecipe?.id),
        explanation: `Found verified recipe "${resolvedRecipe.title}" matching user intent.`,
      };
    }

    if (finishResolution && !(finishResolution as any).matched) {
      return {
        status: "not_found",
        matched: false,
        confidence: 0,
        recipe: null,
        screenRules,
        relevantIndex: [],
        explanation: (finishResolution as any).explanation || "No matching playbook recipe found for this task.",
      };
    }
  } catch (err) {
    // LLM failed or timed out — seamlessly drop into deterministic fallback
    console.warn("⚠️ [Playbook Sub-Agent] Falling back to deterministic search due to:", err);
  }

  // 3. Resilient Deterministic Fallback (Pi Grounding)
  return runDeterministicFallback(task, wsId, index, screenRules);
}

/**
 * Fast, deterministic fallback matching via string overlap and token scanning.
 */
async function runDeterministicFallback(
  task: string,
  wsId: string,
  index: PlaybookIndexItem[],
  screenRules: string[],
): Promise<PlaybookRetrievalResult> {
  const fallbackRecipe = await serverPlaybookService.findRecipe(task, wsId);
  const q = task.toLowerCase();
  const relevantIndex = index.filter(
    (i) =>
      i.title.toLowerCase().includes(q) ||
      (i.targetPath && i.targetPath.toLowerCase().includes(q)) ||
      (i.summary && i.summary.toLowerCase().includes(q)),
  );

  if (fallbackRecipe) {
    return {
      status: "fallback",
      matched: true,
      confidence: 0.75,
      recipe: fallbackRecipe,
      screenRules,
      relevantIndex: relevantIndex.length > 0 ? relevantIndex : index.filter((i) => i.id === fallbackRecipe.id),
      explanation: `Matched recipe "${fallbackRecipe.title}" via local deterministic search.`,
    };
  }

  return {
    status: "not_found",
    matched: false,
    confidence: 0,
    recipe: null,
    screenRules,
    relevantIndex,
    explanation: `No verified playbook recipe found for "${task}" in workspace "${wsId}".`,
  };
}
