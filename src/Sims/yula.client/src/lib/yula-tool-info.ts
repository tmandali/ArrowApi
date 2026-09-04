/** Statik (`tool-<ad>`) ve dinamik parçaları tek forma indirger */
export interface YulaToolPartInfo {
  toolName: string;
  state: string;
  toolCallId: string;
  input?: unknown;
  output?: unknown;
  /** SDK ToolUIPart "output-error" state'inin kanonik hata metni */
  errorText?: string;
}

export function yulaToolPartInfo(part: unknown): YulaToolPartInfo | null {
  const p = part as { type?: string } | null;
  if (!p?.type) return null;
  if (p.type === "dynamic-tool") {
    const q = p as {
      toolName?: string;
      state?: string;
      toolCallId?: string;
      input?: unknown;
      output?: unknown;
      errorText?: string;
    };
    return q.toolName && q.state && q.toolCallId
      ? {
          toolName: q.toolName,
          state: q.state,
          toolCallId: q.toolCallId,
          input: q.input,
          output: q.output,
          errorText: q.errorText,
        }
      : null;
  }
  if (p.type.startsWith("tool-")) {
    const q = p as {
      state?: string;
      toolCallId?: string;
      input?: unknown;
      output?: unknown;
      errorText?: string;
    };
    if ("state" in q && "toolCallId" in q) {
      return {
        toolName: p.type.slice("tool-".length),
        state: String(q.state),
        toolCallId: String(q.toolCallId),
        input: (q as { input?: unknown }).input,
        output: (q as { output?: unknown }).output,
        errorText: (q as { errorText?: string }).errorText,
      };
    }
  }
  return null;
}

export function isFailedToolInfo(info: YulaToolPartInfo): boolean {
  if (info.state === "output-error") return true;
  if (info.state === "output-available" && info.output && typeof info.output === "object") {
    const status = (info.output as { status?: string }).status;
    if (
      status === "error" ||
      status === "validation-error" ||
      status === "blocked"
    ) {
      return true;
    }
  }
  return false;
}
