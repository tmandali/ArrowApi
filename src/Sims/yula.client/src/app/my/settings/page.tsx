import { AppLayout } from "@/components/layout/app-layout";
import { MySettingsForm, RequireSession } from "@/workspaces/my";

/**
 * `/my/settings` — `my` (kişisel) workspace'in Profil & Ayarlar ekranı.
 *
 * Workspace OTURUM ZORUNLUDUR: `RequireSession` kapısı hiç giriş yapmamış
 * kullanıcıyı `/sign-in`'e fail-closed yönlendirir; içerik oturumsuz
 * asla render edilmez.
 */
export default function MySettingsPage() {
  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <RequireSession>
          <MySettingsForm />
        </RequireSession>
      </div>
    </AppLayout>
  );
}
