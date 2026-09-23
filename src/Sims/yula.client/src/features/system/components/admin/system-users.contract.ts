import { z } from "zod";
import { defineScreenContract } from "@/lib/contracts/screen-contract";

export const SystemUsersSearchInputSchema = z.object({
  query: z.string(),
});

export const SystemUsersSwitchTabInputSchema = z.object({
  tab: z.enum(["catalog", "guests"]),
});

export const SystemUsersContract = defineScreenContract({
  screenId: "entity_form:system_users",
  screenTitle: "Kullanıcılar & Yetkiler",
  workspace: "system",
  category: "interactive_operator",
  aiEnabled: true,
  actions: {
    READ: {
      description: "Reads user catalog and guest identities summary.",
      whenToCall: "When inspecting users count, guest count, or active tab.",
      whenNotToCall: "When filtering users.",
    },
    SEARCH: {
      description: "Filters users or guests by search term ({ query: string }).",
      inputSchema: SystemUsersSearchInputSchema,
      whenToCall: "When searching for a user by name or email.",
      whenNotToCall: "When clearing filter (pass query='' to reset).",
    },
    SWITCH_TAB: {
      description:
        "Switches between 'catalog' (registered users) and 'guests' (pending authorization).",
      inputSchema: SystemUsersSwitchTabInputSchema,
      whenToCall: "When user asks to see guest logins or registered users.",
      whenNotToCall: "When requested tab is already active.",
    },
  },
});

export type SystemUsersAction = keyof typeof SystemUsersContract.actions;
