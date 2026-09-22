import { REGISTERED_REPORTS } from "@/features/reports/report-registry";
import { isWorkspaceHomePath } from "@/lib/workspace-paths";
import {
  hrefForConversation,
  lastNavigateTargetFromMessages,
  restoreConversationExecution,
} from "@/lib/yula-history-navigation";
import type { YulaMessage } from "@/app/api/agent/chat/route";
import type { YulaConversation } from "@/lib/stores/chats";

/**
 * Resolves the screen URL to return to.
 * If currently on an application screen, returns current path.
 * If on home screen (/), inspects conversation execution, pathname, message history, or default reports.
 */
export function resolveTargetScreen(
  currentPathname: string,
  activeConv?: YulaConversation | null,
  messages?: YulaMessage[],
): string {
  if (!isWorkspaceHomePath(currentPathname)) {
    return currentPathname;
  }
  if (activeConv) {
    restoreConversationExecution(activeConv, messages);
    const href = hrefForConversation(activeConv, messages);
    if (href && !isWorkspaceHomePath(href)) {
      return href;
    }
  }
  const fromMsg = lastNavigateTargetFromMessages(messages);
  if (fromMsg && !isWorkspaceHomePath(fromMsg)) {
    return fromMsg;
  }
  if (activeConv?.title) {
    const titleLower = activeConv.title.toLowerCase();
    const matched = REGISTERED_REPORTS.find(
      (r) =>
        titleLower.includes(r.title.toLowerCase()) ||
        r.aliases.some((a) => titleLower.includes(a.toLowerCase())),
    );
    if (matched) return matched.pagePath;
  }
  return REGISTERED_REPORTS[0]?.pagePath || "/stock";
}
