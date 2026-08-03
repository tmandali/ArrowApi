import { apiFetch } from "@/services"
import type { Product } from "../types/product"

const PRODUCTS_BASE = "/api/products"

export const productsService = {
  list: () => apiFetch<Product[]>(PRODUCTS_BASE),
  getById: (id: string) => apiFetch<Product>(`${PRODUCTS_BASE}/${id}`),
}
