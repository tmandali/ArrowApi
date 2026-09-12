import { UserRoundIcon } from "lucide-react";
import type { WorkspaceDefinition } from "@/types";
import { myNav, myDashboardPath } from "./routes";

/**
 * `my` — KİŞİSEL çalışma alanı (profil & ayarlar).
 *
 * - Oturum ZORUNLU workspace: sayfaları `RequireSession` ile kapılı.
 * - Sol rail'de DEKLARE EDİLMEZ (`getRailWorkspaces` listesi değişmez) —
 *   kullanıcı kendi alanına üst kullanıcı menüsünden (nav-user) ulaşır.
 * - `rootPath` `/my` genel giriş ekranıdır (tek ekran olması nedeniyle
 *   `dashboardPath`'e yönlendirir).
 */
export const myWorkspace: WorkspaceDefinition = {
  id: "my",
  name: "My",
  title: "Hesabım & Ayarlarım",
  icon: UserRoundIcon,
  rootPath: "/my",
  dashboardPath: myDashboardPath,
  navigation: myNav,
};
