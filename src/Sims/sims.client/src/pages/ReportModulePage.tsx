import { useLocation, useParams } from "react-router-dom"
import { ReportModuleForm } from "@/features/reports"
import { unslugifyModule } from "@/lib/empty-module"
import NotFoundPage from "@/pages/NotFoundPage"

const WORKSPACES = new Set([
  "selling",
  "stock",
  "accounting",
  "manufacturing",
])

export default function ReportModulePage() {
  const { slug = "" } = useParams<{ slug: string }>()
  const { pathname } = useLocation()
  const workspace = pathname.split("/").filter(Boolean)[0] ?? ""

  if (!WORKSPACES.has(workspace) || !slug) {
    return <NotFoundPage />
  }

  return (
    <ReportModuleForm
      workspace={workspace}
      slug={slug}
      title={unslugifyModule(slug)}
    />
  )
}
