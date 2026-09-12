import { redirect } from "next/navigation";

/**
 * `/sign-up` kaldırıldı — ilk girişte hesap zaten oluşur (NextAuth JWT +
 * Keycloak/Google profili), ayrı bir kayıt akışı yoktu. Geriye dönük
 * uyumluluk için `/sign-in`'e yönlendirir (`?next=` korunur).
 */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  redirect(params.next ? `/sign-in?next=${encodeURIComponent(params.next)}` : "/sign-in");
}
