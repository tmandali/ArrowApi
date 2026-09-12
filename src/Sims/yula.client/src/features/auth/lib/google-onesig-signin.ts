/**
 * GIS credential → NextAuth session değişimi (ortak yardımcı).
 *
 * `google-onesig` credentials provider'ı token'ı server'da JWT bearer ile
 * doğrulayıp session oluşturur. `redirect:false` → sonuç döner; error
 * doluysa session oluşmamıştır. Çağrıyan bileşen UI state'ini (busy/failed)
 * kendisi yönetir; oturum sonrası NAVİGASYONU bu yardımcı üstlenir
 * (credentials akışında NextAuth otomatik redirect YAPMAZ):
 *
 *  - `/sign-in` üzerindeysek (GoogleOneTapButton) → başarılı girişte hedefe
 *    `router.replace()` ile gideriz (`?next=` varken oraya, yoksa `/`).
 *    ÖNEMLİ: sign-in'de `router.refresh()` çağırmayız — refresh in-flight
 *    iken aynı sayfadaki replace Next.js'te yutulabilir; `replace` kendi
 *    revalidation'ını yapar, `useSession` de signIn ile otomatik tazelenir.
 *  - Başka bir sayfada (global kart / GoogleOneTapPrompt) → hedefe gitme,
 *    bulunduğun sayfada oturum açılmış UI'yı `router.refresh()` ile göster.
 */
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

/** App-router'ın istemci tarafı router tipi (useRouter dönüş tipi). */
type AppRouter = ReturnType<typeof useRouter>;

export type GoogleSignInResult = { error?: string | null } | undefined;

/**
 * Güvenli `next` hedefi: yalnızca site-İÇİ salt-bağlantı geçişi kabul
 * edilir (`/system/agents` ✓, `//evil.com` ✗, `https://evil.com` ✗).
 * `URLSearchParams.get("next")` zaten dekod eder; burada yalnızca geçit
 * doğrulanır.
 */
function safeNextTarget(raw: string | null): string | null {
  if (!raw) return null;
  // Protocol-relative açısını kapat (// , /\)
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (!raw.startsWith("/")) return null;
  return raw;
}

export async function signInWithGoogleCredential(
  credential: string,
  router: AppRouter,
): Promise<GoogleSignInResult> {
  const onSignIn = typeof window !== "undefined" && window.location.pathname.startsWith("/sign-in");
  const target = onSignIn
    ? (safeNextTarget(new URLSearchParams(window.location.search).get("next")) ?? "/")
    : null;

  const result = (await signIn(
    "google-onesig",
    { id_token: credential, callbackUrl: target ?? undefined },
    { redirect: false },
  )) as GoogleSignInResult;

  if (result?.error) {
    // Hedefe gitme; çağrıyan bileşen `google_signin_failed` gösterir.
    return result;
  }

  if (onSignIn && target) {
    // Sign-in kartı: hedefe git (Kullanıcının beklediği davranış).
    router.replace(target);
  } else {
    // Global kart (başka sayfa): bulunduğun yerde oturum açılmış UI'ı göster.
    await router.refresh();
  }

  return result;
}
