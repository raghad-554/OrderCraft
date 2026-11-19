import { apiFetch, newIdempotencyKey } from "@/lib/api";
import { formatOrgMoney } from "@/lib/money";

export type InvoiceStatus = "Paid" | "Unpaid" | "PartiallyPaid" | "Overdue";

export type Invoice = {
  id: string;
  orderId: string;
  orderNumber?: string | null;
  buyerCompanyName?: string | null;
  supplierCompanyName?: string | null;
  invoiceNumber: string;
  currency?: string;
  amount: number;
  amountPaid: number;
  outstanding: number;
  status: InvoiceStatus;
  dueDate: string;
};

export type CreateInvoicePayload = {
  orderId: string;
  invoiceNumber: string;
  amount: number;
  status: InvoiceStatus;
  dueDate: string;
};

export type UpdateInvoicePayload = {
  invoiceNumber: string;
  amount: number;
  status: InvoiceStatus;
  dueDate: string;
};

export const INVOICE_STATUSES: InvoiceStatus[] = [
  "Unpaid",
  "PartiallyPaid",
  "Paid",
  "Overdue",
];

export function listInvoices() {
  return apiFetch<Invoice[]>("/api/Invoices");
}

export function createInvoice(payload: CreateInvoicePayload, idempotencyKey?: string) {
  return apiFetch<Invoice>("/api/Invoices", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Idempotency-Key": idempotencyKey ?? newIdempotencyKey() },
  });
}

export function updateInvoice(id: string, payload: UpdateInvoicePayload) {
  return apiFetch<Invoice>(`/api/Invoices/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteInvoice(id: string) {
  return apiFetch<void>(`/api/Invoices/${id}`, { method: "DELETE" });
}

export function recordPayment(id: string, amount: number, idempotencyKey?: string) {
  return apiFetch<Invoice>(`/api/Invoices/${id}/payments`, {
    method: "POST",
    body: JSON.stringify({ amount }),
    headers: { "Idempotency-Key": idempotencyKey ?? newIdempotencyKey() },
  });
}

export function invoiceStatusLabel(status: InvoiceStatus) {
  if (status === "PartiallyPaid") return "Partially Paid";
  return status;
}

export function invoiceStatusTone(status: InvoiceStatus) {
  switch (status) {
    case "Paid":
      return "bg-emerald-50 text-emerald-700";
    case "PartiallyPaid":
      return "bg-amber-50 text-amber-700";
    case "Overdue":
      return "bg-red-50 text-red-700";
    case "Unpaid":
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export function formatInvoiceDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

export function toCents(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100);
}

export function formatInvoiceMoney(value: number, currency?: string | null) {
  return formatOrgMoney(value, currency);
}

export function toDateInputValue(value?: string | Date) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    const now = new Date();
    return now.toISOString().slice(0, 10);
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
