import {
  selectActiveCompany,
  useCompanyStore,
} from "@/store/slices/company-store"

export function useActiveCompany() {
  const company = useCompanyStore(selectActiveCompany)
  const companies = useCompanyStore((state) => state.companies)
  const setActiveCompany = useCompanyStore((state) => state.setActiveCompany)

  return { company, companies, setActiveCompany }
}
