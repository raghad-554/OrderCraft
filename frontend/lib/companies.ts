import { apiFetch } from "@/lib/api";

export type CompanyType = "Supplier" | "Buyer" | "Both";
export type CompanyStatus = "Active" | "PendingReview" | "Inactive";

export type Company = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  taxNumber?: string | null;
  type: CompanyType;
  categoryId?: string | null;
  categoryName?: string | null;
  creditLimit?: number | null;
  paymentTerm?: string | null;
  discountRate?: number | null;
  orderCount: number;
  totalSpend: number;
  totalSales: number;
  outstandingBalance: number;
  payableBalance?: number;
  performanceScore?: number | null;
  status: CompanyStatus;
  createdAt: string;
};

export type CompanyPayload = {
  name: string;
  email: string;
  phone?: string;
  address?: string;
  taxNumber?: string;
  type: CompanyType;
  categoryId?: string | null;
  creditLimit?: number | null;
  paymentTerm?: string | null;
  discountRate?: number | null;
  totalSpend?: number | null;
  totalSales?: number | null;
  outstandingBalance?: number | null;
  performanceScore?: number | null;
  status: CompanyStatus;
};

export type Category = {
  id: string;
  name: string;
  description?: string | null;
};

export function listCompanies(params: { types?: CompanyType[]; name?: string } = {}) {
  const query = new URLSearchParams();
  if (params.types?.length) query.set("type", params.types.join(","));
  if (params.name?.trim()) query.set("name", params.name.trim());
  const qs = query.toString();
  return apiFetch<Company[]>(`/api/Companies${qs ? `?${qs}` : ""}`);
}

export function createCompany(payload: CompanyPayload) {
  return apiFetch<Company>("/api/Companies", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCompany(id: string, payload: CompanyPayload) {
  return apiFetch<Company>(`/api/Companies/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteCompany(id: string) {
  return apiFetch<void>(`/api/Companies/${id}`, { method: "DELETE" });
}

export function listCategories() {
  return apiFetch<Category[]>("/api/Categories");
}

export function money(value?: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function statusLabel(status: CompanyStatus) {
  if (status === "PendingReview") return "Pending Review";
  return status;
}
