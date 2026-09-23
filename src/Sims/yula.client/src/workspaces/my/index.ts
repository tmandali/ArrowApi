import type { WorkspaceDefinition } from "@/types";

export { myWorkspace } from "./workspace.config";
export { myNav, myDashboardPath } from "./routes";

/**
 * KULLANICI ayarları içeriği (profil, dil, AI config, System Facts) —
 * `my` workspace içerik standardı gereği burada yaşar; `app/my/settings`
 * sayfası ince zarf olarak tüketir.
 */
export { MySettingsForm } from "./components/settings/my-settings-form";
export { UserSettingsContract } from "./components/settings/user-settings.contract";
export { YulaStudioView } from "./components/studio/yula-studio-view";
export { PluginsPageView } from "./components/plugins/plugins-page-view";
export { PluginsRegistryContract } from "./components/studio/plugins-registry.contract";
export { MemoryPageView } from "./components/memory/memory-page-view";
export { MemoryManagementContract } from "./components/studio/memory-management.contract";
export { PlaybooksPageView } from "./components/playbooks/playbooks-page-view";
export { PlaybooksManagementContract } from "./components/playbooks/playbook-management.contract";

/**
 * `my` workspace oturum kapısı — `my/*` sayfaları bu bileşenle sarılır.
 * (Tek kaynak: `features/auth/components/require-session.tsx`.)
 */
export { RequireSession } from "@/features/auth/components/require-session";

export type { WorkspaceDefinition };
