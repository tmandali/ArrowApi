"use client";

import Link from "next/link";

import * as React from "react";
import { useTranslations } from "next-intl";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "@/context/theme-context";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useJobSession } from "@/features/auth/hooks/use-job-session";
import {
  setLocalProfileImage,
  useLocalProfileImage,
} from "@/features/auth/lib/local-profile-image";
import type { Session } from "@/lib/auth";
import { useActiveCompany } from "@/features/company/hooks/use-active-company";
import { emptySubscribe } from "@/hooks/use-mounted";
import { cn } from "@/utils/cn";
import {
  Building2,
  Check,
  User,
  Settings,
  Inbox,
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
 * Provider → literal Türkçe rozet etiketi (i18n/çeviri katmanından bağımsız;
 * tooltip'de kullanılır — bkz. rozet tooltip'i).
 */
const PROVIDER_LABELS: Record<string, string> = {
  google: "Google Hesabı",
  "google-onesig": "Google Hesabı",
  keycloak: "Keycloak Hesabı",
};

/**
 * Header trigger ve dropdown menüdeki rozeti aynı resim + aynı stilde gösteren
 * ortak Avatar bileşeni. "Farklı resim" algısı yaratan ring/boyut sürprizlerini önler.
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
  return (
    <Avatar
      className={cn(
        "rounded-full ring-1 after:border-0 shadow-xs",
        sizeClass,
        ringClass
      )}
    >
      {image ? <AvatarImage src={image} alt={name ?? ""} /> : null}
      <AvatarFallback className="rounded-full bg-linear-to-br from-primary/25 to-primary/10 text-xs font-semibold tracking-wider text-foreground">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

export function NavUser() {
  const t = useTranslations("NavUser");
  const { data: session, status } = useSession();
  const { clearJobSession } = useJobSession();
  const { company, companies, beginCompanySwitch, isSwitching } = useActiveCompany();
  const { theme, setTheme } = useTheme();

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
  // tamamlar — resim header ile kart arasında eşleşir.
  const badgeImage = useLocalProfileImage(user?.image);

  // Otomatik tamamlama: ilk girişte session'da resim YOK ama access
  // token varsa, arka planda tek seferlik /api/auth/userinfo çağrısı
  // yapılır; taze resim yerel kayda yazılır → badge kendi kendine dolar,
  // sonraki yüklemelerde kayıt sayesinde çağrı bile gerekmez. Hata
  // (örn. token ömrü dolmuş 409) sessizce yutulur — badge initials'e
  // kalır, kullanıcı ayarlardan manuel "Yeniden getir"le dener.
  const autoFetched = React.useRef(false);
  React.useEffect(() => {
    if (!user || !user.accessToken || badgeImage || autoFetched.current) {
      return;
    }
    autoFetched.current = true;
    let cancelled = false;
    fetch("/api/auth/userinfo", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.picture) setLocalProfileImage(data.picture);
      })
      .catch(() => {
        // Ağ hatası: sessizce yut — rozet baş harflerle kalır.
      });
    return () => {
      cancelled = true;
    };
  }, [user, badgeImage, user?.accessToken]);

  const activeTheme = mounted ? (theme ?? "system") : "system";
  const providerLabel = PROVIDER_LABELS[user?.provider ?? ""] ?? "Hesap";

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
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
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
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={8} className="px-3 py-2.5 text-left leading-snug">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground/60">
            {providerLabel}
            {/* Resim durumu göstergesi: resim varsa yeşil, yoksa amber */}
            <span
              role="img"
              aria-label={badgeImage ? "Resim yüklü" : "Resim yok"}
              title={badgeImage ? "Resim yüklü" : "Resim yok — baş harfler gösteriliyor"}
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                badgeImage ? "bg-emerald-400" : "bg-amber-400/90"
              )}
            />
          </span>
          <span className="block max-w-56 truncate text-xs font-medium">
            {user.name ?? "-"}
          </span>
          <span className="block max-w-56 truncate text-xs text-primary-foreground/80">
            {user.email ?? "-"}
          </span>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        className="w-68 rounded-xl p-1.5 shadow-xl border-border/80"
        side="bottom"
        align="end"
        sideOffset={8}
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-3 px-2.5 py-3 bg-muted/40 rounded-lg">
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
          </div>
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
                disabled={isSwitching}
                onClick={() => beginCompanySwitch(item.id)}
              >
                <Building2 />
                <span className="flex-1 truncate">{item.name}</span>
                {item.abbr ? (
                  <span className="text-[10px] text-muted-foreground">
                    {item.abbr}
                  </span>
                ) : null}
                {isActive ? <Check className="size-3.5" /> : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem className="cursor-pointer" asChild>
            <Link href="/my/settings?tab=user-details">
              <User />
              {t("profile")}
              <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" asChild>
            <Link href="/my/settings?tab=settings">
              <Settings />
              {t("preferences")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" asChild>
            <Link href="/my/settings">
              <Inbox />
              {t("manage_accounts")}
            </Link>
          </DropdownMenuItem>
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
