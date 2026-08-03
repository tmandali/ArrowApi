import { Package } from "lucide-react"
import { useProducts } from "@/features/products"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export function ProductsList() {
  const { products, loading, error } = useProducts()

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        Ürünler yükleniyor…
      </div>
    )
  }

  if (error || products.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Empty className="max-w-md border rounded-xl bg-card p-10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Package className="size-5 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle className="text-base font-semibold">
              Henüz ürün yok
            </EmptyTitle>
            <EmptyDescription>
              {error
                ? "Ürün API’sine ulaşılamadı. Backend hazır olunca liste burada görünecek."
                : "Bu alanda ürün kayıtları listelenecek."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" className="h-8 text-xs" disabled>
              Yeni Ürün
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    )
  }

  return (
    <div className="flex-1 p-6">
      <div className="rounded-md border bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/20">
            <TableRow>
              <TableHead>Kod</TableHead>
              <TableHead>Ad</TableHead>
              <TableHead className="w-28">Id</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="font-medium">{product.code}</TableCell>
                <TableCell>{product.name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {product.id}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
