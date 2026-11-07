import { apiFetch } from "@/lib/api";

export type DashboardSummary = {
  orders: {
    total: number;
    draft: number;
    pending: number;
    approved: number;
  };
  invoices: {
    total: number;
    unpaid: number;
    partiallyPaid: number;
    paid: number;
    overdue: number;
    outstandingAmount: number;
  };
  partners: {
    clients: number;
    vendors: number;
  };
  productCount: number;
  employees: {
    active: number;
    total: number;
  };
  attention: {
    key: string;
    label: string;
    count: number;
    href: string;
  }[];
  recentActivity: {
    id: string;
    actorName: string;
    action: string;
    entityType: string;
    entityLabel?: string | null;
    summary?: string | null;
    createdAt: string;
  }[];
};

export function getDashboardSummary() {
  return apiFetch<DashboardSummary>("/api/Dashboard/summary");
}
