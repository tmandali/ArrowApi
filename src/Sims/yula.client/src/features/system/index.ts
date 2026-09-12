export { RequireAdmin } from "./components/admin-gate";
export { SystemUsersView } from "./components/admin/SystemUsersView";
export { SystemHomeView } from "./components/SystemHomeView";
export { AgentManagementView } from "./components/agents/AgentManagementView";
export { AgentSessionView } from "./components/agents/AgentSessionView";
export { SkillManagementView } from "./components/agents/SkillManagementView";

export { systemWorkspace } from "./workspace.config";
export { systemNav, systemDashboardPath } from "./routes";
/** Sistem Evresi slash komutları manifest'i (yula-commands Public API'den tüketir). */
export { default as systemAgentYaml } from "./agents/system.agent.yaml";

export const systemWorkspaceConfig = {
  id: "system",
  label: "System",
  title: "Sistem & Ana Ekran",
  homeUrl: "/",
  mySettingsUrl: "/my/settings",
  adminUsersUrl: "/system/users",
} as const;
