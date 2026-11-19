import { apiFetch } from "@/lib/api";
import { formatOrgMoney } from "@/lib/money";

export type Product = {
  id: string;
  companyId: string;
  companyName?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  name: string;
  description?: string | null;
  sku: string;
  price: number;
  currency?: string | null;
  stockQuantity: number;
  isActive: boolean;
};

export type ProductPayload = {
  companyId: string;
  categoryId?: string | null;
  name: string;
  description?: string;
  sku: string;
  price: number;
  stockQuantity: number;
  isActive?: boolean;
};

export function listProducts() {
  return apiFetch<Product[]>("/api/Products");
}

export function createProduct(payload: ProductPayload) {
  return apiFetch<Product>("/api/Products", {
    method: "POST",
    body: JSON.stringify({
      companyId: payload.companyId,
      categoryId: payload.categoryId || null,
      name: payload.name,
      description: payload.description,
      sku: payload.sku,
      price: payload.price,
      stockQuantity: payload.stockQuantity,
      isActive: payload.isActive ?? true,
    }),
  });
}

export function updateProduct(id: string, payload: ProductPayload) {
  return apiFetch<Product>(`/api/Products/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      companyId: payload.companyId,
      categoryId: payload.categoryId || null,
      name: payload.name,
      description: payload.description,
      sku: payload.sku,
      price: payload.price,
      stockQuantity: payload.stockQuantity,
      isActive: payload.isActive ?? true,
    }),
  });
}

export function deleteProduct(id: string) {
  return apiFetch<void>(`/api/Products/${id}`, { method: "DELETE" });
}

export function formatProductMoney(value: number, currency?: string | null) {
  return formatOrgMoney(value, currency);
}
