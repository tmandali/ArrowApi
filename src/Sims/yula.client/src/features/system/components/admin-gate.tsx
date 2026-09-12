"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { useEffectiveRole } from "@/features/auth/lib/use-effective-role";

/**
 * Yönetici ekran kapısı (`adminOnly` ekranlar için sarıcı).
 *
 * Kural: rol yetkilendirmesi yapılmamış ekranlar guest'e AÇIK; bu
 * kapıdaki ekranlar YALNIZCA etkin rol `System Administrator` olan
 * kullanıcılara (DB kataloğu linki YADA Keycloak `app-admin` claim'i —
 * bootstrap) izni verir.
 *
 * Davranış:
 * - Oturum yok → `/sign-in` (fail-closed).
 * - Rol hâlâ yüklenmiyor (guard'ın ilk account-status yanıtı) →
 *   spinner (geçici, rol gelince yönlendirme karar verilir).
 * - Yüklenmiş ama yönetici değil → ana ekrana (`/`) yönlendirir;
 *   yönlendirme tamamlanana dek içerik gösterilmez (veri sızıntısı yok).
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const { ready, isAdmin } = useEffectiveRole();
  const router = useRouter();

  useEffect(() => {
    if (status !== "authenticated") {
      router.replace("/sign-in");
    } else if (ready && !isAdmin) {
      router.replace("/");
    }
  }, [status, ready, isAdmin, router]);

  if (status !== "authenticated" || !ready || !isAdmin) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
