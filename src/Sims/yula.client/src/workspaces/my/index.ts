import type { WorkspaceDefinition } from "@/types";

export { myWorkspace } from "./workspace.config";
export { myNav, myDashboardPath } from "./routes";

/**
 * KULLANICI ayarları içeriği (profil, dil, AI config, System Facts) —
 * `my` workspace içerik standardı gereği burada yaşar; `app/my/settings`
 * sayfası ince zarf olarak tüketir.
 */
export { MySettingsForm } from "./components/MySettingsForm";

/**
 * `my` workspace oturum kapısı — `my/*` sayfaları bu bileşenle sarılır.
 * (Tek kaynak: `features/auth/components/require-session.tsx`.)
 */
export { RequireSession } from "@/features/auth/components/require-session";

export type { WorkspaceDefinition };
