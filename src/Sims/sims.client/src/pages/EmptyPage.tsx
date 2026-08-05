import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import {
  emptyWorkspaceHome,
  unslugifyModule,
} from "@/lib/empty-module"
import { FileQuestion, Plus, ArrowLeft } from "lucide-react"
import { Link, useParams } from "react-router-dom"

export default function EmptyModulePage() {
  const { workspace = "selling", slug = "module" } = useParams<{
    workspace: string
    slug: string
  }>()
  const moduleTitle = unslugifyModule(slug)
  const workspaceMeta =
    emptyWorkspaceHome[workspace] ?? emptyWorkspaceHome.selling

  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background/95 backdrop-blur px-4 text-xs">
        <div className="flex items-center gap-2 overflow-hidden">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-vertical:h-4 data-vertical:self-auto"
          />
          <Breadcrumb>
            <BreadcrumbList className="text-xs">
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to={workspaceMeta.url}>{workspaceMeta.label}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="font-semibold text-foreground">
                  {moduleTitle}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-6">
        <Empty className="max-w-md border rounded-xl bg-card p-10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileQuestion className="size-5 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle className="text-base font-semibold">
              {moduleTitle}
            </EmptyTitle>
            <EmptyDescription>
              {moduleTitle} modülü için henüz kayıt bulunmuyor. Yeni bir kayıt
              ekleyebilir veya {workspaceMeta.label} alanına dönebilirsiniz.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex items-center gap-2 pt-2">
              <Button size="sm" className="h-8 text-xs gap-1.5" asChild>
                <Link to={workspaceMeta.url}>
                  <ArrowLeft className="size-3.5" />
                  {workspaceMeta.label} Sayfasına Dön
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
              >
                <Plus className="size-3.5" />
                Yeni {moduleTitle}
              </Button>
            </div>
          </EmptyContent>
        </Empty>
      </div>
    </>
  )
}
