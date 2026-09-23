export { RequireAdmin } from "./components/admin-gate";
export { SystemUsersView } from "./components/admin/SystemUsersView";
export { SystemHomeView } from "./components/SystemHomeView";
export { AgentManagementView } from "./components/agents/AgentManagementView";
export { AgentEditorContract } from "./components/agents/agent-editor.contract";
export { AgentSessionView } from "./components/agents/AgentSessionView";
export { SkillManagementView } from "./components/agents/SkillManagementView";
export { SkillEditorContract } from "./components/agents/skill-editor.contract";

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
