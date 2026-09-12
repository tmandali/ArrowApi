/**
 * `/login` → `/sign-in` yönlendirme sayfası (geriye dönük uyumluluk).
 * middleware.ts zaten `/sign-in`'i korumalı rotalardan yönlendiriyor;
 * bu sayfa eski `/login` linklerini yakalar.
 */
import { redirect } from "next/navigation";

export default function LoginRedirectPage() {
  redirect("/sign-in");
}
