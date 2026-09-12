/**
 * Google One Tap modu bayrağı.
 *
 * Server `.env`'indeki `GOOGLE_ONE_TAP` build'de `NEXT_PUBLIC_GOOGLE_ONE_TAP`
 * olarak client'a açılır (bkz. next.config.ts). Kabul edilen açık değerler:
 * `1`, `true`, `yes`, `on` (case-insensitive).
 *
 * Açıkken (`=1`) sign-in kartındaki Google OAuth redirect butonu gizlenir;
 * yerine GIS butonu (GoogleOneTapButton) çizilir — tek Google giriş noktası
 * GIS butonu olur, çift buton çıkmaz (bkz. provider-buttons.tsx).
 * Kapalıyken (veya tanımsızken) GIS butonu çıkmaz, Google girişi
 * sign-in'deki OAuth butonundandır.
 */
export function isGoogleOneTapEnabled(): boolean {
  const raw = (process.env.NEXT_PUBLIC_GOOGLE_ONE_TAP ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}
