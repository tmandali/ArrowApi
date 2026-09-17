/**
 * Dev-only console yardımcıları — production derlemelerde (NODE_ENV=production,
 * Tauri prod build vb.) loglar tamamen bastırılır.
 *
 * Bilgilendirici başlangıç/önbellek logları için kullanılır. Uyarı/hata
 * logları (console.warn / console.error) prod'da görünmeye devam etmelidir.
 */
const IS_DEV = process.env.NODE_ENV !== "production";

export function devLog(...args: unknown[]): void {
  if (IS_DEV) console.log(...args);
}

export function devInfo(...args: unknown[]): void {
  if (IS_DEV) console.info(...args);
}
