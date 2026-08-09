import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant"
import { WorkspaceAiDock } from "@/components/layout/workspace-ai-dock"
import { WorkspacePageHeader } from "@/components/layout/workspace-page-header"
import { Button } from "@/components/ui/button"
import {
  ButtonGroup,
  ButtonGroupSeparator,
} from "@/components/ui/button-group"
import { Download, LayoutGrid, List, Plus } from "lucide-react"

export default function Page() {
  return (
    <>
      <WorkspacePageHeader
        showSearch={false}
        searchPlaceholder="Search..."
        actions={
          <>
            <ButtonGroup>
              <Button variant="outline" size="sm" aria-label="Izgara görünümü">
                <LayoutGrid className="size-4" />
              </Button>
              <Button variant="outline" size="sm" aria-label="Liste görünümü">
                <List className="size-4" />
              </Button>
              <ButtonGroupSeparator />
              <Button variant="outline" size="sm">
                <Download className="size-4" />
                <span className="hidden sm:inline">Dışa Aktar</span>
              </Button>
              <Button size="sm">
                <Plus className="size-4" />
                <span className="hidden sm:inline">Yeni Ekle</span>
              </Button>
            </ButtonGroup>

            <AIChatAssistant variant="toolbar" />
          </>
        }
      >
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="#">Build Your Application</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>Data Fetching</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </WorkspacePageHeader>
      <WorkspaceAiDock>
        <div className="flex flex-1 flex-col gap-2 px-2 pb-2 pt-0">
          <div className="grid auto-rows-min gap-4 md:grid-cols-3">
            <div className="aspect-video rounded-xl bg-muted/50" />
            <div className="aspect-video rounded-xl bg-muted/50" />
            <div className="aspect-video rounded-xl bg-muted/50" />
          </div>
          <div className="min-h-screen flex-1 rounded-xl bg-muted/50 md:min-h-min" />
        </div>
      </WorkspaceAiDock>
    </>
  )
}
