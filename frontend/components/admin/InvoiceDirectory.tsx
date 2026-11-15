"use client";

import {
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
import { getSession, isAdmin } from "@/lib/auth";
import {
  type Invoice,
  type InvoiceStatus,
  INVOICE_STATUSES,
  createInvoice,
  deleteInvoice,
  formatInvoiceDate,
  formatInvoiceMoney,
  toCents,
  invoiceStatusLabel,
  invoiceStatusTone,
  listInvoices,
  recordPayment,
  toDateInputValue,
  updateInvoice,
} from "@/lib/invoices";
import {
  type PurchaseOrder,
  canInvoiceOrder,
  formatMoney,
  listOrders,
} from "@/lib/orders";
import { canEditPage } from "@/lib/permissions";

const fieldClass =
  "w-full rounded-2xl border border-black/[0.06] bg-[#F3F5F7] px-3.5 py-2.5 text-sm font-medium text-[#0B1220] outline-none focus:bg-white focus:ring-2 focus:ring-[#051A2D]/30";

type FormState = {
  orderId: string;
  invoiceNumber: string;
  amount: string;
  status: InvoiceStatus;
  dueDate: string;
};

function defaultDueDate() {
  return toDateInputValue(new Date(Date.now() + 30 * 86400000));
}

function emptyForm(): FormState {
  return {
    orderId: "",
    invoiceNumber: "",
    amount: "",
    status: "Unpaid",
    dueDate: defaultDueDate(),
  };
}

function fromInvoice(invoice: Invoice): FormState {
  return {
    orderId: invoice.orderId,
    invoiceNumber: invoice.invoiceNumber,
    amount: String(Number(invoice.amount)),
    status: invoice.status,
    dueDate: toDateInputValue(invoice.dueDate),
  };
}

type InvoiceStatusFilter = "All" | "Open" | InvoiceStatus;

function parseInvoiceStatusParam(value: string | null): InvoiceStatusFilter {
  if (!value) return "All";
  if (value === "Open") return "Open";
  return (INVOICE_STATUSES as readonly string[]).includes(value)
    ? (value as InvoiceStatus)
    : "All";
}

export default function InvoiceDirectory() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = getSession();
  const canEdit = canEditPage(
    session?.permissions,
    "invoices",
    isAdmin(session?.user.role ?? ""),
  );

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatusFilter>(() =>
    parseInvoiceStatusParam(searchParams.get("status")),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSaving, setPaymentSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [invoiceRows, orderRows] = await Promise.all([listInvoices(), listOrders()]);
      setInvoices(invoiceRows);
      setOrders(orderRows);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load invoices.",
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
    setStatusFilter(parseInvoiceStatusParam(searchParams.get("status")));
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get("create") !== "1" || !canEdit) return;
    openCreate();
    const next = new URLSearchParams(searchParams.toString());
    next.delete("create");
    const qs = next.toString();
    router.replace(qs ? `/admin/invoices?${qs}` : "/admin/invoices");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, canEdit, router]);

  function syncInvoiceFilters(nextSearch: string, nextStatus: InvoiceStatusFilter) {
    const params = new URLSearchParams();
    if (nextSearch.trim()) params.set("q", nextSearch.trim());
    if (nextStatus !== "All") params.set("status", nextStatus);
    const qs = params.toString();
    router.replace(qs ? `/admin/invoices?${qs}` : "/admin/invoices");
  }

  const invoiceableOrders = useMemo(
    () => orders.filter(canInvoiceOrder),
    [orders],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return invoices.filter((invoice) => {
      if (statusFilter === "Open") {
        if (
          invoice.status !== "Unpaid" &&
          invoice.status !== "PartiallyPaid" &&
          invoice.status !== "Overdue"
        ) {
          return false;
        }
      } else if (statusFilter !== "All" && invoice.status !== statusFilter) {
        return false;
      }
      if (!term) return true;
      const haystack = [
        invoice.invoiceNumber,
        invoice.orderNumber,
        invoice.buyerCompanyName,
        invoice.supplierCompanyName,
        invoiceStatusLabel(invoice.status),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [invoices, search, statusFilter]);

  const totals = useMemo(() => {
    const unpaid = invoices.filter(
      (i) => i.status === "Unpaid" || i.status === "Overdue" || i.status === "PartiallyPaid",
    );
    const amount = unpaid.reduce((sum, i) => sum + Number(i.outstanding || 0), 0);
    return {
      count: invoices.length,
      open: unpaid.length,
      openAmount: amount,
    };
  }, [invoices]);

  function remainingAmount(order: PurchaseOrder) {
    return Number(order.uninvoicedAmount ?? order.totalAmount ?? 0);
  }

  function nextInvoiceNumber(order: PurchaseOrder) {
    const base = `INV-${order.orderNumber}`;
    const current = order.invoiceNumber?.trim();
    if (!current) return base;
    if (current.toLowerCase() === base.toLowerCase()) return `${base}-2`;
    const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`^${escaped}-(\\d+)$`, "i").exec(current);
    if (match) return `${base}-${Number(match[1]) + 1}`;
    return `${base}-2`;
  }

  function amountCap() {
    if (editing) {
      const order = orders.find((item) => item.id === editing.orderId);
      if (!order) return Number(editing.amount || 0);
      return remainingAmount(order) + Number(editing.amount || 0);
    }
    const order = orders.find((item) => item.id === form.orderId);
    return order ? remainingAmount(order) : null;
  }

  function openCreate() {
    const first = invoiceableOrders[0];
    setEditing(null);
    setForm({
      ...emptyForm(),
      orderId: first?.id ?? "",
      invoiceNumber: first ? nextInvoiceNumber(first) : "",
      amount: first ? String(remainingAmount(first)) : "",
    });
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(invoice: Invoice) {
    setEditing(invoice);
    setForm(fromInvoice(invoice));
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setEditing(null);
    setFormError(null);
  }

  function onSelectOrder(orderId: string) {
    const order = orders.find((o) => o.id === orderId);
    setForm((prev) => ({
      ...prev,
      orderId,
      invoiceNumber: order ? nextInvoiceNumber(order) : prev.invoiceNumber,
      amount: order ? String(remainingAmount(order)) : prev.amount,
    }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) {
      setFormError("You have view-only access to invoices.");
      return;
    }
    if (!editing && !form.orderId) {
      setFormError("Order is required.");
      return;
    }
    if (!form.invoiceNumber.trim()) {
      setFormError("Invoice number is required.");
      return;
    }
    const amount = Number(form.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      setFormError("Amount must be greater than 0.");
      return;
    }
    const cap = amountCap();
    if (cap != null && toCents(amount) > toCents(cap)) {
      setFormError(
        `Amount cannot be more than the remaining ${formatInvoiceMoney(cap)}.`,
      );
      return;
    }
    if (!form.dueDate) {
      setFormError("Due date is required.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const dueDate = new Date(`${form.dueDate}T12:00:00`).toISOString();
      if (editing) {
        await updateInvoice(editing.id, {
          invoiceNumber: form.invoiceNumber.trim(),
          amount,
          status: form.status,
          dueDate,
        });
      } else {
        await createInvoice({
          orderId: form.orderId,
          invoiceNumber: form.invoiceNumber.trim(),
          amount,
          status: form.status,
          dueDate,
        });
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not save invoice.");
    } finally {
      setSaving(false);
    }
  }

  function openPayment(invoice: Invoice) {
    setPaying(invoice);
    setPaymentAmount(String(Number(invoice.outstanding || 0)));
    setPaymentError(null);
  }

  function closePayment() {
    if (paymentSaving) return;
    setPaying(null);
    setPaymentError(null);
  }

  async function onRecordPayment(event: FormEvent) {
    event.preventDefault();
    if (!paying || !canEdit) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentError("Payment amount must be greater than 0.");
      return;
    }
    if (toCents(amount) > toCents(Number(paying.outstanding || 0))) {
      setPaymentError("Payment cannot be more than the outstanding balance.");
      return;
    }
    setPaymentSaving(true);
    setPaymentError(null);
    try {
      await recordPayment(paying.id, amount);
      setPaying(null);
      await load();
    } catch (err) {
      setPaymentError(err instanceof ApiError ? err.message : "Could not record payment.");
    } finally {
      setPaymentSaving(false);
    }
  }

  async function onDelete(invoice: Invoice) {
    if (!canEdit) return;
    if (!window.confirm(`Delete invoice “${invoice.invoiceNumber}”?`)) return;
    setDeletingId(invoice.id);
    setError(null);
    try {
      await deleteInvoice(invoice.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete invoice.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="animate-rise">
      <AdminPageHeader
        title="Invoices"
        description="Billing records linked to orders — track amounts and payment status."
        action={
          canEdit ? (
            <button
              type="button"
              onClick={openCreate}
              className="rounded-full bg-[#051A2D] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#0a3050]"
            >
              Add invoice
            </button>
          ) : null
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="All invoices" value={String(totals.count)} />
        <StatCard label="Open / unpaid" value={String(totals.open)} />
        <StatCard label="Open amount" value={formatInvoiceMoney(totals.openAmount)} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Search invoices</span>
          <input
            value={search}
            onChange={(e) => {
              const next = e.target.value;
              setSearch(next);
              syncInvoiceFilters(next, statusFilter);
            }}
            placeholder="Search by invoice #, order, buyer, or vendor…"
            className="w-full rounded-2xl border border-black/[0.06] bg-white px-4 py-2.5 text-sm font-medium text-[#0B1220] outline-none ring-[#051A2D]/30 placeholder:text-[#8B95A5] focus:ring-2"
          />
        </label>
        <label className="shrink-0">
          <span className="sr-only">Filter by status</span>
          <select
            value={statusFilter}
            onChange={(e) => {
              const next = e.target.value as InvoiceStatusFilter;
              setStatusFilter(next);
              syncInvoiceFilters(search, next);
            }}
            className="rounded-2xl border border-black/[0.06] bg-white px-4 py-2.5 text-sm font-bold text-[#051A2D] outline-none focus:ring-2 focus:ring-[#051A2D]/30"
          >
            <option value="All">All statuses</option>
            <option value="Open">Open</option>
            {INVOICE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {invoiceStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
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

      <div className="overflow-hidden rounded-[24px] border border-black/[0.04] bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#F8FAFB] text-xs font-semibold tracking-wide text-[#8B95A5]">
              <tr>
                <th className="px-5 py-3.5">Invoice #</th>
                <th className="px-5 py-3.5">Order</th>
                <th className="px-5 py-3.5">Buyer</th>
                <th className="px-5 py-3.5">Vendor</th>
                <th className="px-5 py-3.5">Amount</th>
                <th className="px-5 py-3.5">Paid</th>
                <th className="px-5 py-3.5">Outstanding</th>
                <th className="px-5 py-3.5">Due date</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-5 py-12 text-center text-[#8B95A5]">
                    Loading invoices…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-5 py-12 text-center text-[#8B95A5]">
                    No invoices found.
                  </td>
                </tr>
              ) : (
                filtered.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="border-t border-black/[0.04] transition hover:bg-[#F8FAFB]"
                  >
                    <td className="px-5 py-3.5 font-semibold text-[#0B1220]">
                      {invoice.invoiceNumber}
                    </td>
                    <td className="px-5 py-3.5 text-[#4B5563]">
                      {invoice.orderNumber || "—"}
                    </td>
                    <td className="px-5 py-3.5 text-[#4B5563]">
                      {invoice.buyerCompanyName || "—"}
                    </td>
                    <td className="px-5 py-3.5 text-[#4B5563]">
                      {invoice.supplierCompanyName || "—"}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-[#0B1220]">
                      {formatInvoiceMoney(Number(invoice.amount), invoice.currency)}
                    </td>
                    <td className="px-5 py-3.5 text-[#4B5563]">
                      {formatInvoiceMoney(Number(invoice.amountPaid || 0), invoice.currency)}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-[#0B1220]">
                      {formatInvoiceMoney(Number(invoice.outstanding || 0), invoice.currency)}
                    </td>
                    <td className="px-5 py-3.5 text-[#4B5563]">
                      {formatInvoiceDate(invoice.dueDate)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${invoiceStatusTone(invoice.status)}`}
                      >
                        {invoiceStatusLabel(invoice.status)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex justify-end gap-2">
                        {canEdit && Number(invoice.outstanding || 0) > 0 ? (
                          <button
                            type="button"
                            onClick={() => openPayment(invoice)}
                            className="rounded-full px-3 py-1.5 text-xs font-bold text-[#051A2D] hover:bg-[#051A2D]/[0.06]"
                          >
                            Record payment
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => openEdit(invoice)}
                          className="rounded-full px-3 py-1.5 text-xs font-bold text-[#051A2D] hover:bg-[#051A2D]/[0.06]"
                        >
                          Edit
                        </button>
                        {canEdit ? (
                          <button
                            type="button"
                            disabled={deletingId === invoice.id}
                            onClick={() => void onDelete(invoice)}
                            className="rounded-full px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            {deletingId === invoice.id ? "…" : "Delete"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {paying ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close payment dialog"
            className="absolute inset-0 bg-[#051A2D]/55"
            onClick={closePayment}
          />
          <div className="relative z-10 w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl sm:p-7">
            <h2 className="text-xl font-bold text-[#0B1220]">Record payment</h2>
            <p className="mt-1 text-sm font-medium text-[#8B95A5]">
              {paying.invoiceNumber} · outstanding{" "}
              {formatInvoiceMoney(Number(paying.outstanding || 0), paying.currency)}
            </p>
            <form noValidate onSubmit={(e) => void onRecordPayment(e)} className="mt-5 space-y-4">
              <Field label="Amount *">
                <input
                  inputMode="decimal"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className={fieldClass}
                  autoFocus
                />
              </Field>
              <p className="text-sm font-medium text-[#8B95A5]">
                Enter the outstanding amount for a full payment, or less for a partial payment.
              </p>
              {paymentError ? (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                  {paymentError}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closePayment}
                  disabled={paymentSaving}
                  className="rounded-full px-4 py-2.5 text-sm font-bold text-[#8B95A5] hover:bg-[#F3F5F7] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={paymentSaving}
                  className="rounded-full bg-[#051A2D] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0a3050] disabled:opacity-50"
                >
                  {paymentSaving ? "Saving…" : "Record payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 bg-[#051A2D]/55"
            onClick={closeModal}
          />
          <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl sm:p-7">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-[#0B1220]">
                  {editing ? "Edit invoice" : "Add invoice"}
                </h2>
                <p className="mt-1 text-sm font-medium text-[#8B95A5]">
                  {editing
                    ? "Update the invoice number, amount, or due date. Payment status follows recorded payments."
                    : "Create a billing record from an Approved (or later) order."}
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

            <form noValidate onSubmit={(e) => void onSubmit(e)} className="space-y-4">
              {!editing ? (
                <Field label="Order *">
                  {invoiceableOrders.length === 0 ? (
                    <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-medium text-amber-800">
                      No eligible orders. Approve an order that still has an amount left to
                      invoice.
                    </p>
                  ) : (
                    <select
                      value={form.orderId}
                      onChange={(e) => onSelectOrder(e.target.value)}
                      className={fieldClass}
                      disabled={!canEdit}
                    >
                      <option value="">Select order</option>
                      {invoiceableOrders.map((order) => (
                        <option key={order.id} value={order.id}>
                          {order.orderNumber} · remaining{" "}
                          {formatMoney(remainingAmount(order))} · {order.status}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              ) : (
                <Field label="Order">
                  <input
                    value={editing.orderNumber || editing.orderId}
                    className={fieldClass}
                    disabled
                  />
                </Field>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Invoice number *" className="sm:col-span-2">
                  <input
                    value={form.invoiceNumber}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, invoiceNumber: e.target.value }))
                    }
                    className={fieldClass}
                    disabled={!canEdit}
                  />
                </Field>
                <Field label="Amount *">
                  <input
                    inputMode="decimal"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    className={fieldClass}
                    disabled={!canEdit}
                  />
                  {amountCap() != null ? (
                    <p className="mt-1.5 text-xs font-medium text-[#8B95A5]">
                      Up to {formatInvoiceMoney(amountCap() ?? 0)}
                    </p>
                  ) : null}
                </Field>
                <Field label="Due date *">
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                    className={fieldClass}
                    disabled={!canEdit}
                  />
                </Field>
                {editing ? (
                  <div className="grid gap-3 rounded-2xl bg-[#F8FAFB] px-4 py-3 text-sm sm:col-span-2 sm:grid-cols-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-[#8B95A5]">Paid</p>
                      <p className="mt-1 font-semibold text-[#0B1220]">
                        {formatInvoiceMoney(Number(editing.amountPaid || 0))}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-[#8B95A5]">Outstanding</p>
                      <p className="mt-1 font-semibold text-[#0B1220]">
                        {formatInvoiceMoney(Number(editing.outstanding || 0))}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-[#8B95A5]">Status</p>
                      <p className="mt-1 font-semibold text-[#0B1220]">
                        {invoiceStatusLabel(editing.status)}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>

              {formError ? (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                  {formError}
                </p>
              ) : null}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="rounded-full px-4 py-2.5 text-sm font-bold text-[#8B95A5] hover:bg-[#F3F5F7] disabled:opacity-50"
                >
                  Cancel
                </button>
                {canEdit ? (
                  <button
                    type="submit"
                    disabled={
                      saving || (!editing && invoiceableOrders.length === 0)
                    }
                    className="rounded-full bg-[#051A2D] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0a3050] disabled:opacity-50"
                  >
                    {saving ? "Saving…" : editing ? "Save changes" : "Create invoice"}
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-black/[0.04] bg-white px-5 py-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#8B95A5]">{label}</p>
      <p className="mt-1 text-xl font-bold text-[#0B1220]">{value}</p>
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
