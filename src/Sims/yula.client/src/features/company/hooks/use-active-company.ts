import {
  selectActiveCompany,
  useCompanyStore,
} from "@/store/slices/company-store"

export function useActiveCompany() {
  const company = useCompanyStore(selectActiveCompany)
  const companies = useCompanyStore((state) => state.companies)
  const switchCompany = useCompanyStore((state) => state.switchCompany)
  const lastSwitchedAt = useCompanyStore((state) => state.lastSwitchedAt)

  return {
    company,
    companies,
    switchCompany,
    lastSwitchedAt,
  }
}
