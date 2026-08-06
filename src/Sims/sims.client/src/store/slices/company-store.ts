import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { Company } from "@/types/company"

/** Seed list until `/api/companies` lands. */
export const MOCK_COMPANIES: Company[] = [
  { id: "lcw", name: "LC Waikiki", abbr: "LCW" },
  { id: "dipen", name: "Dipen", abbr: "DIP" },
  { id: "sun-inc", name: "Sun Inc", abbr: "SUN" },
]

type CompanyState = {
  companies: Company[]
  activeCompanyId: string | null
  setActiveCompany: (id: string) => void
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

export const useCompanyStore = create<CompanyState>()(
  persist(
    (set, get) => ({
      companies: MOCK_COMPANIES,
      activeCompanyId: MOCK_COMPANIES[0]?.id ?? null,
      setActiveCompany: (id) => {
        const { companies, activeCompanyId } = get()
        if (id === activeCompanyId) return
        if (!companies.some((company) => company.id === id)) return
        set({ activeCompanyId: id })
      },
      setCompanies: (companies) => {
        set({
          companies,
          activeCompanyId: resolveActiveId(companies, get().activeCompanyId),
        })
      },
    }),
    {
      name: "sims-active-company",
      partialize: (state) => ({
        activeCompanyId: state.activeCompanyId,
        companies: state.companies,
      }),
      merge: (persisted, current) => {
        const raw = (persisted ?? {}) as Partial<CompanyState>
        const companies =
          raw.companies && raw.companies.length > 0
            ? raw.companies
            : current.companies
        return {
          ...current,
          ...raw,
          companies,
          activeCompanyId: resolveActiveId(
            companies,
            raw.activeCompanyId ?? current.activeCompanyId
          ),
        }
      },
    }
  )
)

export function selectActiveCompany(state: CompanyState): Company | null {
  const { companies, activeCompanyId } = state
  if (!activeCompanyId) return null
  return companies.find((company) => company.id === activeCompanyId) ?? null
}
