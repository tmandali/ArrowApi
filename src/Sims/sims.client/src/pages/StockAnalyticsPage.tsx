import { AIChatAssistant } from "@/components/layout/ai-chat-assistant"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { StockAnalyticsForm } from "@/features/stock/item"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export default function StockAnalyticsPage() {
  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AppSidebar />
      <SidebarInset className="min-h-0 overflow-hidden bg-background">
        <StockAnalyticsForm />
        <AIChatAssistant />
      </SidebarInset>
    </SidebarProvider>
  )
}
