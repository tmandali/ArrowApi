import type { YulaToolPartInfo } from "@/lib/yula-tool-info";
import { isFailedToolInfo, isDedupeSkipOutput } from "@/lib/yula-tool-info";
import { describeDispatchAction } from "@/lib/my-agent-pi-bridge";
import type { WorkedStepItem, WorkedStepsT } from "./yula-worked-steps";
import { mapGridToolInfoToWorkedSteps } from "./yula-worked-steps-grid";

type TranslationFn = (
  key: Parameters<WorkedStepsT>[0],
  values?: Parameters<WorkedStepsT>[1],
) => string;

export function mapToolInfoToWorkedSteps(
  info: YulaToolPartInfo,
  isLiveStreaming: boolean,
  L: TranslationFn,
): WorkedStepItem[] {
  const isError = isFailedToolInfo(info);
  const isPending = Boolean(
    isLiveStreaming &&
      info.state !== "output-available" &&
      info.state !== "output-error",
  );

  const inputObj =
    typeof info.input === "object" && info.input !== null
      ? (info.input as Record<string, unknown>)
      : {};

  const gridSteps = mapGridToolInfoToWorkedSteps(info, inputObj, isPending, isError, L);
  if (gridSteps !== null) {
    return gridSteps;
  }

  const steps: WorkedStepItem[] = [];
  const pushStep = (s: WorkedStepItem) => steps.push(s);

  switch (info.toolName) {
    case "run_job": {
      const report = typeof inputObj.report === "string" ? inputObj.report : "Report";
      const preset = typeof inputObj.presetTitle === "string" ? inputObj.presetTitle : "";
      const outStatus =
        info.output && typeof info.output === "object"
          ? (info.output as { status?: string }).status
          : undefined;
      if (outStatus === "blocked") {
        pushStep({
          id: info.toolCallId,
          kind: "explored",
          label: "Skipped job: incomplete intent",
          subLabel: "Waiting for explicit run or criteria confirmation",
          isLive: isPending,
          isError,
          info,
        });
        break;
      }
      pushStep({
        id: info.toolCallId,
        kind: "ran",
        label: preset ? `Ran Job: ${preset}` : `Ran Job: ${report}`,
        subLabel: isPending ? "Executing background report job..." : "Report execution",
        isLive: isPending,
        isError,
        info,
      });
      break;
    }
    case "apply_criteria": {
      const preset = typeof inputObj.presetTitle === "string" ? inputObj.presetTitle : "";
      const outStatus =
        info.output && typeof info.output === "object"
          ? (info.output as { status?: string }).status
          : undefined;
      if (outStatus === "blocked") {
        pushStep({
          id: info.toolCallId,
          kind: "explored",
          label: "Skipped criteria apply: incomplete intent",
          subLabel: L("confirm_waiting"),
          isLive: isPending,
          isError,
          info,
        });
        break;
      }
      pushStep({
        id: info.toolCallId,
        kind: "edited",
        label: preset ? `Applied: ${preset}` : "Applied criteria to form",
        subLabel: isPending ? "Updating criteria grid..." : "Criteria updated",
        isLive: isPending,
        isError,
        info,
      });
      break;
    }
    case "navigate_to_page": {
      const title =
        typeof inputObj.title === "string"
          ? inputObj.title
          : typeof inputObj.path === "string"
            ? inputObj.path
            : "Page navigation";
      pushStep({
        id: info.toolCallId,
        kind: "explored",
        label: `Navigated: ${title}`,
        subLabel: isPending ? "Opening page..." : "Page opened",
        isLive: isPending,
        isError,
        info,
      });
      break;
    }
    case "open_last_report": {
      pushStep({
        id: info.toolCallId,
        kind: "explored",
        label: "Opened last report job",
        subLabel: isPending ? "Finding last report job..." : "Last report opened",
        isLive: isPending,
        isError,
        info,
      });
      break;
    }
    case "find_matching_report": {
      pushStep({
        id: info.toolCallId,
        kind: "explored",
        label: "Checked for matching report",
        subLabel: isPending ? "Comparing criteria with past executions..." : "Matching check done",
        isLive: isPending,
        isError,
        info,
      });
      break;
    }
    case "request_user_confirmation": {
      const title = typeof inputObj.title === "string" ? inputObj.title : "User approval";
      pushStep({
        id: info.toolCallId,
        kind: "confirmation",
        label: `Confirmation: ${title}`,
        subLabel: isPending ? "Waiting for user confirmation..." : "User confirmation",
        isLive: false,
        isError,
        info,
      });
      break;
    }
    case "ask_user_choice": {
      const question =
        typeof inputObj.question === "string" ? inputObj.question : undefined;
      const rawOpts = (inputObj as { options?: unknown }).options;
      const count = Array.isArray(rawOpts) ? rawOpts.length : 0;
      if (isDedupeSkipOutput(info)) {
        pushStep({
          id: info.toolCallId,
          kind: "confirmation",
          label: "Duplicate choice prompt suppressed",
          subLabel: "same-step repeat — first choice kept",
          isLive: false,
          isError: false,
          info,
        });
        break;
      }
      pushStep({
        id: info.toolCallId,
        kind: "confirmation",
        label: question ? `Asked: ${question}` : "Asked user choice",
        subLabel: isPending
          ? "Waiting for user selection..."
          : count > 0
            ? `${count} options presented`
            : "User choice",
        isLive: false,
        isError,
        info,
      });
      break;
    }
    case "ask_user_question": {
      const raw = (inputObj as { questions?: unknown }).questions;
      const first =
        Array.isArray(raw) && raw.length > 0
          ? (raw[0] as { prompt?: unknown }).prompt
          : undefined;
      const count = Array.isArray(raw) ? raw.length : 0;
      if (isDedupeSkipOutput(info)) {
        pushStep({
          id: info.toolCallId,
          kind: "confirmation",
          label: "Duplicate question suppressed",
          subLabel: "same-step repeat — first question set kept",
          isLive: false,
          isError: false,
          info,
        });
        break;
      }
      pushStep({
        id: info.toolCallId,
        kind: "confirmation",
        label:
          typeof first === "string" && first
            ? `Asked user: ${first}`
            : "Asked user questions",
        subLabel: isPending
          ? "Waiting for user answers..."
          : count > 1
            ? `${count} questions answered`
            : "User answers",
        isLive: false,
        isError,
        info,
      });
      break;
    }
    case "suggest_next_steps": {
      const raw = (inputObj as { suggestions?: unknown }).suggestions;
      const items = Array.isArray(raw) ? raw : [];
      const first =
        items.length > 0
          ? (items[0] as { title?: unknown }).title
          : undefined;
      pushStep({
        id: info.toolCallId,
        kind: "confirmation",
        label:
          typeof first === "string" && first
            ? `Suggested: ${first}`
            : "Suggested next steps",
        subLabel: isPending
          ? "Preparing suggestions..."
          : items.length > 1
            ? `${items.length} suggestions presented`
            : "Suggestion presented",
        isLive: false,
        isError,
        info,
      });
      break;
    }
    case "run_user_skill": {
      const slash =
        typeof inputObj.skill === "string" && inputObj.skill
          ? inputObj.skill
          : "skill";
      const loaded =
        info.output && typeof info.output === "object"
          ? (info.output as { status?: string }).status === "loaded"
          : false;
      pushStep({
        id: info.toolCallId,
        kind: "explored",
        label: `Loaded skill: /${slash}`,
        subLabel: isPending
          ? "Loading skill instructions..."
          : loaded
            ? "Skill instructions"
            : "Skill not found",
        isLive: isPending,
        isError,
        info,
      });
      break;
    }
    case "read_user_file": {
      const file =
        typeof inputObj.file === "string" && inputObj.file
          ? inputObj.file
          : "file";
      pushStep({
        id: info.toolCallId,
        kind: "explored",
        label: `Read user file: ${file}`,
        subLabel: isPending ? "Reading attached reference..." : "Reference loaded",
        isLive: isPending,
        isError,
        info,
      });
      break;
    }
    case "dispatch_component_action": {
      const desc = describeDispatchAction(inputObj);
      const doneSub =
        desc.subLabel && !/[.…]{1,3}$/.test(desc.subLabel) ? desc.subLabel : undefined;
      pushStep({
        id: info.toolCallId,
        kind: desc.kind,
        label: desc.label,
        subLabel: isPending ? (desc.subLabel ?? "Executing operation...") : doneSub,
        isLive: isPending,
        isError,
        info,
      });
      break;
    }
    case "query_playbook": {
      const task = typeof inputObj.task === "string" ? inputObj.task : "Rules & workflows";
      const ws = typeof inputObj.workspace === "string" ? inputObj.workspace : "stock";
      const out = (info.output as any) || {};
      const rulesFound = Array.isArray(out.screenRules) ? out.screenRules.length : 0;
      const hasRecipe = Boolean(out.recipe);
      const confPct = typeof out.confidence === "number" ? Math.round(out.confidence * 100) : 100;
      const sub = isPending
        ? `🤖 Sub-Agent analiz ediyor · Searching Workspace Wiki (${ws})...`
        : rulesFound > 0
          ? `${rulesFound} rules found in Workspace Wiki (${ws}) · Sub-Agent verified`
          : hasRecipe
            ? `Workflow recipe found: ${out.recipe.title} (%${confPct} uyum · Sub-Agent verified)`
            : `Searched Workspace Wiki (${ws}) · Sub-Agent: Kayıtlı reçete yok`;
      pushStep({
        id: info.toolCallId,
        kind: "explored",
        label: `🤖 Playbook Sub-Agent · Queried Workspace Wiki (${ws}): "${task}"`,
        subLabel: sub,
        detailText: out.recipe
          ? `🤖 Playbook Sub-Agent Doğrulaması (%${confPct} Güven):\n${out.recipe.title}\n\n${out.recipe.contentMarkdown || ""}${out.message ? `\n\nNot: ${out.message}` : ""}`
          : rulesFound > 0
            ? `🤖 Playbook Sub-Agent Kuralları (${ws}):\n` + out.screenRules.map((r: string) => `• ${r}`).join("\n")
            : undefined,
        isLive: isPending,
        isError,
        info,
      });
      break;
    }
    case "propose_playbook_update": {
      const category = typeof inputObj.category === "string" ? inputObj.category : "screen_rule";
      const title = typeof inputObj.title === "string" ? inputObj.title : "Learned Rule";
      const content = typeof inputObj.content === "string" ? inputObj.content : "";
      const ws = typeof inputObj.workspace === "string" ? inputObj.workspace : "stock";
      const targetPath = typeof inputObj.target_path === "string" ? inputObj.target_path : "";
      const out = (info.output as any) || {};
      const isSaved = out.status === "saved";
      const catLabel = category === "screen_rule" ? "Screen Rule" : "Workflow Recipe";
      pushStep({
        id: info.toolCallId,
        kind: "edited",
        label: `Updated Workspace Wiki (${ws}): ${title}`,
        subLabel: isPending
          ? `Recording ${catLabel} to Workspace Wiki...`
          : isSaved
            ? `Saved to Workspace Wiki (${ws}) · ${catLabel}`
            : `Proposed ${catLabel}`,
        detailText: targetPath ? `Target: ${targetPath}\n\n${content}` : content,
        isLive: isPending,
        isError,
        info,
      });
      break;
    }
    case "remember_fact": {
      const key = typeof inputObj.key === "string" ? inputObj.key : "preference";
      const scope = typeof inputObj.scope === "string" ? inputObj.scope : "session";
      const val = typeof inputObj.value === "object" ? JSON.stringify(inputObj.value) : String(inputObj.value ?? "");
      pushStep({
        id: info.toolCallId,
        kind: "edited",
        label: `Saved memory preference: ${key}`,
        subLabel: isPending ? "Storing preference..." : `Scope: ${scope} · ${val}`,
        detailText: val,
        isLive: isPending,
        isError,
        info,
      });
      break;
    }
    case "recall_fact": {
      const key = typeof inputObj.key === "string" && inputObj.key ? inputObj.key : "all memories";
      pushStep({
        id: info.toolCallId,
        kind: "explored",
        label: `Recalled memory: ${key}`,
        subLabel: isPending ? "Reading preferences..." : "Memory loaded",
        isLive: isPending,
        isError,
        info,
      });
      break;
    }
    case "synthesize_collected_information": {
      const synthesis =
        typeof inputObj.synthesis === "string" ? inputObj.synthesis : "";
      pushStep({
        id: info.toolCallId,
        kind: "thought",
        label: "Akıl Yürütme & Sentez (Scratchpad)",
        subLabel: isPending
          ? "Hesaplama ve analiz yapılıyor..."
          : "Tarih ve parametre doğrulaması tamamlandı",
        detailText: synthesis,
        isLive: isPending,
        isError,
        info,
      });
      break;
    }
    default: {
      pushStep({
        id: info.toolCallId,
        kind: "ran",
        label: `Ran tool: ${info.toolName}`,
        subLabel: isPending ? "Executing operation..." : "Completed",
        isLive: isPending,
        isError,
        info,
      });
    }
  }

  return steps;
}
