import { AppSidebar } from "@/components/layout/app-sidebar"
import { ItemForm } from "@/features/stock/item"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export default function ItemPage() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-background">
        <ItemForm />
      </SidebarInset>
    </SidebarProvider>
  )
}
