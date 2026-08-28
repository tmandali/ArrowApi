import { useCompanyStore } from "@/store/slices/company-store"

/** Header map for fetch / apiFetch when an active company is selected. */
export function getCompanyHeaders(): Record<string, string> {
  const activeCompanyId = useCompanyStore.getState().activeCompanyId
  if (!activeCompanyId) return {}
  return { "X-Company-Id": activeCompanyId }
}
