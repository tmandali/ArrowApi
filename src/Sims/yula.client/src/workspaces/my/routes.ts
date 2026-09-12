import { Settings2Icon } from "lucide-react";
import type { WorkspaceNavItem } from "@/types";

export const myDashboardPath = "/my/settings";

/**
 * `my` workspace navigasyonu — KİŞİSEL çalışma alanı.
 *
 * Workspace OTURUM ZORUNLUDUR: `my/*` sayfaları `RequireSession` kapısıyla
 * korunur; hiç giriş yapmamış kullanıcı `/sign-in`'e yönlendirilir
 * (bkz. `app/my/settings/page.tsx`).
 */
export const myNav: WorkspaceNavItem[] = [
  {
    title: "Hesabım & Ayarlarım",
    url: "/my/settings",
    icon: Settings2Icon,
  },
];
