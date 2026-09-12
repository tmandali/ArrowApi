import Link from "next/link";
import { Users, Bot, Sparkles, Settings2, Wrench } from "lucide-react";

/**
 * `/settings` — SİSTEM AYARLARI (platform/global ayarlar ekranı).
 *
 * KAVRAM SINIRI (nav & URL sözleşmesi):
 * - `/my/settings` = KULLANICI ayarları (profil/AI config — `my` workspace,
 *   oturum zorunlu, bkz. `workspaces/my`).
 * - `/settings`    = SİSTEM ayarları (platform seviyesi — bu ekran).
 *
 * Bu ekran `RequireAdmin` kapısı arkasında açılır (sayfa zarfı:
 * `app/settings/page.tsx`). Yönetim bölgeleri mevcut admin ekranlarıdır;
 * genel sistem ayarı bölümleri (yeni) eklendikçe `SECTIONS` listesine
 * eklenir.
 */

type SettingsSection = {
  id: string;
  href: string | null;
  icon: typeof Users;
  title: string;
  description: string;
  adminOnly?: boolean;
};

const SECTIONS: SettingsSection[] = [
  {
    id: "admin-users",
    href: "/system/users",
    icon: Users,
    title: "Tüm Kullanıcılar",
    description:
      "Yönetici kataloğu: kullanıcılar, roller, yetkilendirme linkleri, hesap durumu ve cross-provider birleştirme.",
    adminOnly: true,
  },
  {
    id: "admin-agents",
    href: "/system/agents",
    icon: Bot,
    title: "Ajan Ayarları",
    description: "Yula AI ajan tanımları, prompt/ölçek ayarları ve ajan oturum izleme.",
    adminOnly: true,
  },
  {
    id: "admin-skills",
    href: "/system/skills",
    icon: Sparkles,
    title: "Skill Ayarları",
    description: "Slash skill tanımları, prompt metinleri ve lint kuralları.",
    adminOnly: true,
  },
];

export function SystemSettingsView() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Sistem Ayarları</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Platform seviyesi yönetim bölgeleri. Kişisel profil ve AI
          tercihleri için{" "}
          <Link
            href="/my/settings"
            className="text-foreground underline underline-offset-2 hover:no-underline"
          >
            Hesabım &amp; Ayarlarım
          </Link>{" "}
          sayfası kullanılır.
        </p>
      </header>

      <div className="grid gap-3">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const inner = (
            <div className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{section.title}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {section.description}
                </div>
              </div>
            </div>
          );
          return (
            <div key={section.id} className="rounded-lg border bg-card">
              {section.href ? (
                <Link href={section.href} className="block transition-colors hover:bg-accent/40">
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-dashed p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Wrench className="h-4 w-4" />
          Genel sistem ayarı bölümleri eklendikçe bu sayfada listelenir.
        </div>
      </div>
    </div>
  );
}
