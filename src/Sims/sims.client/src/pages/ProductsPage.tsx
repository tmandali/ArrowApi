import { ProductsList } from "@/features/products"
import { WorkspacePageHeader } from "@/components/layout/workspace-page-header"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"

export default function ProductsPage() {
  return (
    <>
      <WorkspacePageHeader>
        <Breadcrumb>
          <BreadcrumbList className="text-xs">
            <BreadcrumbItem>
              <BreadcrumbPage className="font-semibold text-foreground">
                Products
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </WorkspacePageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <ProductsList />
      </div>
    </>
  )
}
