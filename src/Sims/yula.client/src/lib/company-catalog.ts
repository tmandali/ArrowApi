import type { Company } from "@/types/company";

/**
 * Şirket kataloğu — ŞİMDİLİK Next server tarafında yaşıyor.
 *
 * Sims.Server'in `GET /api/companies` ucu kurulduğunda yalnızca bu dosya
 * değişir: `getAuthorizedCompanies` ucu, Bearer access token + kullanıcı
 * (sub) bazında yetkili listeyi backend'den çeken proxy'ye çevrilir.
 * Oturum/jwt callback ve istemci katmanları sözleşmeye bağlıdır —
 * orada KOD DEĞİŞİKLİĞİ GEREKMEZ.
 */

export const COMPANY_CATALOG: Company[] = [
  { id: "lcw", name: "LC Waikiki", abbr: "LCW" },
  { id: "dipen", name: "Dipen", abbr: "DIP" },
  { id: "sun-inc", name: "Sun Inc", abbr: "SUN" },
];

/**
 * Kullanıcının yetkili şirketleri.
 *
 * Şimdilik statik: catalog'daki tüm şirketler herkesin erişimine açık
 * (backend yetki ucu yok). `user` parametresi bilinçli olarak imzada
 * tutuluyor — backend ucu gelince burada "bu kullanıcıya yetkili"
 * filtresi eklenirken çağıranlar (auth.ts jwt callback'i,
 * /api/companies route'u) değişmeyecek.
 */
export async function getAuthorizedCompanies(user?: {
  sub?: string;
  accessToken?: string;
}): Promise<Company[]> {
  void user; // Şimdilik kullanılmıyor; yetki ucu geldiğinde filtresi burada.
  return COMPANY_CATALOG;
}
