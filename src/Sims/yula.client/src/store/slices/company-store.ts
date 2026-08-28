import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { Company } from "@/types/company"

/** Seed list until `/api/companies` lands. */
export const MOCK_COMPANIES: Company[] = [
  { id: "lcw", name: "LC Waikiki", abbr: "LCW" },
  { id: "dipen", name: "Dipen", abbr: "DIP" },
  { id: "sun-inc", name: "Sun Inc", abbr: "SUN" },
]

export type CompanySwitchPhase =
  | "preparing"
  | "remounting"
  | "loading"
  | "finishing"

export type CompanySwitchTransition = {
  targetId: string
  progress: number
  phase: CompanySwitchPhase
}

type CompanyState = {
  companies: Company[]
  activeCompanyId: string | null
  /** When set, overlay runs and workspace remounts for this company. */
  switchTransition: CompanySwitchTransition | null
  setActiveCompany: (id: string) => void
  beginCompanySwitch: (id: string) => void
  applyCompanySwitch: () => void
  setSwitchProgress: (progress: number, phase: CompanySwitchPhase) => void
  endCompanySwitch: () => void
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
      switchTransition: null,
      setActiveCompany: (id) => {
        get().beginCompanySwitch(id)
      },
      beginCompanySwitch: (id) => {
        const { companies, activeCompanyId, switchTransition } = get()
        if (switchTransition) return
        if (id === activeCompanyId) return
        if (!companies.some((company) => company.id === id)) return
        set({
          switchTransition: {
            targetId: id,
            progress: 0,
            phase: "preparing",
          },
        })
      },
      applyCompanySwitch: () => {
        const { switchTransition } = get()
        if (!switchTransition) return
        set({
          activeCompanyId: switchTransition.targetId,
          switchTransition: {
            ...switchTransition,
            phase: "remounting",
            progress: Math.max(switchTransition.progress, 45),
          },
        })
      },
      setSwitchProgress: (progress, phase) => {
        const { switchTransition } = get()
        if (!switchTransition) return
        set({
          switchTransition: {
            ...switchTransition,
            progress: Math.min(100, Math.max(0, progress)),
            phase,
          },
        })
      },
      endCompanySwitch: () => {
        set({ switchTransition: null })
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
          switchTransition: null,
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

export function selectSwitchTargetCompany(
  state: CompanyState
): Company | null {
  const targetId = state.switchTransition?.targetId
  if (!targetId) return null
  return state.companies.find((company) => company.id === targetId) ?? null
}
