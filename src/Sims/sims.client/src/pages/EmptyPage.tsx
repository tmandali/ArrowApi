import * as React from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { AIChatAssistant } from "@/components/ai-chat-assistant"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty"
import { FileQuestion, Plus, ArrowLeft } from "lucide-react"
import { Link } from "react-router-dom"

export default function EmptyModulePage() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-background">
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
                  <BreadcrumbPage className="font-semibold text-foreground">
                    Henüz Veri Yok
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

        {/* Empty State Display */}
        <div className="flex-1 flex items-center justify-center p-6">
          <Empty className="max-w-md border rounded-xl bg-card p-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileQuestion className="size-5 text-muted-foreground" />
              </EmptyMedia>
              <EmptyTitle className="text-base font-semibold">Bu Bağlantıda Henüz Veri Bulunmuyor</EmptyTitle>
              <EmptyDescription>
                Seçilen modül veya bağlantı için kayıt oluşturulmamış. Yeni bir kayıt ekleyebilir veya ana modüllere dönebilirsiniz.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <div className="flex items-center gap-2 pt-2">
                <Button size="sm" className="h-8 text-xs gap-1.5" asChild>
                  <Link to="/">
                    <ArrowLeft className="size-3.5" />
                    Satış Sayfasına Dön
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  <Plus className="size-3.5" />
                  Yeni Kayıt Oluştur
                </Button>
              </div>
            </EmptyContent>
          </Empty>
        </div>

        <AIChatAssistant />
      </SidebarInset>
    </SidebarProvider>
  )
}
