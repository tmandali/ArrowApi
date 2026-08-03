import { AIChatAssistant } from "@/components/layout/ai-chat-assistant"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { ItemForm } from "@/features/stock/item"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export default function ItemPage() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-background">
        <ItemForm />
        <AIChatAssistant />
      </SidebarInset>
    </SidebarProvider>
  )
}
