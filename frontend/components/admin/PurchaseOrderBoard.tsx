"use client";

import {
  DragEvent,
  FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { ApiError } from "@/lib/api";
import { canViewOrderFinancialHistory, getSession, isAdmin } from "@/lib/auth";
import { listCompanies, type Company } from "@/lib/companies";
import { canEditPage } from "@/lib/permissions";
import {
  type OrderDirection,
  type OrderStatus,
  type PaymentTerms,
  type PurchaseOrder,
  KANBAN_COLUMNS,
  ORDER_STATUSES,
  PAYMENT_TERMS,
  approveBlockedMessage,
  canApproveOrder,
  canEditOrderDetails,
  canInvoiceOrder,
  canTransitionOrder,
  nextOrderStatuses,
  statusActionLabel,
  createOrder,
  getOrder,
  updateOrder,
  downloadOrderPdf,
  exportOrdersExcel,
  formatMoney,
  formatOrderDate,
  formatOrderDateTime,
  generateInvoiceFromOrder,
  listOrderHistory,
  listOrders,
  type OrderFieldChange,
  paymentDotTone,
  paymentLabel,
  paymentTermsLabel,
  paymentTone,
  statusTone,
  updateOrderStatus,
} from "@/lib/orders";
import { listProducts, type Product } from "@/lib/products";

type ViewMode = "kanban" | "table";

const fieldClass =
  "w-full rounded-2xl border border-black/[0.06] bg-[#F3F5F7] px-3.5 py-2.5 text-sm font-medium text-[#0B1220] outline-none focus:bg-white focus:ring-2 focus:ring-[#051A2D]/30";

type LineForm = {
  productId: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  discountTouched: boolean;
};

function emptyLine(): LineForm {
  return {
    productId: "",
    quantity: "1",
    unitPrice: "",
    discount: "0",
    discountTouched: false,
  };
}

function orderKindLabel(direction: OrderDirection) {
  return direction === "Sale" ? "Sales order" : "Purchase order";
}

function orderNumberLabel(direction: OrderDirection) {
  return direction === "Sale" ? "SO number" : "PO number";
}

function orderDirectionLabel(direction: OrderDirection) {
  return direction === "Sale" ? "You sell" : "You buy";
}

function orderPartiesLine(order: {
  direction: OrderDirection;
  supplierCompanyName?: string | null;
  buyerCompanyName?: string | null;
}) {
  if (order.direction === "Sale") {
    return order.buyerCompanyName || "—";
  }
  return order.supplierCompanyName || "—";
}

function historyFieldLabel(field: string, direction: OrderDirection) {
  if (direction === "Sale") {
    if (field === "Buyer") return "Client";
    if (field === "Vendor") return "Seller";
  }
  return field;
}

function historyFieldValue(field: string, value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  if (field === "Direction") {
    if (trimmed === "Sale") return "You sell";
    if (trimmed === "Purchase") return "You buy";
  }
  return trimmed;
}

const LEGACY_HEADER_FIELDS = new Set([
  "Buyer",
  "Vendor",
  "Client",
  "Seller",
  "Direction",
  "Delivery date",
  "Payment terms",
  "Tax rate",
]);

/** Collapse noisy legacy rows into short Created / Terms / Item lines. */
function compactHistoryChanges(
  changes: OrderFieldChange[],
  direction: OrderDirection,
): { id: string; text: string }[] {
  const rows: { id: string; text: string }[] = [];
  const lineBuckets = new Map<
    string,
    { id: string; product?: string; qty?: string; price?: string; discount?: string; total?: string }
  >();
  const legacyHeader: Record<string, string> = {};
  let legacyHeaderId = "";
  const legacyIsCreate = changes
    .filter((c) => LEGACY_HEADER_FIELDS.has(c.field))
    .every((c) => !historyFieldValue(c.field, c.oldValue));

  for (const change of changes) {
    const lineMatch = change.field.match(
      /^(.+) \/ (Product|Quantity|Unit price|Discount|Line total)$/,
    );
    if (lineMatch) {
      const [, productName, part] = lineMatch;
      const bucket =
        lineBuckets.get(productName) ??
        ({ id: change.id } as {
          id: string;
          product?: string;
          qty?: string;
          price?: string;
          discount?: string;
          total?: string;
        });
      const value =
        historyFieldValue(change.field, change.newValue) ||
        historyFieldValue(change.field, change.oldValue);
      if (part === "Product") bucket.product = value;
      if (part === "Quantity") bucket.qty = value;
      if (part === "Unit price") bucket.price = value;
      if (part === "Discount") bucket.discount = value;
      if (part === "Line total") bucket.total = value;
      lineBuckets.set(productName, bucket);
      continue;
    }

    if (legacyIsCreate && LEGACY_HEADER_FIELDS.has(change.field)) {
      const value = historyFieldValue(change.field, change.newValue);
      if (value) {
        legacyHeader[change.field] = value;
        if (!legacyHeaderId) legacyHeaderId = change.id;
      }
      continue;
    }

    const label = historyFieldLabel(change.field, direction);
    const oldValue = formatHistoryMoneyText(
      historyFieldValue(change.field, change.oldValue),
      change.field,
    );
    const newValue = formatHistoryMoneyText(
      historyFieldValue(change.field, change.newValue),
      change.field,
    );
    if (!oldValue && !newValue) continue;
    if (!oldValue && newValue) {
      rows.push({ id: change.id, text: `${label}: ${newValue}` });
      continue;
    }
    if (oldValue && !newValue) {
      rows.push({ id: change.id, text: `${label}: removed ${oldValue}` });
      continue;
    }
    // Item before/after on separate labeled rows so long ERP lines stay readable.
    if (/^Item$/i.test(change.field)) {
      rows.push({ id: change.id, text: `Before · ${label}: ${oldValue}` });
      rows.push({
        id: `${change.id}-after`,
        text: `After · ${label}: ${newValue}`,
      });
      continue;
    }
    rows.push({ id: change.id, text: `${label}: ${oldValue} → ${newValue}` });
  }

  if (Object.keys(legacyHeader).length > 0) {
    const dir =
      legacyHeader.Direction ||
      (direction === "Sale" ? "You sell" : "You buy");
    const partner =
      direction === "Sale"
        ? legacyHeader.Client || legacyHeader.Buyer
        : legacyHeader.Vendor;
    const created =
      direction === "Sale"
        ? `${dir} to ${partner || "client"}`
        : `${dir} from ${partner || "vendor"}`;
    rows.unshift({ id: `${legacyHeaderId}-created`, text: `Created: ${created}` });

    const termsParts = [
      legacyHeader["Delivery date"],
      legacyHeader["Payment terms"],
      legacyHeader["Tax rate"] ? `Tax ${legacyHeader["Tax rate"]}` : "",
    ].filter(Boolean);
    if (termsParts.length > 0) {
      rows.splice(1, 0, {
        id: `${legacyHeaderId}-terms`,
        text: `Terms: ${termsParts.join(" · ")}`,
      });
    }
  }

  Array.from(lineBuckets.entries()).forEach(([name, bucket]) => {
    const product = bucket.product || name;
    const qty = bucket.qty || "?";
    const price = formatPlainMoney(bucket.price || "0.00");
    const discountNum = Number(String(bucket.discount || "0").replace(/,/g, ""));
    const parts = [`Item: ${product}`, `Qty: ${qty}`, `Unit: ${price}`];
    if (Number.isFinite(discountNum) && discountNum > 0) {
      parts.push(`Discount: ${formatPlainMoney(bucket.discount || "0")}`);
    }
    const total = bucket.total ? formatPlainMoney(bucket.total) : "";
    const head = parts.join(" · ");
    rows.push({
      id: bucket.id,
      text: total ? `${head} → Total: ${total}` : head,
    });
  });

  return rows;
}

/** Normalize stored Item math lines into ERP labeled form. */
function formatHistoryMoneyText(value: string, field: string) {
  if (!value) return value;
  if (!/^Item$/i.test(field)) return value;
  return rewriteLegacyItemLine(value);
}

function formatPlainMoney(raw: string) {
  const n = Number(String(raw).replace(/[$,]/g, "").trim());
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function rewriteLegacyItemLine(value: string) {
  // tools · 5 × 80000.00 (−200000.00) = 200000.00
  const match = value.match(
    /^(.+?) · (\d+)\s*[×x]\s*([0-9.,]+)(?:\s*\([−\-]?([0-9.,]+)\))?\s*=\s*([0-9.,]+)$/i,
  );
  if (!match) {
    // Already labeled, or unknown — still tidy bare money tokens if present.
    if (/Qty:\s*\d+/i.test(value)) return value;
    return value;
  }
  const [, product, qty, unit, discount, total] = match;
  const parts = [
    product.trim(),
    `Qty: ${qty}`,
    `Unit: ${formatPlainMoney(unit)}`,
  ];
  if (discount) {
    const d = Number(String(discount).replace(/,/g, ""));
    if (Number.isFinite(d) && d > 0) {
      parts.push(`Discount: ${formatPlainMoney(discount)}`);
    }
  }
  return `${parts.join(" · ")} → Total: ${formatPlainMoney(total)}`;
}

function groupFieldHistory(rows: OrderFieldChange[]) {
  const groups: {
    id: string;
    createdAt: string;
    actorName: string;
    changes: OrderFieldChange[];
  }[] = [];

  for (const row of rows) {
    const current = groups[groups.length - 1];
    if (
      current &&
      current.createdAt === row.createdAt &&
      current.actorName === row.actorName
    ) {
      current.changes.push(row);
      continue;
    }

    groups.push({
      id: row.id,
      createdAt: row.createdAt,
      actorName: row.actorName,
      changes: [row],
    });
  }

  for (const group of groups) group.changes.reverse();
  return groups;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function suggestedDiscount(gross: number, rate: number) {
  const safeRate = Math.min(100, Math.max(0, rate));
  return roundMoney(gross * (safeRate / 100));
}

function lineAmounts(line: LineForm) {
  const qty = Number(line.quantity);
  const price = Number(line.unitPrice);
  const gross = roundMoney(
    (Number.isFinite(qty) ? Math.max(0, qty) : 0) *
      (Number.isFinite(price) ? Math.max(0, price) : 0),
  );
  const raw = Number(line.discount);
  const discount = roundMoney(
    Math.min(gross, Math.max(0, Number.isFinite(raw) ? raw : 0)),
  );
  return { gross, discount, total: roundMoney(gross - discount) };
}

function orderDiscount(order: PurchaseOrder) {
  if (order.discountTotal != null) return Number(order.discountTotal);
  return (order.orderItems ?? []).reduce(
    (sum, item) => sum + Number(item.discountAmount || 0),
    0,
  );
}

function toDateInputValue(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function nextOrderNumber(direction: OrderDirection) {
  const prefix = direction === "Sale" ? "SO" : "PO";
  const stamp = new Date();
  const y = stamp.getFullYear();
  const m = String(stamp.getMonth() + 1).padStart(2, "0");
  const d = String(stamp.getDate()).padStart(2, "0");
  const r = Math.floor(Math.random() * 900 + 100);
  return `${prefix}-${y}${m}${d}-${r}`;
}

function withDirectionPrefix(orderNumber: string, direction: OrderDirection) {
  const prefix = direction === "Sale" ? "SO" : "PO";
  if (/^(PO|SO)-/i.test(orderNumber)) {
    return orderNumber.replace(/^(PO|SO)-/i, `${prefix}-`);
  }
  return orderNumber;
}

function sameMoney(a: number, b: number) {
  return roundMoney(a) === roundMoney(b);
}

function rejectedResubmitUnchanged(
  order: PurchaseOrder,
  form: {
    orderNumber: string;
    direction: OrderDirection;
    partnerCompanyId: string;
    deliveryDate: string;
    paymentTerms: PaymentTerms | "";
    taxRate: string;
    notes: string;
    lines: { productId: string; quantity: number; unitPrice: number; discount: number }[];
  },
) {
  const partnerId =
    order.partnerCompanyId ||
    (order.direction === "Sale" ? order.buyerCompanyId : order.supplierCompanyId) ||
    "";
  if (order.orderNumber.trim().toLowerCase() !== form.orderNumber.trim().toLowerCase()) {
    return false;
  }
  if ((order.direction === "Sale" ? "Sale" : "Purchase") !== form.direction) return false;
  if ((partnerId || "") !== form.partnerCompanyId) return false;
  const orderDelivery = order.deliveryDate
    ? toDateInputValue(new Date(order.deliveryDate))
    : "";
  if (orderDelivery !== form.deliveryDate) return false;
  if ((order.paymentTerms ?? "") !== form.paymentTerms) return false;
  if (!sameMoney(Number(order.taxRate || 0), Number(form.taxRate || 0))) return false;
  if ((order.notes ?? "").trim() !== form.notes.trim()) return false;

  const before = order.orderItems ?? [];
  if (before.length !== form.lines.length) return false;
  for (let i = 0; i < before.length; i++) {
    const left = before[i];
    const right = form.lines[i];
    if (left.productId !== right.productId) return false;
    if (Number(left.quantity) !== right.quantity) return false;
    if (!sameMoney(Number(left.unitPrice), right.unitPrice)) return false;
    if (!sameMoney(Number(left.discountAmount || 0), right.discount)) return false;
  }
  return true;
}

function parseOrderStatusParam(value: string | null): "All" | OrderStatus {
  if (!value) return "All";
  return (ORDER_STATUSES as readonly string[]).includes(value)
    ? (value as OrderStatus)
    : "All";
}

export default function PurchaseOrderBoard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = getSession();
  const organizationName = session?.organization?.name?.trim() || "Your organization";
  const admin = isAdmin(session?.user.role ?? "");
  const canSeeFinancialHistory = canViewOrderFinancialHistory(
    session?.user.role ?? "",
  );
  const currentUserId = session?.user.id;
  const canEdit = canEditPage(
    session?.permissions,
    "purchaseOrders",
    admin,
  );
  const canEditInvoices = canEditPage(
    session?.permissions,
    "invoices",
    isAdmin(session?.user.role ?? ""),
  );

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [view, setView] = useState<ViewMode>("kanban");
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState<"All" | OrderStatus>(() =>
    parseOrderStatusParam(searchParams.get("status")),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<OrderStatus | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [detailOrder, setDetailOrder] = useState<PurchaseOrder | null>(null);
  const [fieldHistory, setFieldHistory] = useState<OrderFieldChange[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingDraft, setEditingDraft] = useState<PurchaseOrder | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState("");
  const [direction, setDirection] = useState<OrderDirection>("Purchase");
  const [partnerCompanyId, setPartnerCompanyId] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>("Net30");
  const [taxRate, setTaxRate] = useState("0");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineForm[]>([emptyLine()]);
  const [rejectTarget, setRejectTarget] = useState<PurchaseOrder | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [rejectSaving, setRejectSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orderRows, companyRows, productRows] = await Promise.all([
        listOrders(),
        listCompanies(),
        listProducts(),
      ]);
      setOrders(orderRows);
      setCompanies(companyRows);
      setProducts(productRows.filter((p) => p.isActive));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load orders.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSearch(searchParams.get("q") ?? "");
    setStatusFilter(parseOrderStatusParam(searchParams.get("status")));
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get("create") !== "1" || !canEdit) return;
    openCreate();
    const next = new URLSearchParams(searchParams.toString());
    next.delete("create");
    const qs = next.toString();
    router.replace(qs ? `/admin/purchase-orders?${qs}` : "/admin/purchase-orders");
    // Intentionally run once when create=1 appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, canEdit, router]);

  function syncOrderFilters(nextSearch: string, nextStatus: "All" | OrderStatus) {
    const params = new URLSearchParams();
    if (nextSearch.trim()) params.set("q", nextSearch.trim());
    if (nextStatus !== "All") params.set("status", nextStatus);
    const qs = params.toString();
    router.replace(qs ? `/admin/purchase-orders?${qs}` : "/admin/purchase-orders");
  }

  const buyers = useMemo(
    () => companies.filter((c) => c.type === "Buyer" || c.type === "Both"),
    [companies],
  );
  const vendors = useMemo(
    () => companies.filter((c) => c.type === "Supplier" || c.type === "Both"),
    [companies],
  );
  const partners = direction === "Sale" ? buyers : vendors;
  const lineProducts = useMemo(() => {
    const scoped =
      direction === "Purchase"
        ? products.filter((p) => p.companyId === partnerCompanyId)
        : products;
    // Keep selected line products visible while editing even if catalog filter changes.
    const selectedIds = new Set(
      lines.map((line) => line.productId).filter(Boolean),
    );
    if (selectedIds.size === 0) return scoped;
    const missing = products.filter(
      (p) => selectedIds.has(p.id) && !scoped.some((s) => s.id === p.id),
    );
    return missing.length ? [...scoped, ...missing] : scoped;
  }, [direction, products, partnerCompanyId, lines]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (statusFilter !== "All" && order.status !== statusFilter) return false;
      if (!term) return true;
      const haystack = [
        order.orderNumber,
        order.buyerCompanyName,
        order.supplierCompanyName,
        order.status,
        paymentLabel(order.paymentStatus),
        order.invoiceNumber,
        order.notes,
        order.rejectionReason,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [orders, search, statusFilter]);

  useEffect(() => {
    if (!menuOpenId) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-po-actions]")) return;
      setMenuOpenId(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [menuOpenId]);

  useEffect(() => {
    if (!detailOrder) return;
    const latest = orders.find((o) => o.id === detailOrder.id);
    if (latest) {
      setDetailOrder(latest);
    }
  }, [orders, detailOrder?.id]);

  useEffect(() => {
    const orderId = detailOrder?.id;
    if (!orderId) {
      setFieldHistory([]);
      return;
    }

    let cancelled = false;
    setHistoryLoading(true);
    listOrderHistory(orderId)
      .then((rows) => {
        if (!cancelled) setFieldHistory(rows);
      })
      .catch(() => {
        if (!cancelled) setFieldHistory([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detailOrder?.id, orders]);

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(
      KANBAN_COLUMNS.map((col) => [col.status, [] as PurchaseOrder[]]),
    ) as Record<OrderStatus, PurchaseOrder[]>;

    for (const order of filtered) {
      map[order.status]?.push(order);
    }
    return map;
  }, [filtered]);

  const totals = useMemo(() => {
    const open = orders.filter((o) => o.status !== "Cancelled" && o.status !== "Delivered");
    const amount = open.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
    const pending = orders.filter((o) => o.status === "Pending").length;
    return { count: orders.length, open: open.length, amount, pending };
  }, [orders]);

  const selectedPartner = useMemo(
    () => companies.find((company) => company.id === partnerCompanyId) ?? null,
    [companies, partnerCompanyId],
  );

  const partnerDiscountRate = useMemo(() => {
    const rate = Number(selectedPartner?.discountRate ?? 0);
    return Number.isFinite(rate) ? Math.min(100, Math.max(0, rate)) : 0;
  }, [selectedPartner]);

  function patchLine(
    line: LineForm,
    patch: Partial<LineForm>,
    mode: "recalculate" | "edit-discount" | "reset-discount",
  ): LineForm {
    const next: LineForm = { ...line, ...patch };
    if (mode === "reset-discount") next.discountTouched = false;
    if (mode === "edit-discount") next.discountTouched = true;
    if (mode === "edit-discount") return next;
    const gross = lineAmounts({ ...next, discount: "0" }).gross;
    if (!next.discountTouched) {
      next.discount = String(suggestedDiscount(gross, partnerDiscountRate));
      return next;
    }
    const current = roundMoney(Math.max(0, Number(next.discount) || 0));
    next.discount = String(Math.min(current, gross));
    return next;
  }

  function updateLine(
    index: number,
    patch: Partial<LineForm>,
    mode: "recalculate" | "edit-discount" | "reset-discount",
  ) {
    setLines((prev) =>
      prev.map((row, i) => (i === index ? patchLine(row, patch, mode) : row)),
    );
  }

  const formTotals = useMemo(() => {
    const parts = lines.map(lineAmounts);
    const discount = roundMoney(parts.reduce((sum, part) => sum + part.discount, 0));
    const subtotal = roundMoney(parts.reduce((sum, part) => sum + part.total, 0));
    const rate = Math.min(100, Math.max(0, Number(taxRate) || 0));
    const tax = roundMoney(subtotal * (rate / 100));
    return { discount, subtotal, tax, rate, grand: roundMoney(subtotal + tax) };
  }, [lines, taxRate]);

  function chooseDirection(next: OrderDirection) {
    if (next === direction) return;
    // Editing an existing order must keep saved lines/partner — not create defaults.
    if (editingDraft) return;
    setDirection(next);
    setOrderNumber((current) => withDirectionPrefix(current, next));
    setPartnerCompanyId("");
    setLines([emptyLine()]);
  }

  function fillOrderForm(order: PurchaseOrder) {
    const nextDirection = order.direction === "Sale" ? "Sale" : "Purchase";
    const partnerId =
      order.partnerCompanyId ||
      (nextDirection === "Sale" ? order.buyerCompanyId : order.supplierCompanyId) ||
      "";
    const items = order.orderItems ?? [];

    setEditingDraft(order);
    setOrderNumber(order.orderNumber);
    setDirection(nextDirection);
    setPartnerCompanyId(partnerId);
    setDeliveryDate(order.deliveryDate ? toDateInputValue(new Date(order.deliveryDate)) : "");
    setPaymentTerms(order.paymentTerms ?? "Net30");
    setTaxRate(String(Number(order.taxRate || 0)));
    setNotes(order.notes ?? "");
    setLines(
      items.length > 0
        ? items.map((item) => ({
            productId: item.productId,
            quantity: String(item.quantity),
            unitPrice: String(Number(item.unitPrice)),
            discount: String(Number(item.discountAmount || 0)),
            discountTouched: true,
          }))
        : [emptyLine()],
    );
    setFormError(null);
    setModalOpen(true);
  }

  function openCreate() {
    setEditingDraft(null);
    setDirection("Purchase");
    setOrderNumber(nextOrderNumber("Purchase"));
    setPartnerCompanyId("");
    setDeliveryDate(toDateInputValue(new Date(Date.now() + 14 * 86400000)));
    setPaymentTerms("Net30");
    setTaxRate("0");
    setNotes("");
    setLines([emptyLine()]);
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setEditingDraft(null);
    setFormError(null);
  }

  async function openEditDraft(order: PurchaseOrder) {
    if (!canEdit || !canEditOrderDetails(order.status)) return;
    setMenuOpenId(null);
    setFormError(null);
    // Prefill from the card immediately, then refresh from API so rejected
    // resubmits always show saved values (not empty create defaults).
    fillOrderForm(order);
    try {
      const fresh = await getOrder(order.id);
      setOrders((rows) => rows.map((row) => (row.id === fresh.id ? fresh : row)));
      if (detailOrder?.id === fresh.id) {
        setDetailOrder(fresh);
      }
      fillOrderForm(fresh);
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? err.message
          : "Could not load the latest order details.",
      );
    }
  }

  async function submitOrder(status: "Draft" | "Pending") {
    if (!canEdit) {
      setFormError("You have view-only access to orders.");
      return;
    }
    if (!orderNumber.trim()) {
      setFormError(`${orderNumberLabel(direction)} is required.`);
      return;
    }
    if (!partnerCompanyId) {
      setFormError(direction === "Purchase" ? "Vendor is required." : "Client is required.");
      return;
    }
    if (!deliveryDate) {
      setFormError("Delivery date is required.");
      return;
    }
    if (!paymentTerms) {
      setFormError("Payment terms are required.");
      return;
    }

    const rate = Number(taxRate);
    if (Number.isNaN(rate) || rate < 0 || rate > 100) {
      setFormError("Tax rate must be between 0 and 100.");
      return;
    }

    const orderItems = [];
    for (const line of lines) {
      if (!line.productId) {
        setFormError("Each line needs a product.");
        return;
      }
      const qty = Number(line.quantity);
      if (!Number.isInteger(qty) || qty <= 0) {
        setFormError("Quantity must be a whole number greater than 0.");
        return;
      }
      const unitPrice = Number(line.unitPrice);
      if (Number.isNaN(unitPrice) || unitPrice <= 0) {
        setFormError("Unit price must be greater than 0.");
        return;
      }
      const discount = roundMoney(Number(line.discount));
      const gross = roundMoney(qty * unitPrice);
      if (!Number.isFinite(discount) || discount < 0) {
        setFormError("Discount cannot be negative.");
        return;
      }
      if (discount > gross) {
        setFormError("Discount cannot be greater than quantity times unit price.");
        return;
      }
      const product = products.find((p) => p.id === line.productId);
      if (!product) {
        setFormError("Selected product was not found.");
        return;
      }
      if (direction === "Purchase" && product.companyId !== partnerCompanyId) {
        setFormError("Products must belong to the selected vendor.");
        return;
      }
      orderItems.push({
        productId: product.id,
        quantity: qty,
        unitPrice,
        discountAmount: discount,
        totalPrice: roundMoney(gross - discount),
      });
    }

    if (orderItems.length === 0) {
      setFormError("Add at least one product line.");
      return;
    }

    if (
      editingDraft?.status === "Rejected" &&
      rejectedResubmitUnchanged(editingDraft, {
        orderNumber,
        direction,
        partnerCompanyId,
        deliveryDate,
        paymentTerms,
        taxRate,
        notes,
        lines: orderItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discountAmount,
        })),
      })
    ) {
      setFormError("Change at least one field before resubmitting.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        orderNumber: orderNumber.trim(),
        direction,
        partnerCompanyId,
        status,
        orderDate: editingDraft?.orderDate,
        deliveryDate: new Date(`${deliveryDate}T12:00:00`).toISOString(),
        paymentTerms,
        taxRate: rate,
        notes: notes.trim() || undefined,
        orderItems,
      };
      if (editingDraft) {
        await updateOrder(editingDraft.id, payload);
      } else {
        await createOrder(payload);
      }
      setModalOpen(false);
      setEditingDraft(null);
      await load();
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? err.message
          : editingDraft
            ? `Could not update ${orderKindLabel(direction).toLowerCase()}.`
            : `Could not create ${orderKindLabel(direction).toLowerCase()}.`,
      );
    } finally {
      setSaving(false);
    }
  }

  function onCreateForm(event: FormEvent) {
    event.preventDefault();
    void submitOrder("Pending");
  }

  async function moveOrder(orderId: string, status: OrderStatus) {
    const current = orders.find((o) => o.id === orderId);
    if (!current || current.status === status) return;
    if (!canEdit) {
      setError("You have view-only access to orders.");
      return;
    }
    if (!canTransitionOrder(current.status, status)) {
      setError(
        `Cannot change ${orderKindLabel(current.direction).toLowerCase()} status from ${current.status} to ${status}.`,
      );
      return;
    }
    if (status === "Approved" && !canApproveOrder(current, currentUserId, admin)) {
      setError(approveBlockedMessage(current, currentUserId, admin));
      return;
    }
    if (status === "Rejected" && current.status === "Pending") {
      setRejectTarget(current);
      setRejectReason("");
      setRejectError(null);
      return;
    }

    setBusyId(orderId);
    setError(null);
    const previous = orders;
    setOrders((rows) =>
      rows.map((row) => (row.id === orderId ? { ...row, status } : row)),
    );

    try {
      const updated = await updateOrderStatus(orderId, status);
      setOrders((rows) => rows.map((row) => (row.id === orderId ? updated : row)));
      if (detailOrder?.id === orderId) {
        setDetailOrder(updated);
      }
    } catch (err) {
      setOrders(previous);
      setError(err instanceof ApiError ? err.message : "Could not update order status.");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmReject() {
    if (!rejectTarget || !canEdit) return;
    const reason = rejectReason.trim();
    if (!reason) {
      setRejectError("A rejection reason is required.");
      return;
    }
    setRejectSaving(true);
    setRejectError(null);
    setError(null);
    try {
      const updated = await updateOrderStatus(rejectTarget.id, "Rejected", reason);
      setOrders((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
      if (detailOrder?.id === updated.id) {
        setDetailOrder(updated);
      }
      setRejectTarget(null);
      setRejectReason("");
    } catch (err) {
      setRejectError(
        err instanceof ApiError
          ? err.message
          : `Could not reject ${orderKindLabel(rejectTarget.direction).toLowerCase()}.`,
      );
    } finally {
      setRejectSaving(false);
    }
  }

  function onDragStart(event: DragEvent, orderId: string) {
    if (!canEdit) return;
    setMenuOpenId(null);
    setDraggingId(orderId);
    event.dataTransfer.setData("text/plain", orderId);
    event.dataTransfer.effectAllowed = "move";
  }

  function onDragEnd() {
    setDraggingId(null);
    setDropTarget(null);
  }

  function onDragOver(event: DragEvent, status: OrderStatus) {
    if (!canEdit) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTarget(status);
  }

  function onDrop(event: DragEvent, status: OrderStatus) {
    event.preventDefault();
    const orderId = event.dataTransfer.getData("text/plain") || draggingId;
    setDropTarget(null);
    setDraggingId(null);
    if (orderId) void moveOrder(orderId, status);
  }

  function openDetails(order: PurchaseOrder) {
    setMenuOpenId(null);
    setDetailOrder(order);
  }

  function closeDetails() {
    if (actionBusy) return;
    setDetailOrder(null);
  }

  async function applyDetailStatus(status: OrderStatus) {
    if (!detailOrder || !canEdit) return;
    setActionBusy(true);
    try {
      await moveOrder(detailOrder.id, status);
    } finally {
      setActionBusy(false);
    }
  }

  function detailStatusActions(order: PurchaseOrder) {
    const next = nextOrderStatuses(order.status);
    const canApprove = canApproveOrder(order, currentUserId, admin);
    return next.filter((status) => {
      if (status === "Approved" || (status === "Rejected" && order.status === "Pending")) {
        return canApprove;
      }
      return true;
    });
  }

  async function onGenerateInvoice(order: PurchaseOrder) {
    if (!canEditInvoices) {
      setError("You need invoice edit access to generate an invoice.");
      return;
    }
    setMenuOpenId(null);
    setActionBusy(true);
    setBusyId(order.id);
    setError(null);
    try {
      await generateInvoiceFromOrder(order.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not generate invoice.");
    } finally {
      setActionBusy(false);
      setBusyId(null);
    }
  }

  function onExport() {
    const stamp = new Date().toISOString().slice(0, 10);
    exportOrdersExcel(filtered, `orders-${stamp}.xlsx`);
  }

  const detailSubtotal = useMemo(() => {
    if (!detailOrder?.orderItems?.length) return Number(detailOrder?.totalAmount || 0);
    return detailOrder.orderItems.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0);
  }, [detailOrder]);

  const detailActions = useMemo(
    () => (detailOrder ? detailStatusActions(detailOrder) : []),
    [detailOrder, currentUserId, admin],
  );

  return (
    <div className="animate-rise">
      <AdminPageHeader
        title="Orders"
        description="Track purchase orders and sales orders — board view or table."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <button
                type="button"
                onClick={openCreate}
                className="rounded-full bg-[#051A2D] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#0a3050]"
              >
                Add order
              </button>
            ) : null}
            <div className="flex rounded-full bg-white p-1 ring-1 ring-black/[0.06]">
              <button
                type="button"
                onClick={() => setView("kanban")}
                className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                  view === "kanban"
                    ? "bg-[#051A2D] text-white"
                    : "text-[#051A2D] hover:bg-[#F8FAFB]"
                }`}
              >
                Board
              </button>
              <button
                type="button"
                onClick={() => setView("table")}
                className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                  view === "table"
                    ? "bg-[#051A2D] text-white"
                    : "text-[#051A2D] hover:bg-[#F8FAFB]"
                }`}
              >
                Table
              </button>
            </div>
          </div>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="All orders" value={String(totals.count)} />
        <StatCard label="Open pipeline" value={String(totals.open)} />
        <StatCard label="Open value" value={formatMoney(totals.amount)} />
        <StatCard
          label="Pending approvals"
          value={String(totals.pending)}
          emphasize={totals.pending > 0}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Search orders</span>
          <input
            value={search}
            onChange={(e) => {
              const next = e.target.value;
              setSearch(next);
              syncOrderFilters(next, statusFilter);
            }}
            placeholder="Search by order number, buyer, or vendor…"
            className="w-full rounded-2xl border border-black/[0.06] bg-white px-4 py-2.5 text-sm font-medium text-[#0B1220] outline-none ring-[#051A2D]/30 placeholder:text-[#8B95A5] focus:ring-2"
          />
        </label>
        <label className="shrink-0">
          <span className="sr-only">Filter by status</span>
          <select
            value={statusFilter}
            onChange={(e) => {
              const next = e.target.value as "All" | OrderStatus;
              setStatusFilter(next);
              syncOrderFilters(search, next);
            }}
            className="rounded-2xl border border-black/[0.06] bg-white px-4 py-2.5 text-sm font-bold text-[#051A2D] outline-none focus:ring-2 focus:ring-[#051A2D]/30"
          >
            <option value="All">All statuses</option>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={onExport}
          disabled={loading || filtered.length === 0}
          className="rounded-full border border-black/[0.08] bg-white px-4 py-2.5 text-sm font-bold text-[#051A2D] transition hover:bg-[#F8FAFB] disabled:opacity-50"
        >
          Export Excel
        </button>
        <p className="text-sm font-medium text-[#8B95A5]">
          {loading
            ? "Loading…"
            : `${filtered.length} shown${canEdit ? "" : " · view only"}`}
        </p>
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-[24px] border border-black/[0.04] bg-white px-5 py-12 text-center text-sm text-[#8B95A5]">
          Loading orders…
        </div>
      ) : view === "kanban" ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {KANBAN_COLUMNS.map((column) => {
            const cards = byStatus[column.status] ?? [];
            const activeDrop = dropTarget === column.status;
            return (
              <section
                key={column.status}
                onDragOver={(e) => onDragOver(e, column.status)}
                onDragLeave={() => setDropTarget((t) => (t === column.status ? null : t))}
                onDrop={(e) => onDrop(e, column.status)}
                className={`flex w-[260px] shrink-0 flex-col rounded-[24px] border bg-[#F8FAFB] transition ${
                  activeDrop
                    ? "border-[#051A2D]/40 bg-white shadow-md"
                    : "border-black/[0.04]"
                }`}
              >
                <header className="px-4 pb-2 pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-bold text-[#0B1220]">{column.label}</h2>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-[#8B95A5] ring-1 ring-black/[0.06]">
                      {cards.length}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs font-medium text-[#8B95A5]">{column.hint}</p>
                </header>

                <div className="flex flex-1 flex-col gap-2 px-3 pb-3">
                  {cards.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-black/[0.08] px-3 py-8 text-center text-xs font-medium text-[#8B95A5]">
                      {canEdit ? "Drop orders here" : "No orders"}
                    </div>
                  ) : (
                    cards.map((order) => {
                      const canInvoice = canEdit && canEditInvoices && canInvoiceOrder(order);
                      const canApprove =
                        canEdit && canApproveOrder(order, currentUserId, admin);
                      const payLabel = paymentLabel(order.paymentStatus);
                      return (
                        <article
                          key={order.id}
                          draggable={canEdit}
                          onDragStart={(e) => onDragStart(e, order.id)}
                          onDragEnd={onDragEnd}
                          className={`relative rounded-[18px] border border-black/[0.04] bg-white px-3.5 py-3 shadow-sm transition ${
                            canEdit ? "cursor-grab active:cursor-grabbing" : ""
                          } ${draggingId === order.id ? "opacity-50" : ""} ${
                            busyId === order.id ? "opacity-70" : ""
                          } ${menuOpenId === order.id ? "z-20" : "z-0"}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-[#0B1220]">
                                {order.orderNumber}
                              </p>
                              <p className="mt-1 text-xs font-medium text-[#8B95A5]">
                                {orderDirectionLabel(order.direction)} ·{" "}
                                {orderPartiesLine(order)}
                              </p>
                            </div>
                            <div className="relative shrink-0" data-po-actions>
                              <button
                                type="button"
                                aria-label={`Actions for ${order.orderNumber}`}
                                disabled={busyId === order.id}
                                draggable={false}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMenuOpenId((id) =>
                                    id === order.id ? null : order.id,
                                  );
                                }}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-base font-bold leading-none text-[#051A2D] hover:bg-[#051A2D]/[0.06] disabled:opacity-50"
                              >
                                ···
                              </button>
                              {menuOpenId === order.id ? (
                                <div className="absolute right-0 top-8 z-30 min-w-[180px] rounded-2xl border border-black/[0.06] bg-white p-1.5 shadow-lg ring-1 ring-black/5">
                                  <button
                                    type="button"
                                    onClick={() => openDetails(order)}
                                    className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#0B1220] hover:bg-[#F8FAFB]"
                                  >
                                    View details
                                  </button>
                                  {canEdit && canEditOrderDetails(order.status) ? (
                                    <button
                                      type="button"
                                      onClick={() => openEditDraft(order)}
                                      className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#0B1220] hover:bg-[#F8FAFB]"
                                    >
                                      {order.status === "Rejected"
                                        ? "Edit and resubmit"
                                        : "Edit draft"}
                                    </button>
                                  ) : null}
                                  {canInvoice ? (
                                    <button
                                      type="button"
                                      onClick={() => void onGenerateInvoice(order)}
                                      className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#051A2D] hover:bg-[#F8FAFB]"
                                    >
                                      Generate invoice
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setMenuOpenId(null);
                                      downloadOrderPdf(order);
                                    }}
                                    className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#0B1220] hover:bg-[#F8FAFB]"
                                  >
                                    Download PDF
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <div className="mt-2.5 flex items-center justify-between gap-2">
                            <span
                              dir="ltr"
                              className="text-sm font-semibold tabular-nums text-[#051A2D]"
                            >
                              {formatMoney(Number(order.totalAmount))}
                            </span>
                            <span className="text-[11px] font-medium text-[#8B95A5]">
                              {formatOrderDate(order.orderDate)}
                            </span>
                          </div>

                          {order.rejectionReason ? (
                            <p
                              className={`mt-2.5 line-clamp-2 rounded-xl px-2 py-1.5 text-[11px] font-medium ${
                                order.status === "Rejected"
                                  ? "bg-red-50 text-red-700"
                                  : "bg-[#F8FAFB] text-[#8B95A5]"
                              }`}
                              title={order.rejectionReason}
                            >
                              {order.status === "Rejected" ? "Rejected: " : "Last rejection: "}
                              {order.rejectionReason}
                            </p>
                          ) : null}

                          <div className="mt-2.5 flex flex-nowrap items-center gap-1.5">
                            <span
                              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${paymentTone(order.paymentStatus)}`}
                              title={`Payment: ${payLabel}`}
                            >
                              <span
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${paymentDotTone(order.paymentStatus)}`}
                                aria-hidden
                              />
                              {payLabel}
                            </span>
                            {canApprove && order.status === "Pending" ? (
                              <>
                                <button
                                  type="button"
                                  disabled={busyId === order.id}
                                  draggable={false}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void moveOrder(order.id, "Approved");
                                  }}
                                  className="shrink-0 rounded-full bg-[#051A2D] px-2 py-0.5 text-[10px] font-bold text-white hover:bg-[#0a3050] disabled:opacity-50"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === order.id}
                                  draggable={false}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRejectTarget(order);
                                    setRejectReason("");
                                    setRejectError(null);
                                  }}
                                  className="shrink-0 rounded-full border border-red-200 bg-white px-2 py-0.5 text-[10px] font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              </>
                            ) : null}
                            {order.orderItems?.length ? (
                              <span className="ml-auto shrink-0 text-[11px] font-medium text-[#8B95A5]">
                                {order.orderItems.length} line
                                {order.orderItems.length === 1 ? "" : "s"}
                              </span>
                            ) : null}
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-[24px] border border-black/[0.04] bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#F8FAFB] text-xs font-semibold tracking-wide text-[#8B95A5]">
                <tr>
                  <th className="px-5 py-3.5">Order number</th>
                  <th className="px-5 py-3.5">Buyer</th>
                  <th className="px-5 py-3.5">Vendor</th>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5 text-right">Amount</th>
                  <th className="px-5 py-3.5 text-right">Discount</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Payment</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-12 text-center text-[#8B95A5]">
                      No orders found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((order) => {
                    const canInvoice = canEdit && canEditInvoices && canInvoiceOrder(order);
                    return (
                      <tr
                        key={order.id}
                        className="border-t border-transparent transition hover:bg-[#F8FAFB]"
                      >
                        <td className="px-5 py-3.5 font-semibold text-[#0B1220]">
                          {order.orderNumber}
                        </td>
                        <td className="px-5 py-3.5 text-[#4B5563]">
                          {order.buyerCompanyName || "—"}
                        </td>
                        <td className="px-5 py-3.5 text-[#4B5563]">
                          {order.supplierCompanyName || "—"}
                        </td>
                        <td className="px-5 py-3.5 text-[#4B5563]">
                          {formatOrderDate(order.orderDate)}
                        </td>
                        <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-[#0B1220]">
                          {formatMoney(Number(order.totalAmount))}
                        </td>
                        <td className="px-5 py-3.5 text-right font-medium tabular-nums text-[#4B5563]">
                          {formatMoney(orderDiscount(order))}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusTone(order.status)}`}
                          >
                            {order.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${paymentTone(order.paymentStatus)}`}
                          >
                            {paymentLabel(order.paymentStatus)}
                          </span>
                        </td>
                        <td className="relative px-5 py-3.5 text-right">
                          <div className="inline-flex justify-end" data-po-actions>
                            <button
                              type="button"
                              aria-label={`Actions for ${order.orderNumber}`}
                              disabled={busyId === order.id}
                              onClick={() =>
                                setMenuOpenId((id) => (id === order.id ? null : order.id))
                              }
                              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold leading-none text-[#051A2D] hover:bg-[#051A2D]/[0.06] disabled:opacity-50"
                            >
                              ···
                            </button>
                            {menuOpenId === order.id ? (
                              <div className="absolute right-5 top-12 z-20 min-w-[200px] rounded-2xl border border-black/[0.06] bg-white p-1.5 shadow-lg ring-1 ring-black/5">
                                <button
                                  type="button"
                                  onClick={() => openDetails(order)}
                                  className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#0B1220] hover:bg-[#F8FAFB]"
                                >
                                  View / Edit details
                                </button>
                                {canEdit && canEditOrderDetails(order.status) ? (
                                  <button
                                    type="button"
                                    onClick={() => openEditDraft(order)}
                                    className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#0B1220] hover:bg-[#F8FAFB]"
                                  >
                                    {order.status === "Rejected"
                                      ? "Edit and resubmit"
                                      : "Edit draft"}
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMenuOpenId(null);
                                    downloadOrderPdf(order);
                                  }}
                                  className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#0B1220] hover:bg-[#F8FAFB]"
                                >
                                  Download PDF
                                </button>
                                {canInvoice ? (
                                  <button
                                    type="button"
                                    onClick={() => void onGenerateInvoice(order)}
                                    className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#051A2D] hover:bg-[#F8FAFB]"
                                  >
                                    Generate invoice
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 bg-[#051A2D]/55"
            onClick={closeModal}
          />
          <div className="relative z-10 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl sm:p-7">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-[#0B1220]">
                  {editingDraft?.status === "Rejected"
                    ? `Edit rejected ${orderKindLabel(direction).toLowerCase()}`
                    : editingDraft
                      ? `Edit draft ${orderKindLabel(direction).toLowerCase()}`
                      : `Add ${orderKindLabel(direction).toLowerCase()}`}
                </h2>
                <p className="mt-1 text-sm font-medium text-[#8B95A5]">
                  {editingDraft?.status === "Rejected"
                    ? "Change at least one field, then save to resubmit for approval."
                    : direction === "Purchase"
                      ? "Your organization is the buyer. Pick a vendor, then add its products."
                      : "Your organization is the seller. Pick a client, then add products."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full px-3 py-1 text-sm font-bold text-[#8B95A5] hover:bg-[#F3F5F7]"
              >
                Close
              </button>
            </div>

            {editingDraft?.status === "Rejected" && editingDraft.rejectionReason ? (
              <p className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                Rejection reason: {editingDraft.rejectionReason}
              </p>
            ) : null}

            <form noValidate onSubmit={onCreateForm} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={`${orderNumberLabel(direction)} *`} className="sm:col-span-2">
                  <input
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    className={fieldClass}
                  />
                </Field>
                <div className="sm:col-span-2 flex rounded-full bg-[#F3F5F7] p-1">
                  {(
                    [
                      ["Purchase", "You buy"],
                      ["Sale", "You sell"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      disabled={!!editingDraft}
                      onClick={() => chooseDirection(value)}
                      className={`flex-1 rounded-full px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed ${
                        direction === value
                          ? "bg-[#051A2D] text-white"
                          : "text-[#4B5563] hover:text-[#0B1220]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <Field label={direction === "Purchase" ? "Buyer" : "Seller"}>
                  <input
                    value={organizationName}
                    readOnly
                    className={`${fieldClass} text-[#4B5563]`}
                  />
                </Field>
                <div>
                  <Field label={direction === "Purchase" ? "Vendor *" : "Client *"}>
                    <select
                      value={partnerCompanyId}
                      onChange={(e) => {
                        setPartnerCompanyId(e.target.value);
                        if (direction === "Purchase") setLines([emptyLine()]);
                      }}
                      className={fieldClass}
                    >
                      <option value="">
                        {direction === "Purchase" ? "Select vendor" : "Select client"}
                      </option>
                      {partners.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {selectedPartner ? (
                    <p className="mt-1.5 text-xs font-medium text-[#8B95A5]">
                      {direction === "Purchase"
                        ? "You owe this vendor"
                        : "This client owes you"}{" "}
                      {formatMoney(
                        Number(
                          direction === "Purchase"
                            ? selectedPartner.payableBalance || 0
                            : selectedPartner.outstandingBalance || 0,
                        ),
                      )}
                    </p>
                  ) : null}
                </div>
                <Field label="Delivery date *">
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className={fieldClass}
                  />
                </Field>
                <Field label="Payment terms *">
                  <select
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value as PaymentTerms)}
                    className={fieldClass}
                  >
                    {PAYMENT_TERMS.map((term) => (
                      <option key={term.value} value={term.value}>
                        {term.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Tax rate (%)">
                  <input
                    inputMode="decimal"
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                    className={fieldClass}
                    placeholder="0"
                  />
                </Field>
                <Field label="Notes" className="sm:col-span-2">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className={`${fieldClass} resize-none`}
                    placeholder="Optional"
                  />
                </Field>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wide text-[#8B95A5]">
                    Line items *
                  </p>
                  <button
                    type="button"
                    onClick={() => setLines((prev) => [...prev, emptyLine()])}
                    className="text-xs font-bold text-[#051A2D] hover:underline"
                  >
                    + Add line
                  </button>
                </div>

                {direction === "Purchase" && !partnerCompanyId ? (
                  <p className="rounded-2xl bg-[#F8FAFB] px-3 py-3 text-sm font-medium text-[#8B95A5]">
                    Choose a vendor first to load its products.
                  </p>
                ) : lineProducts.length === 0 ? (
                  <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-medium text-amber-800">
                    {direction === "Purchase"
                      ? "This vendor has no active products yet. Add products for the vendor company first."
                      : "No active products yet."}
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-black/[0.06]">
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-[#F8FAFB] text-xs font-semibold tracking-wide text-[#8B95A5]">
                          <tr>
                            <th className="px-3 py-2.5">Product</th>
                            <th className="w-24 px-3 py-2.5 text-right">Qty</th>
                            <th className="w-32 px-3 py-2.5 text-right">Unit price</th>
                            <th className="w-28 px-3 py-2.5 text-right">Discount</th>
                            <th className="w-28 px-3 py-2.5 text-right">Total</th>
                            <th className="w-16 px-3 py-2.5" />
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map((line, index) => {
                            const amounts = lineAmounts(line);
                            return (
                              <tr key={index} className="border-t border-transparent">
                                <td className="px-3 py-2">
                                  <select
                                    value={line.productId}
                                    onChange={(e) => {
                                      const productId = e.target.value;
                                      const product = lineProducts.find(
                                        (p) => p.id === productId,
                                      );
                                      updateLine(
                                        index,
                                        {
                                          productId,
                                          unitPrice: product
                                            ? String(Number(product.price))
                                            : "",
                                        },
                                        "reset-discount",
                                      );
                                    }}
                                    className={fieldClass}
                                  >
                                    <option value="">Select product</option>
                                    {lineProducts.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.name}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    inputMode="numeric"
                                    value={line.quantity}
                                    onChange={(e) =>
                                      updateLine(
                                        index,
                                        { quantity: e.target.value },
                                        "recalculate",
                                      )
                                    }
                                    className={`${fieldClass} text-right tabular-nums`}
                                    placeholder="Qty"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    inputMode="decimal"
                                    value={line.unitPrice}
                                    onChange={(e) =>
                                      updateLine(
                                        index,
                                        { unitPrice: e.target.value },
                                        "recalculate",
                                      )
                                    }
                                    className={`${fieldClass} text-right tabular-nums`}
                                    placeholder="0.00"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    inputMode="decimal"
                                    value={line.discount}
                                    onChange={(e) =>
                                      updateLine(
                                        index,
                                        { discount: e.target.value },
                                        "edit-discount",
                                      )
                                    }
                                    className={`${fieldClass} text-right tabular-nums`}
                                    placeholder="0.00"
                                  />
                                </td>
                                <td
                                  dir="ltr"
                                  className="px-3 py-2 text-right font-semibold tabular-nums text-[#0B1220]"
                                >
                                  {formatMoney(amounts.total)}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {lines.length > 1 ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setLines((prev) =>
                                          prev.filter((_, i) => i !== index),
                                        )
                                      }
                                      className="text-xs font-bold text-red-600"
                                    >
                                      Remove
                                    </button>
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="mt-3 ml-auto w-full max-w-xs space-y-1.5 rounded-2xl bg-[#F8FAFB] px-4 py-3 text-sm">
                  <div className="flex justify-between font-medium text-[#4B5563]">
                    <span>Discount</span>
                    <span>{formatMoney(formTotals.discount)}</span>
                  </div>
                  <div className="flex justify-between font-medium text-[#4B5563]">
                    <span>Subtotal</span>
                    <span>{formatMoney(formTotals.subtotal)}</span>
                  </div>
                  <div className="flex justify-between font-medium text-[#4B5563]">
                    <span>Tax ({formTotals.rate}%)</span>
                    <span>{formatMoney(formTotals.tax)}</span>
                  </div>
                  <div className="flex justify-between border-t border-black/[0.08] pt-2 text-base font-bold text-[#0B1220]">
                    <span>Grand total</span>
                    <span>{formatMoney(formTotals.grand)}</span>
                  </div>
                </div>
              </div>

              {formError ? (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                  {formError}
                </p>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="rounded-full px-4 py-2.5 text-sm font-bold text-[#8B95A5] hover:bg-[#F3F5F7] disabled:opacity-50"
                >
                  Cancel
                </button>
                {editingDraft?.status === "Rejected" ? null : (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void submitOrder("Draft")}
                    className="rounded-full border border-black/[0.08] bg-white px-5 py-2.5 text-sm font-bold text-[#051A2D] hover:bg-[#F8FAFB] disabled:opacity-50"
                  >
                    {saving ? "Saving…" : editingDraft ? "Save draft" : "Save as Draft"}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-full bg-[#051A2D] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0a3050] disabled:opacity-50"
                >
                  {saving
                    ? "Submitting…"
                    : editingDraft?.status === "Rejected"
                      ? "Save and resubmit"
                      : "Submit for Approval"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {detailOrder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close details"
            className="absolute inset-0 bg-[#051A2D]/55"
            onClick={closeDetails}
          />
          <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl sm:p-7">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-[#0B1220]">
                  {detailOrder.orderNumber}
                </h2>
                <p className="mt-1 text-sm font-medium text-[#8B95A5]">
                  {orderDirectionLabel(detailOrder.direction)} ·{" "}
                  {orderPartiesLine(detailOrder)} ·{" "}
                  {formatOrderDate(detailOrder.orderDate)}
                </p>
                <p className="mt-1 text-sm font-medium text-[#8B95A5]">
                  Delivery:{" "}
                  {detailOrder.deliveryDate
                    ? formatOrderDate(detailOrder.deliveryDate)
                    : "—"}{" "}
                  · Terms: {paymentTermsLabel(detailOrder.paymentTerms)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusTone(detailOrder.status)}`}
                  >
                    {detailOrder.status}
                  </span>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${paymentTone(detailOrder.paymentStatus)}`}
                  >
                    {paymentLabel(detailOrder.paymentStatus)}
                  </span>
                  {detailOrder.invoiceNumber ? (
                    <span className="inline-flex rounded-full bg-[#F3F5F7] px-2.5 py-1 text-xs font-bold text-[#4B5563]">
                      {detailOrder.invoiceNumber}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => downloadOrderPdf(detailOrder)}
                  className="rounded-full border border-black/[0.08] px-4 py-2 text-sm font-bold text-[#051A2D] hover:bg-[#F8FAFB]"
                >
                  Download PDF
                </button>
                {canEdit && canEditOrderDetails(detailOrder.status) ? (
                  <button
                    type="button"
                    onClick={() => {
                      closeDetails();
                      openEditDraft(detailOrder);
                    }}
                    className="rounded-full border border-black/[0.08] px-4 py-2 text-sm font-bold text-[#051A2D] hover:bg-[#F8FAFB]"
                  >
                    {detailOrder.status === "Rejected" ? "Edit and resubmit" : "Edit draft"}
                  </button>
                ) : null}
                {canEdit && canEditInvoices && canInvoiceOrder(detailOrder) ? (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void onGenerateInvoice(detailOrder)}
                    className="rounded-full bg-[#051A2D] px-4 py-2 text-sm font-bold text-white hover:bg-[#0a3050] disabled:opacity-50"
                  >
                    Generate invoice
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={closeDetails}
                  className="rounded-full px-3 py-2 text-sm font-bold text-[#8B95A5] hover:bg-[#F3F5F7]"
                >
                  Close
                </button>
              </div>
            </div>

            {detailOrder.rejectionReason ? (
              <p className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {detailOrder.status === "Rejected" ? "Rejection reason: " : "Last rejection: "}
                {detailOrder.rejectionReason}
              </p>
            ) : null}

            {detailOrder.notes ? (
              <p className="mb-4 rounded-2xl bg-[#F8FAFB] px-4 py-3 text-sm font-medium text-[#4B5563]">
                {detailOrder.notes}
              </p>
            ) : null}

            {canEdit && detailActions.length === 0 && detailOrder.status === "Pending" ? (
              <p className="mb-4 text-sm font-medium text-[#8B95A5]">
                Waiting for approval.
              </p>
            ) : null}

            {canEdit && detailActions.length > 0 ? (
              <div className="mb-5 rounded-2xl border border-black/[0.04] bg-[#F8FAFB] px-3 py-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#8B95A5]">
                  Status
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {detailActions.map((status) => {
                    const label = statusActionLabel(detailOrder.status, status);
                    const destructive =
                      status === "Rejected" || status === "Cancelled";
                    const primary =
                      status === "Approved" ||
                      status === "Pending" ||
                      status === "Shipped" ||
                      status === "Delivered";
                    return (
                      <button
                        key={status}
                        type="button"
                        disabled={actionBusy}
                        onClick={() => void applyDetailStatus(status)}
                        className={
                          destructive
                            ? "rounded-full border border-red-200 bg-white px-2.5 py-1 text-[11px] font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
                            : primary
                              ? "rounded-full bg-[#051A2D] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#0a3050] disabled:opacity-50"
                              : "rounded-full border border-black/[0.08] bg-white px-2.5 py-1 text-[11px] font-bold text-[#051A2D] hover:bg-[#F8FAFB] disabled:opacity-50"
                        }
                      >
                        {actionBusy ? "Saving…" : label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-2xl border border-black/[0.04]">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#F8FAFB] text-xs font-semibold tracking-wide text-[#8B95A5]">
                  <tr>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Unit price</th>
                    <th className="px-4 py-3 text-right">Discount</th>
                    <th className="px-4 py-3 text-right">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {(detailOrder.orderItems ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-[#8B95A5]">
                        No line items.
                      </td>
                    </tr>
                  ) : (
                    detailOrder.orderItems.map((item) => (
                      <tr key={item.id} className="border-t border-transparent">
                        <td className="px-4 py-3 font-semibold text-[#0B1220]">
                          {item.productName || "Product"}
                        </td>
                        <td className="px-4 py-3 text-[#4B5563]">
                          {item.productSku || "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[#4B5563]">
                          {item.quantity}
                        </td>
                        <td
                          dir="ltr"
                          className="px-4 py-3 text-right tabular-nums text-[#4B5563]"
                        >
                          {formatMoney(Number(item.unitPrice))}
                        </td>
                        <td
                          dir="ltr"
                          className="px-4 py-3 text-right tabular-nums text-[#4B5563]"
                        >
                          {formatMoney(Number(item.discountAmount || 0))}
                        </td>
                        <td
                          dir="ltr"
                          className="px-4 py-3 text-right font-semibold tabular-nums text-[#0B1220]"
                        >
                          {formatMoney(Number(item.totalPrice))}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 ml-auto w-full max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between font-medium text-[#4B5563]">
                <span>Discount</span>
                <span>{formatMoney(orderDiscount(detailOrder))}</span>
              </div>
              <div className="flex justify-between font-medium text-[#4B5563]">
                <span>Subtotal</span>
                <span>
                  {formatMoney(
                    Number(detailOrder.subtotalAmount ?? detailSubtotal),
                  )}
                </span>
              </div>
              <div className="flex justify-between font-medium text-[#4B5563]">
                <span>Tax ({Number(detailOrder.taxRate || 0)}%)</span>
                <span>
                  {formatMoney(
                    Number(
                      detailOrder.taxAmount ??
                        Math.round(
                          detailSubtotal *
                            (Number(detailOrder.taxRate || 0) / 100) *
                            100,
                        ) / 100,
                    ),
                  )}
                </span>
              </div>
              <div className="flex justify-between border-t border-black/[0.08] pt-2 text-base font-bold text-[#0B1220]">
                <span>Grand total</span>
                <span>{formatMoney(Number(detailOrder.totalAmount))}</span>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="text-sm font-semibold text-[#0B1220]">History</h3>
              {!canSeeFinancialHistory ? (
                <p className="mt-1 text-xs font-medium text-[#8B95A5]">
                  Status and creation only. Financial change audit is limited to
                  organization admins and Finance.
                </p>
              ) : null}
              {historyLoading ? (
                <p className="mt-2 text-sm text-[#8B95A5]">Loading history…</p>
              ) : fieldHistory.length === 0 ? (
                <p className="mt-2 text-sm text-[#8B95A5]">No history recorded yet.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {groupFieldHistory(fieldHistory).map((group) => {
                    const lines = compactHistoryChanges(
                      group.changes,
                      detailOrder.direction,
                    );
                    if (lines.length === 0) return null;
                    return (
                      <div
                        key={group.id}
                        className="rounded-2xl border border-black/[0.06] px-3.5 py-3"
                      >
                        <p className="text-sm font-semibold text-[#0B1220]">
                          {formatOrderDateTime(group.createdAt)}
                          <span className="font-medium text-[#8B95A5]">
                            {" "}
                            · {group.actorName || "User"}
                          </span>
                        </p>
                        <ul className="mt-1.5 space-y-1">
                          {lines.map((line) => (
                            <li
                              key={line.id}
                              dir="ltr"
                              className="text-sm tabular-nums text-[#4B5563]"
                            >
                              {line.text}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {rejectTarget ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close reject dialog"
            className="absolute inset-0 bg-[#051A2D]/55"
            onClick={() => {
              if (rejectSaving) return;
              setRejectTarget(null);
              setRejectReason("");
              setRejectError(null);
            }}
          />
          <div className="relative z-10 w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl sm:p-7">
            <h2 className="text-xl font-bold text-[#0B1220]">
              Reject {orderKindLabel(rejectTarget.direction).toLowerCase()}
            </h2>
            <p className="mt-1 text-sm font-medium text-[#8B95A5]">
              {rejectTarget.orderNumber} will move to Reject. It can be edited and resubmitted.
            </p>
            <label className="mt-5 block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#8B95A5]">
                Rejection reason
              </span>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="Explain what needs to change."
                className={`${fieldClass} min-h-[96px] resize-y`}
              />
            </label>
            {rejectError ? (
              <p className="mt-3 text-sm font-medium text-red-600">{rejectError}</p>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                disabled={rejectSaving}
                onClick={() => {
                  setRejectTarget(null);
                  setRejectReason("");
                  setRejectError(null);
                }}
                className="rounded-full border border-black/[0.08] px-5 py-2.5 text-sm font-bold text-[#051A2D] hover:bg-[#F8FAFB] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={rejectSaving}
                onClick={() => void confirmReject()}
                className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {rejectSaving ? "Rejecting…" : "Reject order"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`rounded-[22px] border px-5 py-4 ${
        emphasize
          ? "border-amber-200 bg-amber-50/70"
          : "border-black/[0.04] bg-white"
      }`}
    >
      <p
        className={`text-xs font-semibold uppercase tracking-wide ${
          emphasize ? "text-amber-700" : "text-[#8B95A5]"
        }`}
      >
        {label}
      </p>
      <p
        className={`mt-1 text-xl font-bold ${
          emphasize ? "text-amber-900" : "text-[#0B1220]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#8B95A5]">
        {label}
      </span>
      {children}
    </label>
  );
}
