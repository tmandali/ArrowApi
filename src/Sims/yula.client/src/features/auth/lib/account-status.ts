/**
 * Hesap durumu (app_users.status) saf mantık — provider'dan bağımsız.
 *
 * System Users ekranında tek geçerli değer `Active` / `Inactive`
 * (SystemUsersView'de diğer her şey `Active` sayılır). Bu modül yalnızca
 * eşleşme mantığını taşır; DB erişimi YOK (test'te import güvenli).
 */

/** Inactive kabul edilen durumlar (büyük/küçük harf duyarsız). */
export const INACTIVE_ACCOUNT_STATUSES = ["Inactive", "Deleted"];

/** DB'deki `app_users.status` girişi kullanıcıya erişim vermeli mi? */
export function isAccountStatusActive(status: string | null | undefined): boolean {
  if (!status) return true; // Satır/henüz yazılmamış → varsayılan Active
  return !INACTIVE_ACCOUNT_STATUSES.includes(String(status));
}
