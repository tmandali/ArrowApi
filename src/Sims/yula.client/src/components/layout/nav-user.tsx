"use client";

import Link from "next/link";

import * as React from "react";
import { useTranslations } from "next-intl";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "@/context/theme-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useJobSession } from "@/features/auth/hooks/use-job-session";
import {
  setLocalProfileImage,
  toAvatarSrc,
  useLocalProfileImage,
} from "@/features/auth/lib/local-profile-image";
import type { Session } from "@/lib/auth";
import { useActiveCompany } from "@/features/company/hooks/use-active-company";
import { emptySubscribe } from "@/hooks/use-mounted";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/utils/cn";
import {
  Building2,
  Check,
  User,
  Palette,
  Sun,
  Moon,
  Monitor,
  LogOut,
} from "lucide-react";

const themes = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "System" },
] as const;

/**
 * Header trigger ve dropdown menüdeki rozeti aynı resim + aynı stilde gösteren
 * ortak Avatar bileşeni. "Farklı resim" algısı yaratan ring/boyut sürprizlerini önler.
 *
 * Radix Avatar yerine düz <img> + onError: Radix'in state makinesi, resim
 * URL'i SONRADAN geldiğinde (ör. login sonrası localStorage kaydı) güvenilmez
 * biçimde fallback'te kalıyordu — tooltip'teki yeşil nokta resim olduğunu
 * söylerken rozet baş harfleri gösteriyordu. Ayna yaklaşım: profil resim
 * kartı (profile-image-card.tsx).
 */
function NavUserAvatar({
  image,
  name,
  initials,
  sizeClass,
  ringClass,
}: {
  image?: string | null;
  name?: string | null;
  initials: string;
  sizeClass?: string;
  ringClass?: string;
}) {
  // Yükleme hatasına düşen URL: yalnız o URL için fallback'e kal — farklı
  // bir URL geldiğinde resim tekrar denenir.
  const [brokenSrc, setBrokenSrc] = React.useState<string | null>(null);
  const showImage = !!image && brokenSrc !== image;
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-full shadow-xs ring-1",
        "bg-linear-to-br from-primary/25 to-primary/10",
        sizeClass,
        ringClass
      )}
    >
      {showImage ? (
        <img
          src={image}
          alt={name ?? ""}
          onError={() => {
            // Proxy 404'ü (resim yok) / geçici hata: baş harfler fallback'i
            // ZATEN doğru görünümdür — sessizce düş, konsol gürültüsü yapma.
            console.debug("[nav-avatar] resim yüklenemedi:", image);
            setBrokenSrc(image);
          }}
          className="size-full rounded-full object-cover"
        />
      ) : (
        <span className="select-none text-xs font-semibold tracking-wider text-foreground">
          {initials}
        </span>
      )}
    </div>
  );
}

export function NavUser() {
  // Menü kontrollü açık/kapanır: profil başlığına tıklanınca menü
  // KAPANIYOR (yoksa sayfa değişse de header kalıcı olunca açık kalırdı).
  const [open, setOpen] = React.useState(false);
  const t = useTranslations("NavUser");
  const { data: session, status } = useSession();
  const { clearJobSession } = useJobSession();
  const { company, companies, switchCompany, lastSwitchedAt } =
    useActiveCompany();
  const { theme, setTheme } = useTheme();

  // Şirket geçişi anlık (optimistik) yapılır — uygulama asla kilitlenmez.
  // Geri bildirim: geçişten ~900 ms boyunca aktif şirket satırında kısa bir
  // "senkronize" spinner'ı gösterilir; paneller kendi loading state'leri ile
  // yenilir, bu göstergeden bağımsızdır.
  const [syncing, setSyncing] = React.useState(false);
  React.useEffect(() => {
    if (!lastSwitchedAt) return;
    setSyncing(true);
    const timer = window.setTimeout(() => setSyncing(false), 900);
    return () => window.clearTimeout(timer);
  }, [lastSwitchedAt]);

  // Hydration güvenli "mounted" bayrağı
  const mounted = React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const user = session?.user as Session["user"] | undefined;
  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "NB";

  // Rozet resmi: session'daki resmi yoksa ayarlar sayfasındaki
  // "Yeniden getir" başarısında saklanan yerel kayıt (localStorage)
  // tamamlar. Uzak (provider) URL'ler `toAvatarSrc` ile /api/avatar
  // proxy'sine haritalanır — ham URL'ler WebView'de kırılgan yükleniyordu.
  const badgeImage = toAvatarSrc(useLocalProfileImage(user).picture);

  // Otomatik tamamlama: ilk girişte session'da resim YOK ama access
  // token varsa, arka planda TEK SEFERLIK /api/auth/userinfo çağrısı
  // yapılır; taze resim yerel kayda yazılır → badge kendi kendine dolar,
  // sonraki yüklemelerde kayıt sayesinde çağrı bile gerekmez. Hata
  // (örn. token ömrü dolmuş 409) sessizce yutulur — badge initials'e
  // kalır, kullanıcı ayarlardan manuel "Yeniden getir" ile dener.
  // Fire-once: koşullar ilk kez sağlandığında başlar; deps değişimi
  // (session object kimliği) çağrıyı iptal ETMEZ — uçan istek her
  // durumda tamamlanır.
  const autoFetched = React.useRef(false);
  React.useEffect(() => {
    if (!user || !user.accessToken || badgeImage || autoFetched.current) {
      return;
    }
    autoFetched.current = true;
    fetch("/api/auth/userinfo", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        // Resim ADLA BİRLİKTE kaydedilir: sağ paneldeki ad/e-posta da
        // provider kaynağından beslenir (bkz. local-profile-image.ts).
        if (data && (data.picture || data.name || data.email)) {
          setLocalProfileImage({
            picture: data.picture ?? null,
            name: data.name ?? null,
            email: data.email ?? null,
          });
        }
      })
      .catch(() => {
        // Ağ hatası: sessizce yut — rozet baş harflerle kalır.
      });
  }, [user, badgeImage, user?.accessToken]);

  const activeTheme = mounted ? (theme ?? "system") : "system";

  const handleSignOut = () => {
    clearJobSession();
    signOut({ redirectTo: "/sign-in" });
  };

  // SSR/hydration güvenli: ilk render'da ve oturum doğrulanırken hiç şey gösterme.
  if (!mounted || status === "loading") {
    return null;
  }

  // Oturum yok → net bir "Giriş Yap" butonu göster (sağ üst boş kalmasın).
  if (!user) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-2 text-xs"
        asChild
      >
        <Link href="/sign-in">
          <User className="size-4" />
          {t("sign_in")}
        </Link>
      </Button>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      {/* Rozet tooltip'i kaldırıldı: ad/e-posta + provider etiketi artık
          yalnız ayarlar sayfasının sağ panelinde (provider kaynağından).
          Rozet artık: avatar + yeşil online noktası. */}
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="User menu"
          className="group relative flex size-8 items-center justify-center rounded-full transition-all duration-150 hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 data-[state=open]:ring-2 data-[state=open]:ring-primary/50 cursor-pointer"
        >
          <NavUserAvatar
            image={badgeImage}
            name={user.name}
            initials={initials}
            sizeClass="size-8 transition-all group-hover:ring-sidebar-foreground/30"
            ringClass="ring-sidebar-border"
          />
          {/* Online/Aktif durumu belirteci */}
          <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-sidebar" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-68 rounded-xl p-1.5 shadow-xl border-border/80"
        side="bottom"
        align="end"
        sideOffset={8}
      >
        <DropdownMenuLabel className="p-0 font-normal">
          {/* Profil başlığına tıklanınca KULLANICI EKRANI (user-details)
              açılır — eski profil/tercihler/hesaplar link item'ları
              kaldırıldı; tek giriş noktası bu başlık. */}
          <Link
            href="/my/settings?tab=user-details"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-2.5 py-3 bg-muted/40 rounded-lg hover:bg-muted/60 transition-colors cursor-pointer"
          >
            <NavUserAvatar
              image={badgeImage}
              name={user.name}
              initials={initials}
              sizeClass="h-10 w-10"
              ringClass="ring-sidebar-border"
            />
            <div className="grid flex-1 text-left leading-tight min-w-0">
              <span className="truncate text-sm font-medium text-foreground">
                {user.name}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {user.email}
              </span>
            </div>
          </Link>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="px-2 py-1.5 text-xs text-muted-foreground">
          {t("company_label")}
        </DropdownMenuLabel>
        <DropdownMenuGroup>
          {companies.map((item) => {
            const isActive = item.id === company?.id;
            return (
              <DropdownMenuItem
                key={item.id}
                className="cursor-pointer gap-2"
                onClick={() => switchCompany(item.id)}
              >
                <Building2 />
                <span className="flex-1 truncate">{item.name}</span>
                {item.abbr ? (
                  <span className="text-[10px] text-muted-foreground">
                    {item.abbr}
                  </span>
                ) : null}
                {isActive ? (
                  syncing ? (
                    <Spinner
                      className="size-3.5"
                      aria-label={t("syncing")}
                    />
                  ) : (
                    <Check className="size-3.5" />
                  )
                ) : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="cursor-default justify-between gap-3 focus:bg-transparent"
          onSelect={(event) => event.preventDefault()}
        >
          <span className="flex items-center gap-2">
            <Palette />
            {t("theme_label")}
          </span>
          <div
            role="group"
            aria-label="Theme"
            className="flex items-center rounded-full bg-muted p-0.5"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {themes.map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                type="button"
                aria-label={label}
                aria-pressed={activeTheme === value}
                onClick={() => {
                  setTheme(value);
                }}
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground",
                  activeTheme === value &&
                    "bg-background text-foreground shadow-sm ring-1 ring-border/60",
                )}
              >
                <Icon className="size-3.5" />
              </button>
            ))}
          </div>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="cursor-pointer"
          onSelect={handleSignOut}
        >
          <LogOut />
          {t("sign_out")}
          <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
