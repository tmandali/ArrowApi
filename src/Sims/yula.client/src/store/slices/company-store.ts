import { create } from "zustand"
import type { Company } from "@/types/company"
import { COMPANY_CATALOG } from "@/lib/company-catalog"

/**
 * Şirket (tenant) durumu — iZLEMCİ MİRORU.
 *
 * Tek doğruluk kaynağı Auth.js session'ıdır: yetkili şirketler (`session.user.companies`)
 * ve aktif şirket (`session.user.activeCompanyId`) giriş anında backend'den
 * doldurulur; şirket geçişi `POST /api/companies/active` ile session JWT'sinin
 * yeniden imzalanmasıyla kalıcılaşır. Bu store yalnızca aynı oturumdaki
 * bileşen/header katmanlarına senkron erişim için aynadır — localStorage'a
 * yazılmaz (persist middleware'i bilinçli olarak KULLANILMAZ).
 *
 * Uygulama ilk açılışta `activeCompanyId` null'dur; `CompanySessionSync`
 * session gelince store'u doldurur (bkz. components/app/company-session-sync.tsx).
 */

/**
 * Seed fallback — tek kaynak `lib/company-catalog.ts`'dir (server + client
 * aynı listeyi görür); store yalnızca session hidrat olurana dek gösterir.
 */
export const MOCK_COMPANIES: Company[] = COMPANY_CATALOG

type CompanyState = {
  companies: Company[]
  activeCompanyId: string | null
  /**
   * Son başarılı yerel switch zamanı (0 = oturum boyunca geçiş yok).
   * Tüketici (nav rozeti) geçici "senkronize" mikro-göstergesi için kullanır.
   */
  lastSwitchedAt: number
  /** Session'dan besler: yetkili liste + aktif seçim (kuralı bkz. gövde). */
  hydrateFromSession: (
    companies: Company[],
    activeCompanyId: string | null,
    isAuthenticated: boolean
  ) => void
  /** Optimistik yerel geçiş; sunucuya kalıcı yazımı senkron katmanı yapar. */
  switchCompany: (id: string) => void
  /** Sunucu POST'u başarısız olursa session değerine iade. */
  rollbackTo: (id: string | null) => void
  setCompanies: (companies: Company[]) => void
}

function resolveActiveId(
  companies: Company[],
  activeCompanyId: string | null
): string | null {
  if (companies.length === 0) return null
  if (
    activeCompanyId &&
    companies.some((company) => company.id === activeCompanyId)
  ) {
    return activeCompanyId
  }
  return companies[0]?.id ?? null
}

export const useCompanyStore = create<CompanyState>()((set, get) => ({
  companies: MOCK_COMPANIES,
  activeCompanyId: null,
  lastSwitchedAt: 0,
  hydrateFromSession: (companies, activeCompanyId, isAuthenticated) => {
    set((state) => {
      // Yetkili liste: session'daki liste doluysa ODUR (yetki kaynağı);
      // boşsa mevcut (seed) liste korunur — backend ucu yokken seed çalışsın.
      const nextCompanies =
        companies.length > 0 ? companies : state.companies
      const inList = (id: string | null) =>
        !!id && nextCompanies.some((company) => company.id === id)

      let nextActive: string | null
      if (!isAuthenticated) {
        // Oturum yok → tenant bağlamı da yok (AppProviders "no-company" key'i ile
        // temiz yeniden mount olur; guard sayfa yönlendirir).
        nextActive = null
      } else if (inList(state.activeCompanyId)) {
        // İstemci seçim listede geçerliyse KORU: optimistik switch'in POST'u
        // uçuşta olabilir — session hâlâ eski değeri taşıyorsa store'u
        // geriye çekiştirme. Senkron katmanı eşitleyene kadar bu doğru hâldir.
        nextActive = state.activeCompanyId
      } else if (inList(activeCompanyId)) {
        nextActive = activeCompanyId
      } else {
        nextActive = nextCompanies[0]?.id ?? null
      }

      return { companies: nextCompanies, activeCompanyId: nextActive }
    })
  },
  switchCompany: (id) => {
    const { companies, activeCompanyId } = get()
    if (id === activeCompanyId) return
    if (!companies.some((company) => company.id === id)) return
    // Anlık + optimistik: AppProviders'ın key={activeCompanyId} remount'u
    // hemen başlar; panelar kendi loading state'leri ile dolar. Kalıcı
    // yazım (session JWT'si) CompanySessionSync POST'u ile sağlanır.
    set({ activeCompanyId: id, lastSwitchedAt: Date.now() })
  },
  rollbackTo: (id) => {
    set({ activeCompanyId: id ?? null })
  },
  setCompanies: (companies) => {
    set({
      companies,
      activeCompanyId: resolveActiveId(companies, get().activeCompanyId),
    })
  },
}))

export function selectActiveCompany(state: CompanyState): Company | null {
  const { companies, activeCompanyId } = state
  if (!activeCompanyId) return null
  return companies.find((company) => company.id === activeCompanyId) ?? null
}
