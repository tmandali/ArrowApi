export { MySettingsForm } from "./components/self-service/MySettingsForm";
export { MySettingsForm as UserSettingsForm } from "./components/self-service/MySettingsForm";
export { SystemUsersView } from "./components/admin/SystemUsersView";
export { SystemHomeView } from "./components/SystemHomeView";

export const systemWorkspaceConfig = {
  id: "system",
  label: "System",
  title: "Sistem & Ana Ekran",
  homeUrl: "/",
  mySettingsUrl: "/my/settings",
  adminUsersUrl: "/system/users",
} as const;
