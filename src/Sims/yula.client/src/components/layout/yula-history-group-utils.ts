import type { YulaConversation } from "@/lib/stores/chats";

export interface ConversationGroup {
  label: string;
  items: YulaConversation[];
}

export function groupConversationsByDate(
  items: YulaConversation[],
  t: (key: string) => string
): ConversationGroup[] {
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const yesterdayStart = todayStart - 86400000;
  const lastWeekStart = todayStart - 7 * 86400000;

  const today: YulaConversation[] = [];
  const yesterday: YulaConversation[] = [];
  const lastWeek: YulaConversation[] = [];
  const older: YulaConversation[] = [];

  const sorted = [...items].sort((a, b) => b.createdAt - a.createdAt);

  for (const item of sorted) {
    if (item.createdAt >= todayStart) {
      today.push(item);
    } else if (item.createdAt >= yesterdayStart) {
      yesterday.push(item);
    } else if (item.createdAt >= lastWeekStart) {
      lastWeek.push(item);
    } else {
      older.push(item);
    }
  }

  return [
    { label: t("group_today"), items: today },
    { label: t("group_yesterday"), items: yesterday },
    { label: t("group_last_week"), items: lastWeek },
    { label: t("group_older"), items: older },
  ].filter((group) => group.items.length > 0);
}
