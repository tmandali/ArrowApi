import {
  selectActiveCompany,
  useCompanyStore,
} from "@/store/slices/company-store"

export function useActiveCompany() {
  const company = useCompanyStore(selectActiveCompany)
  const companies = useCompanyStore((state) => state.companies)
  const setActiveCompany = useCompanyStore((state) => state.setActiveCompany)
  const beginCompanySwitch = useCompanyStore((state) => state.beginCompanySwitch)
  const switchTransition = useCompanyStore((state) => state.switchTransition)

  return {
    company,
    companies,
    setActiveCompany,
    beginCompanySwitch,
    isSwitching: switchTransition != null,
  }
}
