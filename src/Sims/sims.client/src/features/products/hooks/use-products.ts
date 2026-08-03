import { useEffect, useState } from "react"
import { productsService } from "../services/products-service"
import type { Product } from "../types/product"

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false

    setLoading(true)
    productsService
      .list()
      .then((data) => {
        if (!cancelled) {
          setProducts(data)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error("Failed to load products"))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { products, loading, error }
}
