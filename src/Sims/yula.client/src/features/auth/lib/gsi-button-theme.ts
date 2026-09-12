/**
 * GIS (Google Identity Services) buton teması — saf çözümleyici.
 *
 * Bileşen dosyasından ayrıldı (`google-one-tap-button.tsx` yalnız component
 * export etmeli — Fast Refresh; bkz. AGENTS.md). Tüketici: sign-in kartı.
 */

export type GsiButtonTheme = "outline" | "filled_blue" | "filled_black" | "outline_dark";

/**
 * Efektif GIS temasını çözer: explicit theme kazanır, verilmezse sistem
 * temasını izler (dark → outline_dark, light → outline).
 */
export function resolveGsiButtonTheme(
  theme: GsiButtonTheme | undefined,
  resolvedTheme: string | undefined,
): GsiButtonTheme {
  return theme ?? (resolvedTheme === "dark" ? "outline_dark" : "outline");
}
