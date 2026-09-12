import { AppLayout } from "@/components/layout/app-layout";
import { SystemSettingsView } from "@/features/settings";
import { RequireAdmin } from "@/features/system";

/**
 * `/settings` — SİSTEM AYARLARI (platform seviyesi).
 *
 * KULLANICI ayarları burası DEĞİLDİR — onlar `my` workspace'inde
 * (`/my/settings`, oturum zorunlu). Bu ekran yönetici kapısı
 * (`RequireAdmin`) arkasındadır; guest/oturumsuz ziyaretçi
 * fail-closed `/sign-in`'e yönlenir.
 */
export default function SettingsPage() {
  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <RequireAdmin>
          <SystemSettingsView />
        </RequireAdmin>
      </div>
    </AppLayout>
  );
}
