/**
 * HITL (Human-in-the-Loop) Decision & Approval Protocol.
 * Unifies ask_user_choice, request_user_confirmation, and Saga HITL approval checkpoints
 * into a single ergonomic contract for the Composer Dock.
 */

export interface HitlOption {
  id: string;
  label: string;
  value: string;
  description?: string;
  shortcutKey?: string;
  isCustomInput?: boolean;
}

export interface HitlPromptData {
  toolCallId: string;
  messageId?: string;
  title: string;
  description?: string;
  codeSnippet?: string;
  options: HitlOption[];
  allowCustom?: boolean;
  customPlaceholder?: string;
  allowSkip?: boolean;
  defaultOptionId?: string;
}

/**
 * Determines whether a tool call has already been answered/resolved by the user,
 * as opposed to being currently suspended waiting for user input.
 */
export function isHitlResolved(output?: unknown): boolean {
  if (!output || typeof output !== "object") return false;
  const o = output as Record<string, unknown>;
  // If the tool execution explicitly returned { suspend: true }, it is waiting for user input!
  if (o.suspend === true) return false;
  return Boolean(
    o.selected !== undefined ||
    o.choice !== undefined ||
    o.approved !== undefined ||
    (o.value !== undefined && !o.details)
  );
}

/**
 * Normalizes tool input/args from ask_user_choice or request_user_confirmation
 * into a canonical HitlPromptData model.
 */
export function normalizeHitlPrompt(raw: {
  toolName?: string;
  toolCallId: string;
  messageId?: string;
  input?: unknown;
  output?: unknown;
}): HitlPromptData | null {
  const { toolName, toolCallId, messageId, input, output } = raw;
  const inObj = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const outObj = (output && typeof output === "object" ? output : {}) as Record<string, unknown>;
  const outDetails = (outObj.details && typeof outObj.details === "object" ? outObj.details : {}) as Record<string, unknown>;

  const args: Record<string, unknown> = {
    ...outDetails,
    ...inObj,
  };

  if (Object.keys(args).length === 0) return null;

  // 1. request_user_confirmation
  if (toolName === "request_user_confirmation") {
    const title =
      typeof args.title === "string" && args.title.trim()
        ? args.title.trim()
        : "Allow action execution?";
    const description =
      typeof args.description === "string" ? args.description.trim() : undefined;
    const codeSnippet =
      typeof args.command === "string"
        ? args.command.trim()
        : typeof args.code === "string"
          ? args.code.trim()
          : typeof args.sql === "string"
            ? args.sql.trim()
            : undefined;

    const rawOptions = Array.isArray(args.options) ? args.options : [];
    let options: HitlOption[] = [];

    if (rawOptions.length > 0) {
      options = rawOptions.map((opt, idx) => {
        const o = typeof opt === "string" ? { label: opt, value: opt } : (opt as Record<string, unknown>);
        const label = String(o.label ?? o.value ?? "").trim();
        const value = String(o.value ?? label).trim();
        return {
          id: `opt-${idx + 1}`,
          label,
          value,
          description: typeof o.description === "string" ? o.description : undefined,
          shortcutKey: String(idx + 1),
        };
      });
    } else {
      // Default CLI-style confirmation choices
      options = [
        { id: "opt-1", label: "Yes", value: "yes", shortcutKey: "1" },
        { id: "opt-2", label: "No", value: "no", shortcutKey: "2" },
        {
          id: "opt-custom",
          label: "No (tell the agent what to do instead)",
          value: "custom",
          shortcutKey: "3",
          isCustomInput: true,
        },
      ];
    }

    return {
      toolCallId,
      messageId,
      title,
      description,
      codeSnippet,
      options,
      allowCustom: true,
      allowSkip: true,
      defaultOptionId: options[0]?.id,
    };
  }

  // 2. ask_user_choice
  const question =
    typeof args.question === "string" && args.question.trim()
      ? args.question.trim()
      : "Lütfen bir seçenek belirleyin";

  const rawOptions = Array.isArray(args.options) ? args.options : [];
  const options: HitlOption[] = rawOptions.map((opt, idx) => {
    if (typeof opt === "string") {
      return {
        id: `opt-${idx + 1}`,
        label: opt.trim(),
        value: opt.trim(),
        shortcutKey: idx < 9 ? String(idx + 1) : undefined,
      };
    }
    const o = (opt && typeof opt === "object" ? opt : {}) as Record<string, unknown>;
    const label = String(o.label ?? o.value ?? "").trim();
    const value = String(o.value ?? label).trim();
    const description = typeof o.description === "string" ? o.description.trim() : undefined;
    return {
      id: `opt-${idx + 1}`,
      label,
      value,
      description,
      shortcutKey: idx < 9 ? String(idx + 1) : undefined,
    };
  });

  const allowCustom = args.allow_custom !== false;
  if (allowCustom) {
    const nextIdx = options.length + 1;
    options.push({
      id: "opt-custom",
      label: "Farklı bir yanıt belirtin...",
      value: "__custom__",
      shortcutKey: nextIdx <= 9 ? String(nextIdx) : undefined,
      isCustomInput: true,
    });
  }

  const codeSnippet =
    typeof args.code === "string"
      ? args.code.trim()
      : typeof args.sql === "string"
        ? args.sql.trim()
        : undefined;

  return {
    toolCallId,
    messageId,
    title: question,
    description: typeof args.description === "string" ? args.description.trim() : undefined,
    codeSnippet,
    options,
    allowCustom,
    customPlaceholder:
      typeof args.custom_placeholder === "string" ? args.custom_placeholder.trim() : undefined,
    allowSkip: false,
    defaultOptionId: options[0]?.id,
  };
}
