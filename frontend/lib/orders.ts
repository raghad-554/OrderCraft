import { apiFetch, newIdempotencyKey } from "@/lib/api";
import { buildPurchaseOrderPdf } from "@/lib/order-pdf";
import type { Product } from "@/lib/products";
import { listProducts } from "@/lib/products";
import { buildXlsx, XLSX_STYLE, type XlsxCell } from "@/lib/xlsx";

export type { Product };
export { listProducts };

export type OrderDirection = "Purchase" | "Sale";

export type OrderStatus =
  | "Draft"
  | "Pending"
  | "Rejected"
  | "Approved"
  | "Shipped"
  | "Delivered"
  | "Cancelled";

export type PaymentTerms = "Net30" | "Net60" | "Immediate";

export type PaymentStatus =
  | "Paid"
  | "Unpaid"
  | "PartiallyPaid"
  | "Overdue";

export type OrderItem = {
  id: string;
  productId: string;
  productName?: string | null;
  productSku?: string | null;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  totalPrice: number;
};

export type PurchaseOrder = {
  id: string;
  orderNumber: string;
  direction: OrderDirection;
  partnerCompanyId?: string | null;
  buyerCompanyId?: string | null;
  buyerCompanyName?: string | null;
  supplierCompanyId?: string | null;
  supplierCompanyName?: string | null;
  createdByUserId: string;
  status: OrderStatus;
  totalAmount: number;
  taxRate?: number;
  taxAmount?: number;
  subtotalAmount?: number;
  discountTotal?: number;
  approvalThreshold?: number;
  orderDate: string;
  deliveryDate?: string | null;
  paymentTerms?: PaymentTerms | null;
  notes?: string | null;
  rejectionReason?: string | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  invoicedAmount?: number;
  uninvoicedAmount?: number;
  paymentStatus?: PaymentStatus | null;
  orderItems: OrderItem[];
};

export type Invoice = {
  id: string;
  orderId: string;
  invoiceNumber: string;
  amount: number;
  status: PaymentStatus;
  dueDate: string;
};

export const ORDER_STATUSES: OrderStatus[] = [
  "Draft",
  "Pending",
  "Approved",
  "Shipped",
  "Delivered",
  "Cancelled",
  "Rejected",
];

export const PAYMENT_TERMS: { value: PaymentTerms; label: string }[] = [
  { value: "Net30", label: "Net 30" },
  { value: "Net60", label: "Net 60" },
  { value: "Immediate", label: "Immediate" },
];

export const KANBAN_COLUMNS: {
  status: OrderStatus;
  label: string;
  hint: string;
}[] = [
  { status: "Draft", label: "Draft", hint: "Not submitted yet" },
  { status: "Pending", label: "Pending", hint: "Awaiting approval" },
  { status: "Approved", label: "Approved", hint: "Ready to fulfill" },
  { status: "Shipped", label: "Shipped", hint: "In transit" },
  { status: "Delivered", label: "Delivered", hint: "Received" },
  { status: "Cancelled", label: "Cancelled", hint: "Closed / void" },
  { status: "Rejected", label: "Reject", hint: "Edit and resubmit" },
];

export type CreateOrderItemPayload = {
  productId: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  totalPrice: number;
};

export type CreateOrderPayload = {
  orderNumber: string;
  direction: OrderDirection;
  partnerCompanyId: string;
  status?: OrderStatus;
  notes?: string;
  orderDate?: string;
  deliveryDate?: string;
  paymentTerms?: PaymentTerms;
  taxRate?: number;
  orderItems: CreateOrderItemPayload[];
};

export type OrderFieldChange = {
  id: string;
  actorName: string;
  field: string;
  oldValue?: string | null;
  newValue?: string | null;
  createdAt: string;
};

export function listOrders() {
  return apiFetch<PurchaseOrder[]>("/api/Orders");
}

export function getOrder(id: string) {
  return apiFetch<PurchaseOrder>(`/api/Orders/${id}`);
}

export function listOrderHistory(id: string) {
  return apiFetch<OrderFieldChange[]>(`/api/Orders/${id}/history`);
}

export function createOrder(payload: CreateOrderPayload, idempotencyKey?: string) {
  return apiFetch<PurchaseOrder>("/api/Orders", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Idempotency-Key": idempotencyKey ?? newIdempotencyKey() },
  });
}

export function updateOrder(id: string, payload: CreateOrderPayload) {
  return apiFetch<PurchaseOrder>(`/api/Orders/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function updateOrderStatus(
  id: string,
  status: OrderStatus,
  rejectionReason?: string,
) {
  return apiFetch<PurchaseOrder>(`/api/Orders/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({
      status,
      rejectionReason: rejectionReason?.trim() || undefined,
    }),
  });
}

const PO_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  Draft: ["Pending", "Cancelled"],
  Pending: ["Approved", "Rejected", "Cancelled"],
  Rejected: ["Pending", "Cancelled"],
  Approved: ["Shipped", "Cancelled"],
  Shipped: ["Delivered"],
  Delivered: [],
  Cancelled: [],
};

export function nextOrderStatuses(from: OrderStatus): OrderStatus[] {
  return PO_TRANSITIONS[from] ?? [];
}

export function statusActionLabel(from: OrderStatus, to: OrderStatus) {
  if (to === "Approved" && from === "Pending") return "Approve";
  if (to === "Rejected") return "Reject";
  if (to === "Pending" && from === "Draft") return "Submit";
  if (to === "Pending" && from === "Rejected") return "Resubmit";
  return to;
}

export function canEditOrderDetails(status: OrderStatus) {
  return status === "Draft" || status === "Rejected";
}

export function canTransitionOrder(from: OrderStatus, to: OrderStatus) {
  return from === to || (PO_TRANSITIONS[from] ?? []).includes(to);
}

export function orderNeedsAdminApproval(order: {
  totalAmount?: number;
  approvalThreshold?: number;
}) {
  const threshold = Number(order.approvalThreshold || 0);
  return threshold > 0 && Number(order.totalAmount || 0) > threshold;
}

export function canApproveOrder(
  order: {
    createdByUserId: string;
    status: OrderStatus;
    totalAmount?: number;
    approvalThreshold?: number;
  },
  userId: string | undefined,
  admin: boolean,
) {
  if (order.status !== "Pending") return canTransitionOrder(order.status, "Approved");
  if (!canTransitionOrder("Pending", "Approved")) return false;
  if (orderNeedsAdminApproval(order) && !admin) return false;
  if (admin) return true;
  return (
    !!userId &&
    order.createdByUserId.toLowerCase() !== userId.toLowerCase()
  );
}

export function approveBlockedMessage(
  order: {
    createdByUserId: string;
    status: OrderStatus;
    totalAmount?: number;
    approvalThreshold?: number;
  },
  userId: string | undefined,
  admin: boolean,
) {
  if (orderNeedsAdminApproval(order) && !admin) {
    return "This order is above the approval threshold and must be approved by the authorized person.";
  }
  if (
    !!userId &&
    order.createdByUserId.toLowerCase() === userId.toLowerCase() &&
    !admin
  ) {
    return "You cannot approve an order you created.";
  }
  return "You cannot approve this order.";
}

export function canInvoiceOrder(order: {
  status: OrderStatus;
  invoiceId?: string | null;
  totalAmount?: number;
  uninvoicedAmount?: number;
}) {
  const remaining =
    order.uninvoicedAmount ??
    (order.invoiceId ? 0 : Number(order.totalAmount || 0));
  return (
    remaining > 0 &&
    (order.status === "Approved" ||
      order.status === "Shipped" ||
      order.status === "Delivered")
  );
}

export function generateInvoiceFromOrder(orderId: string, idempotencyKey?: string) {
  return apiFetch<Invoice>(`/api/Orders/${orderId}/invoice`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey ?? newIdempotencyKey() },
  });
}

export function formatOrderDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

export function formatOrderDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function paymentTermsLabel(value?: PaymentTerms | null) {
  if (!value) return "—";
  return PAYMENT_TERMS.find((t) => t.value === value)?.label ?? value;
}

export function statusTone(status: OrderStatus) {
  switch (status) {
    case "Draft":
      return "bg-slate-100 text-slate-600";
    case "Pending":
      return "bg-amber-50 text-amber-700";
    case "Rejected":
      return "bg-red-50 text-red-700";
    case "Approved":
      return "bg-sky-50 text-sky-700";
    case "Shipped":
      return "bg-indigo-50 text-indigo-700";
    case "Delivered":
      return "bg-emerald-50 text-emerald-700";
    case "Cancelled":
      return "bg-slate-100 text-slate-500";
  }
}

export function paymentLabel(status?: PaymentStatus | null): string {
  if (!status) return "Unpaid";
  switch (status) {
    case "PartiallyPaid":
      return "Partially Paid";
    case "Paid":
      return "Paid";
    case "Overdue":
      return "Overdue";
    case "Unpaid":
    default:
      return "Unpaid";
  }
}

export function paymentTone(status?: PaymentStatus | null) {
  const resolved = status ?? "Unpaid";
  switch (resolved) {
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

export function paymentDotTone(status?: PaymentStatus | null) {
  const resolved = status ?? "Unpaid";
  switch (resolved) {
    case "Paid":
      return "bg-emerald-500";
    case "PartiallyPaid":
      return "bg-amber-500";
    case "Overdue":
      return "bg-red-500";
    case "Unpaid":
    default:
      return "bg-slate-400";
  }
}

function orderMoneyParts(order: PurchaseOrder) {
  const items = order.orderItems ?? [];
  const discount =
    order.discountTotal ??
    items.reduce((sum, item) => sum + Number(item.discountAmount || 0), 0);
  const subtotal =
    order.subtotalAmount ??
    items.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0);
  const taxRate = Number(order.taxRate || 0);
  const tax =
    order.taxAmount ?? Math.round(subtotal * (taxRate / 100) * 100) / 100;
  const total = Number(order.totalAmount || subtotal + tax);
  return { items, subtotal, discount, taxRate, tax, total };
}

function xlsxText(value: string, style: number): XlsxCell {
  return { kind: "s", value, style };
}

function xlsxNumber(value: number, style: number): XlsxCell {
  return { kind: "n", value, style };
}

function xlsxDataStyle(zebra: boolean, money = false) {
  if (money) return zebra ? XLSX_STYLE.moneyAlt : XLSX_STYLE.money;
  return zebra ? XLSX_STYLE.cellAlt : XLSX_STYLE.cell;
}

function xlsxHeaderRow(labels: string[]): XlsxCell[] {
  return labels.map((label) => xlsxText(label, XLSX_STYLE.header));
}

export function exportOrdersExcel(
  orders: PurchaseOrder[],
  filename = "purchase-orders.xlsx",
) {
  const summaryHeaders = [
    "PO Number",
    "Buyer",
    "Vendor",
    "Date",
    "Delivery Date",
    "Payment Terms",
    "Subtotal",
    "Discount",
    "Tax Rate %",
    "Tax",
    "Amount",
    "Status",
    "Payment Status",
    "Invoice Number",
    "Lines",
    "Notes",
    "Rejection Reason",
  ];
  const lineHeaders = [
    "PO Number",
    "Buyer",
    "Vendor",
    "Status",
    "Product",
    "SKU",
    "Qty",
    "Unit price",
    "Discount",
    "Line total",
  ];

  const summaryRows: XlsxCell[][] = [
    [xlsxText("OrderCraft  |  Orders", XLSX_STYLE.title)],
    xlsxHeaderRow(summaryHeaders),
    ...orders.map((order, index) => {
      const { items, subtotal, discount, taxRate, tax, total } = orderMoneyParts(order);
      const zebra = index % 2 === 1;
      const text = xlsxDataStyle(zebra);
      const money = xlsxDataStyle(zebra, true);
      return [
        xlsxText(order.orderNumber, text),
        xlsxText(order.buyerCompanyName || "", text),
        xlsxText(order.supplierCompanyName || "", text),
        xlsxText(formatOrderDate(order.orderDate), text),
        xlsxText(order.deliveryDate ? formatOrderDate(order.deliveryDate) : "", text),
        xlsxText(paymentTermsLabel(order.paymentTerms), text),
        xlsxNumber(subtotal, money),
        xlsxNumber(discount, money),
        xlsxNumber(taxRate, text),
        xlsxNumber(tax, money),
        xlsxNumber(total, money),
        xlsxText(order.status, text),
        xlsxText(paymentLabel(order.paymentStatus), text),
        xlsxText(order.invoiceNumber || "", text),
        xlsxNumber(items.length, text),
        xlsxText(order.notes || "", text),
        xlsxText(order.rejectionReason || "", text),
      ];
    }),
  ];

  const lineData: XlsxCell[][] = [];
  orders.forEach((order) => {
    const items = order.orderItems ?? [];
    if (items.length === 0) {
      lineData.push([
        { kind: "s", value: order.orderNumber, style: 0 },
        { kind: "s", value: order.buyerCompanyName || "", style: 0 },
        { kind: "s", value: order.supplierCompanyName || "", style: 0 },
        { kind: "s", value: order.status, style: 0 },
        { kind: "s", value: "", style: 0 },
        { kind: "s", value: "", style: 0 },
        { kind: "n", value: 0, style: 0 },
        { kind: "n", value: 0, style: 0 },
        { kind: "n", value: 0, style: 0 },
        { kind: "n", value: 0, style: 0 },
      ]);
      return;
    }
    items.forEach((item) => {
      lineData.push([
        { kind: "s", value: order.orderNumber, style: 0 },
        { kind: "s", value: order.buyerCompanyName || "", style: 0 },
        { kind: "s", value: order.supplierCompanyName || "", style: 0 },
        { kind: "s", value: order.status, style: 0 },
        { kind: "s", value: item.productName || "Product", style: 0 },
        { kind: "s", value: item.productSku || "", style: 0 },
        { kind: "n", value: Number(item.quantity || 0), style: 0 },
        { kind: "n", value: Number(item.unitPrice || 0), style: 0 },
        { kind: "n", value: Number(item.discountAmount || 0), style: 0 },
        { kind: "n", value: Number(item.totalPrice || 0), style: 0 },
      ]);
    });
  });

  const lineRows: XlsxCell[][] = [
    [xlsxText("OrderCraft  |  Line items", XLSX_STYLE.title)],
    xlsxHeaderRow(lineHeaders),
    ...lineData.map((cells, index) => {
      const zebra = index % 2 === 1;
      return cells.map((cell, col) => {
        const money = col >= 7;
        const style = xlsxDataStyle(zebra, money);
        return cell.kind === "n"
          ? xlsxNumber(cell.value, style)
          : xlsxText(cell.value, style);
      });
    }),
  ];

  const bytes = buildXlsx([
    {
      name: "Orders",
      widths: [22, 28, 28, 16, 16, 16, 14, 14, 13, 13, 14, 14, 16, 24, 10, 36, 28],
      rows: summaryRows,
    },
    {
      name: "Line items",
      widths: [22, 28, 28, 14, 32, 18, 10, 14, 14, 14],
      rows: lineRows,
    },
  ]);

  downloadFile(
    bytes,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    filename.endsWith(".xls") ? `${filename}x` : filename,
  );
}

export function downloadOrderPdf(order: PurchaseOrder) {
  const { items, subtotal, discount, taxRate, tax, total } = orderMoneyParts(order);
  const isSale = order.direction === "Sale";
  const bytes = buildPurchaseOrderPdf({
    documentTitle: isSale ? "Sales order" : "Purchase order",
    numberLabel: isSale ? "SO NUMBER" : "PO NUMBER",
    orderNumber: order.orderNumber,
    vendor: order.supplierCompanyName || "—",
    buyer: order.buyerCompanyName || "—",
    orderDate: formatOrderDate(order.orderDate),
    deliveryDate: order.deliveryDate ? formatOrderDate(order.deliveryDate) : "—",
    paymentTerms: paymentTermsLabel(order.paymentTerms),
    status: order.status,
    paymentStatus: paymentLabel(order.paymentStatus),
    invoiceNumber: order.invoiceNumber || "",
    notes: order.notes || "",
    rejectionReason: order.rejectionReason || "",
    rejected: order.status === "Rejected",
    items: items.map((item) => ({
      product: item.productName || "Product",
      sku: item.productSku || "—",
      qty: String(item.quantity),
      unitPrice: formatMoney(Number(item.unitPrice)),
      discount: formatMoney(Number(item.discountAmount || 0)),
      lineTotal: formatMoney(Number(item.totalPrice)),
    })),
    discount: formatMoney(discount),
    subtotal: formatMoney(subtotal),
    taxLabel: `Tax (${taxRate}%)`,
    tax: formatMoney(tax),
    total: formatMoney(total),
  });
  const fileName = `${order.orderNumber.replace(/[^\w.-]+/g, "-")}.pdf`;
  downloadFile(bytes, "application/pdf", fileName);
}

function downloadFile(contents: string | Uint8Array, mime: string, filename: string) {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
