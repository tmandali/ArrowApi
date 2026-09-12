"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";

/**
 * Oturum kapısı (session gerektiren global sayfalar için sarıcı) —
 * `RequireAdmin`'ın minimal kardeşi (bkz. `features/system/components/admin-gate.tsx`).
 *
 * Davranış:
 * - Oturum yok (hiç giriş yapılmamış) → `/sign-in` (fail-closed).
 * - Session çözülüyor (ilk hesap durumu yanıtı öncesi) → spinner;
 *   oturum varken içerik geçici gösterilmez.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/sign-in");
    }
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
