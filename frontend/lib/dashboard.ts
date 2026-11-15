import { apiFetch } from "@/lib/api";

export type MetricTrend = {
  currentPeriod: number;
  previousPeriod: number;
  deltaPercent?: number | null;
};

export type DashboardSummary = {
  orders: {
    total: number;
    draft: number;
    pending: number;
    approved: number;
    totalTrend?: MetricTrend | null;
    approvedTrend?: MetricTrend | null;
  };
  invoices: {
    total: number;
    unpaid: number;
    partiallyPaid: number;
    paid: number;
    overdue: number;
    outstandingAmount: number;
    openTrend?: MetricTrend | null;
  };
  partners: {
    clients: number;
    vendors: number;
    totalTrend?: MetricTrend | null;
  };
  productCount: number;
  productTrend?: MetricTrend | null;
  employees: {
    active: number;
    total: number;
    activeTrend?: MetricTrend | null;
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
  monthlyVolumes: {
    month: string;
    purchaseAmount: number;
    saleAmount: number;
  }[];
  progress: {
    paidInvoicePercent: number;
    fulfilledOrderPercent: number;
  };
  topVendorName?: string | null;
  topClientName?: string | null;
};

export function getDashboardSummary() {
  return apiFetch<DashboardSummary>("/api/Dashboard/summary");
}

export function formatTrendDelta(trend?: MetricTrend | null): string | null {
  if (!trend || trend.deltaPercent == null) return null;
  const value = Number(trend.deltaPercent);
  if (Number.isNaN(value)) return null;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}%`;
}

export function compactMoney(value: number) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
