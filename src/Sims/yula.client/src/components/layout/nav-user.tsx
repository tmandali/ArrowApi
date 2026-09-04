"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react"
import { useTheme } from "@/context/theme-context"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useJobSession } from "@/features/auth/hooks/use-job-session"
import { useActiveCompany } from "@/features/company/hooks/use-active-company"
import { emptySubscribe } from "@/hooks/use-mounted"
import { cn } from "@/utils/cn"
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
} from "lucide-react"

const themes = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "System" },
] as const

export function NavUser({
  user,
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
}) {
  const { theme, setTheme } = useTheme()
  const router = useRouter();
  const navigate = (
    to: string | number,
    _options?: { replace?: boolean; state?: unknown },
  ) => {
    if (typeof to === "number") {
      if (to < 0) router.back();
      else router.forward();
    } else {
      void router.push(to);
    }
  };

  const { clearJobSession } = useJobSession()
  const { company, companies, beginCompanySwitch, isSwitching } =
    useActiveCompany()
  // Hydration güvenli "mounted" bayrağı: sunucuda false, istemcide true.
  const mounted = React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )

  const initials = user.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "NB"

  const activeTheme = mounted ? (theme ?? "system") : "system"

  const handleSignOut = () => {
    clearJobSession()
    navigate("/login")
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          aria-label="User menu"
          className="h-8 rounded-full px-1.5 data-[state=open]:bg-muted"
        >
          <Avatar className="size-7 rounded-full">
            <AvatarImage src={user.avatar} alt={user.name} />
            <AvatarFallback className="rounded-full bg-muted text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-64 rounded-xl p-1.5"
            side="bottom"
            align="end"
            sideOffset={8}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-3 px-2 py-2.5">
                <Avatar className="h-9 w-9 rounded-full">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-full bg-muted text-xs font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-medium">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            <DropdownMenuLabel className="px-2 py-1.5 text-xs text-muted-foreground">
              Company
            </DropdownMenuLabel>
            <DropdownMenuGroup>
              {companies.map((item) => {
                const isActive = item.id === company?.id
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
                )
              })}
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuGroup>
              <DropdownMenuItem className="cursor-pointer" asChild>
                <Link href="/user-settings">
                  <User />
                  Profile
                  <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" asChild>
                <Link href="/user-settings">
                  <Settings />
                  Preferences
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer">
                <Inbox />
                Manage Accounts
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              className="cursor-default justify-between gap-3 focus:bg-transparent"
              onSelect={(event) => event.preventDefault()}
            >
              <span className="flex items-center gap-2">
                <Palette />
                Theme
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
                    onClick={() => setTheme(value)}
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground",
                      activeTheme === value &&
                        "bg-background text-foreground shadow-sm ring-1 ring-border/60"
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
              Sign Out
              <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
  )
}
