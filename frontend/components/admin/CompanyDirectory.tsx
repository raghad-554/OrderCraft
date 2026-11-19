"use client";

import {
  FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import ScrollSelect from "@/components/ui/ScrollSelect";
import { ApiError } from "@/lib/api";
import { getSession, isAdmin } from "@/lib/auth";
import { canEditPage } from "@/lib/permissions";
import {
  type Company,
  type CompanyPayload,
  type CompanyStatus,
  type CompanyType,
  type Category,
  createCompany,
  deleteCompany,
  listCategories,
  listCompanies,
  money,
  statusLabel,
  updateCompany,
} from "@/lib/companies";

const fieldClass =
  "w-full rounded-2xl border border-black/[0.06] bg-[#d4dee9] px-3.5 py-2.5 text-sm font-medium text-[#0B1220] outline-none focus:bg-[#e4ebf2] focus:ring-2 focus:ring-[#051A2D]/30";

const PAGE_SIZE = 8;
const STATUS_OPTIONS: CompanyStatus[] = ["Active", "PendingReview", "Inactive"];

type Mode = "clients" | "vendors";

const MODE_CONFIG: Record<
  Mode,
  {
    title: string;
    description: string;
    singular: string;
    types: CompanyType[];
    defaultType: CompanyType;
    typeOptions: CompanyType[];
  }
> = {
  clients: {
    title: "Clients",
    description: "Clients you sell to.",
    singular: "Client",
    types: ["Buyer", "Both"],
    defaultType: "Buyer",
    typeOptions: ["Buyer", "Both"],
  },
  vendors: {
    title: "Vendors",
    description: "Vendors you buy from.",
    singular: "Vendor",
    types: ["Supplier", "Both"],
    defaultType: "Supplier",
    typeOptions: ["Supplier", "Both"],
  },
};

const MODE_TABS: Mode[] = ["clients", "vendors"];

type FormState = {
  name: string;
  email: string;
  phone: string;
  address: string;
  taxNumber: string;
  type: CompanyType;
  categoryId: string;
  creditLimit: string;
  paymentTerm: string;
  discountRate: string;
  totalSpend: string;
  totalSales: string;
  outstandingBalance: string;
  performanceScore: string;
  status: CompanyStatus;
};

function emptyForm(defaultType: CompanyType): FormState {
  return {
    name: "",
    email: "",
    phone: "",
    address: "",
    taxNumber: "",
    type: defaultType,
    categoryId: "",
    creditLimit: "",
    paymentTerm: "",
    discountRate: "",
    totalSpend: "",
    totalSales: "",
    outstandingBalance: "",
    performanceScore: "",
    status: "Active",
  };
}

function fromCompany(company: Company, defaultType: CompanyType): FormState {
  return {
    name: company.name,
    email: company.email,
    phone: company.phone ?? "",
    address: company.address ?? "",
    taxNumber: company.taxNumber ?? "",
    type: company.type || defaultType,
    categoryId: company.categoryId ?? "",
    creditLimit: company.creditLimit != null ? String(company.creditLimit) : "",
    paymentTerm: company.paymentTerm ?? "",
    discountRate: company.discountRate != null ? String(company.discountRate) : "",
    totalSpend: company.totalSpend ? String(company.totalSpend) : "",
    totalSales: company.totalSales ? String(company.totalSales) : "",
    outstandingBalance: company.outstandingBalance
      ? String(company.outstandingBalance)
      : "",
    performanceScore:
      company.performanceScore != null ? String(company.performanceScore) : "",
    status: company.status || "Active",
  };
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function toPayload(form: FormState): CompanyPayload {
  return {
    name: form.name.trim(),
    email: form.email.trim(),
    phone: form.phone.trim() || undefined,
    address: form.address.trim() || undefined,
    taxNumber: form.taxNumber.trim() || undefined,
    type: form.type,
    categoryId: form.categoryId || null,
    creditLimit: parseOptionalNumber(form.creditLimit),
    paymentTerm: form.paymentTerm.trim() || null,
    discountRate: parseOptionalNumber(form.discountRate),
    totalSpend: parseOptionalNumber(form.totalSpend),
    totalSales: parseOptionalNumber(form.totalSales),
    outstandingBalance: parseOptionalNumber(form.outstandingBalance),
    performanceScore: parseOptionalNumber(form.performanceScore),
    status: form.status,
  };
}

function hasClientRole(type: CompanyType) {
  return type === "Buyer" || type === "Both";
}

function hasVendorRole(type: CompanyType) {
  return type === "Supplier" || type === "Both";
}

function requiredNonNegative(value: string, label: string) {
  if (!value.trim()) return `${label} is required.`;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return `${label} must be 0 or greater.`;
  return null;
}

function optionalNonNegative(value: string, label: string) {
  if (!value.trim()) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return `${label} must be 0 or greater.`;
  return null;
}

function validateForm(form: FormState): string | null {
  if (!form.name.trim()) return "Name is required.";
  if (!form.email.trim()) return "Email is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    return "Enter a valid email address.";
  }
  if (form.phone && form.phone.trim().length > 20) {
    return "Phone must be 20 characters or fewer.";
  }
  if (form.paymentTerm.trim().length > 50) {
    return "Payment terms must be 50 characters or fewer.";
  }

  const both = form.type === "Both";

  if (both && !form.paymentTerm.trim()) {
    return "Payment terms is required.";
  }

  if (hasClientRole(form.type)) {
    const credit = both
      ? requiredNonNegative(form.creditLimit, "Credit limit")
      : optionalNonNegative(form.creditLimit, "Credit limit");
    if (credit) return credit;
    const sales = both
      ? requiredNonNegative(form.totalSales, "Total sales")
      : optionalNonNegative(form.totalSales, "Total sales");
    if (sales) return sales;
  }

  if (hasVendorRole(form.type)) {
    if (both && !form.categoryId) return "Category is required.";
    const spend = both
      ? requiredNonNegative(form.totalSpend, "Total spend")
      : optionalNonNegative(form.totalSpend, "Total spend");
    if (spend) return spend;
    if (both && !form.discountRate.trim()) return "Discount rate is required.";
    if (form.discountRate.trim()) {
      const n = Number(form.discountRate);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return "Discount rate must be between 0 and 100.";
      }
    }
    if (both && !form.performanceScore.trim()) {
      return "Performance score is required.";
    }
    if (form.performanceScore.trim()) {
      const n = Number(form.performanceScore);
      if (!Number.isFinite(n) || n < 0 || n > 5) {
        return "Performance score must be between 0 and 5.";
      }
    }
  }

  return null;
}

function ContactCell({ company }: { company: Company }) {
  return (
    <div>
      <p className="font-semibold text-[#0B1220]">{company.name}</p>
      <p className="mt-0.5 text-xs font-semibold text-[#5B6577]">{company.email}</p>
      {company.phone ? (
        <p className="text-xs font-semibold text-[#5B6577]">{company.phone}</p>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: CompanyStatus }) {
  const tone =
    status === "Active"
      ? "bg-emerald-50 text-emerald-700"
      : status === "PendingReview"
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-100 text-slate-600";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>
      {statusLabel(status)}
    </span>
  );
}

export default function CompanyDirectory({
  initialMode = "clients",
}: {
  initialMode?: Mode;
}) {
  const session = getSession();
  const canEdit = canEditPage(
    session?.permissions,
    "companies",
    isAdmin(session?.user.role ?? ""),
  );
  const [mode, setMode] = useState<Mode>(initialMode);
  const config = MODE_CONFIG[mode];
  const searchParams = useSearchParams();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(
    () => searchParams.get("q") ?? "",
  );
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(config.defaultType));
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    setSearch(q);
    setDebouncedSearch(q);
  }, [searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, cats] = await Promise.all([
        listCompanies({ types: config.types, name: debouncedSearch || undefined }),
        listCategories(),
      ]);
      setCompanies(rows);
      setCategories(cats);
      setPage(1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load companies.");
    } finally {
      setLoading(false);
    }
  }, [config.types, debouncedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setSearch("");
    setDebouncedSearch("");
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm(MODE_CONFIG[next].defaultType));
    setFormError(null);
  }

  const pageCount = Math.max(1, Math.ceil(companies.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return companies.slice(start, start + PAGE_SIZE);
  }, [companies, currentPage]);

  const colCount = mode === "vendors" ? 8 : 8;

  function openCreate() {
    if (!canEdit) return;
    setEditing(null);
    setForm(emptyForm(config.defaultType));
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(company: Company) {
    if (!canEdit) return;
    setEditing(company);
    setForm(fromCompany(company, config.defaultType));
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setEditing(null);
    setFormError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    const validation = validateForm(form);
    if (validation) {
      setFormError(validation);
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = toPayload(form);
      if (editing) {
        await updateCompany(editing.id, payload);
      } else {
        await createCompany(payload);
      }
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not save company.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(company: Company) {
    if (!canEdit) return;
    const ok = window.confirm(`Delete ${company.name}? This can be undone only from the database.`);
    if (!ok) return;

    setDeletingId(company.id);
    setError(null);
    try {
      await deleteCompany(company.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete company.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="animate-rise">
      <AdminPageHeader
        title="Company"
        description="Choose clients or vendors to manage."
        action={
          canEdit ? (
            <button
              type="button"
              onClick={openCreate}
              className="rounded-full bg-[#051A2D] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#0a3050]"
            >
              Add {config.singular}
            </button>
          ) : null
        }
      />

      <div className="mb-5 flex flex-wrap gap-3">
        {MODE_TABS.map((tab) => {
          const tabConfig = MODE_CONFIG[tab];
          const active = tab === mode;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => switchMode(tab)}
              className={`inline-flex min-w-[180px] flex-1 flex-col items-start rounded-[22px] px-7 py-4 text-left transition sm:flex-none ${
                active
                  ? "bg-[#0B1220] text-white"
                  : "bg-[#e4ebf2] text-[#0B1220] ring-1 ring-black/[0.06] hover:bg-[#d4dee9]"
              }`}
            >
              <span className="text-base font-bold">{tabConfig.title}</span>
              <span
                className={`mt-1 text-xs font-medium ${
                  active ? "text-white/60" : "text-[#5B6577]"
                }`}
              >
                {tabConfig.description}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Search by name</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${config.title.toLowerCase()}…`}
            className="w-full rounded-2xl border border-black/[0.06] bg-[#e4ebf2] px-4 py-2.5 text-sm font-medium text-[#0B1220] outline-none ring-[#051A2D]/30 placeholder:text-[#5B6577] focus:ring-2"
          />
        </label>
        <p className="text-sm font-semibold text-[#5B6577]">
          {loading
            ? "Loading…"
            : `${companies.length} ${companies.length === 1 ? "company" : "companies"}${canEdit ? "" : " · view only"}`}
        </p>
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[24px] border border-black/[0.04] bg-[#e4ebf2]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#e8eef4] text-xs font-semibold tracking-wide text-[#5B6577]">
              {mode === "vendors" ? (
                <tr>
                  <th className="px-5 py-3.5">Vendor name &amp; contact</th>
                  <th className="px-5 py-3.5">Category / Industry</th>
                  <th className="px-5 py-3.5">PO count &amp; total spend</th>
                  <th className="px-5 py-3.5">Payment terms</th>
                  <th className="px-5 py-3.5">Discount rate / Margin</th>
                  <th className="px-5 py-3.5">Performance score</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              ) : (
                <tr>
                  <th className="px-5 py-3.5">Client name &amp; contact</th>
                  <th className="px-5 py-3.5">Credit limit</th>
                  <th className="px-5 py-3.5">Outstanding debt / Balance</th>
                  <th className="px-5 py-3.5">Payment terms</th>
                  <th className="px-5 py-3.5">Total sales / Revenue</th>
                  <th className="px-5 py-3.5">Order count</th>
                  <th className="px-5 py-3.5">Tax ID / Commercial reg.</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              )}
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={colCount} className="px-5 py-12 text-center text-[#5B6577]">
                    Loading {config.title.toLowerCase()}…
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-5 py-12 text-center text-[#5B6577]">
                    No {config.title.toLowerCase()} found.
                  </td>
                </tr>
              ) : mode === "vendors" ? (
                pageRows.map((company) => (
                  <tr
                    key={company.id}
                    className="border-t border-black/[0.04] transition hover:bg-[#d4dee9]"
                  >
                    <td className="px-5 py-3.5">
                      <ContactCell company={company} />
                    </td>
                    <td className="px-5 py-3.5 text-[#4B5563]">
                      {company.categoryName || "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-[#0B1220]">{company.orderCount} POs</p>
                      <p className="text-xs font-semibold text-[#5B6577]">
                        {money(company.totalSpend)}
                      </p>
                      <p className="text-xs font-semibold text-[#5B6577]">
                        Owed {money(company.payableBalance)}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-[#4B5563]">
                      {company.paymentTerm || "—"}
                    </td>
                    <td className="px-5 py-3.5 text-[#4B5563]">
                      {company.discountRate != null ? `${company.discountRate}%` : "—"}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-[#0B1220]">
                      {company.performanceScore != null
                        ? `${company.performanceScore}/5`
                        : "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={company.status} />
                    </td>
                    <td className="px-5 py-3.5">
                      {canEdit ? (
                        <RowActions
                          deleting={deletingId === company.id}
                          onEdit={() => openEdit(company)}
                          onDelete={() => void onDelete(company)}
                        />
                      ) : (
                        <span className="text-xs font-semibold text-[#5B6577]">View</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                pageRows.map((company) => (
                  <tr
                    key={company.id}
                    className="border-t border-black/[0.04] transition hover:bg-[#d4dee9]"
                  >
                    <td className="px-5 py-3.5">
                      <ContactCell company={company} />
                    </td>
                    <td className="px-5 py-3.5 text-[#4B5563]">
                      {money(company.creditLimit)}
                    </td>
                    <td className="px-5 py-3.5 text-[#4B5563]">
                      {money(company.outstandingBalance)}
                    </td>
                    <td className="px-5 py-3.5 text-[#4B5563]">
                      {company.paymentTerm || "—"}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-[#0B1220]">
                      {money(company.totalSales)}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-[#0B1220]">
                      {company.orderCount}
                    </td>
                    <td className="px-5 py-3.5 text-[#4B5563]">
                      {company.taxNumber || "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      {canEdit ? (
                        <RowActions
                          deleting={deletingId === company.id}
                          onEdit={() => openEdit(company)}
                          onDelete={() => void onDelete(company)}
                        />
                      ) : (
                        <span className="text-xs font-semibold text-[#5B6577]">View</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {companies.length > PAGE_SIZE ? (
          <div className="flex items-center justify-between gap-3 border-t border-black/[0.04] px-5 py-3">
            <p className="text-xs font-semibold text-[#5B6577]">
              Page {currentPage} of {pageCount}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-full bg-[#d4dee9] px-3 py-1.5 text-xs font-bold text-[#051A2D] disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={currentPage >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                className="rounded-full bg-[#d4dee9] px-3 py-1.5 text-xs font-bold text-[#051A2D] disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 bg-[#051A2D]/55"
            onClick={closeModal}
          />
          <div className="relative z-10 max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[28px] bg-[#e4ebf2] p-6 shadow-2xl sm:p-7">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-[#0B1220]">
                  {editing ? `Edit ${config.singular}` : `Add ${config.singular}`}
                </h2>
                <p className="mt-1 text-sm font-semibold text-[#5B6577]">
                  {form.type === "Both"
                    ? "Fill client and vendor fields before saving."
                    : mode === "vendors"
                      ? "Vendor contact, commercial terms, and performance."
                      : "Client contact, credit, and commercial terms."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full px-3 py-1 text-sm font-bold text-[#5B6577] hover:bg-[#d4dee9]"
              >
                Close
              </button>
            </div>

            <form noValidate onSubmit={(e) => void onSubmit(e)} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name *" className="sm:col-span-2">
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className={fieldClass}
                    autoComplete="organization"
                  />
                </Field>
                <Field label="Email *">
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className={fieldClass}
                    autoComplete="off"
                  />
                </Field>
                <Field label="Phone">
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className={fieldClass}
                    autoComplete="tel"
                  />
                </Field>
                <Field label="Type">
                  <ScrollSelect
                    value={form.type}
                    placeholder="Select type"
                    options={config.typeOptions.map((type) => ({
                      value: type,
                      label: type,
                    }))}
                    onChange={(next) =>
                      setForm((f) => ({ ...f, type: next as CompanyType }))
                    }
                    className={fieldClass}
                    allowEmpty={false}
                  />
                </Field>
                <Field label={form.type === "Both" ? "Payment terms *" : "Payment terms"}>
                  <input
                    value={form.paymentTerm}
                    onChange={(e) => setForm((f) => ({ ...f, paymentTerm: e.target.value }))}
                    className={fieldClass}
                    placeholder={
                      hasVendorRole(form.type) ? "Net 30 / Advance 50%" : "Net 15 / Net 30"
                    }
                  />
                </Field>

                {hasClientRole(form.type) ? (
                  <>
                    {form.type === "Both" ? (
                      <p className="sm:col-span-2 pt-1 text-xs font-bold uppercase tracking-wide text-[#051A2D]">
                        Client details
                      </p>
                    ) : null}
                    <Field label="Tax ID / Commercial reg.">
                      <input
                        value={form.taxNumber}
                        onChange={(e) => setForm((f) => ({ ...f, taxNumber: e.target.value }))}
                        className={fieldClass}
                      />
                    </Field>
                    <Field
                      label={form.type === "Both" ? "Credit limit *" : "Credit limit"}
                    >
                      <input
                        inputMode="decimal"
                        value={form.creditLimit}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, creditLimit: e.target.value }))
                        }
                        className={fieldClass}
                        placeholder="0"
                      />
                    </Field>
                    <Field label="Outstanding balance">
                      <input
                        value={form.outstandingBalance || "0"}
                        className={fieldClass}
                        disabled
                      />
                      <span className="mt-1 block text-xs font-semibold text-[#5B6577]">
                        Calculated from this buyer&apos;s open invoices.
                      </span>
                    </Field>
                    <Field
                      label={form.type === "Both" ? "Total sales *" : "Total sales"}
                    >
                      <input
                        inputMode="decimal"
                        value={form.totalSales}
                        onChange={(e) => setForm((f) => ({ ...f, totalSales: e.target.value }))}
                        className={fieldClass}
                        placeholder="0"
                      />
                    </Field>
                    <Field label="Address" className="sm:col-span-2">
                      <textarea
                        value={form.address}
                        onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                        rows={2}
                        className={`${fieldClass} resize-none`}
                      />
                    </Field>
                  </>
                ) : null}

                {hasVendorRole(form.type) ? (
                  <>
                    {form.type === "Both" ? (
                      <p className="sm:col-span-2 pt-1 text-xs font-bold uppercase tracking-wide text-[#051A2D]">
                        Vendor details
                      </p>
                    ) : null}
                    <Field
                      label={
                        form.type === "Both"
                          ? "Category / Industry *"
                          : "Category / Industry"
                      }
                      className="sm:col-span-2"
                    >
                      <ScrollSelect
                        value={form.categoryId}
                        placeholder={
                          form.type === "Both" ? "Select category" : "No category"
                        }
                        options={categories.map((cat) => ({
                          value: cat.id,
                          label: cat.name,
                        }))}
                        onChange={(categoryId) => setForm((f) => ({ ...f, categoryId }))}
                        className={fieldClass}
                      />
                    </Field>
                    <Field
                      label={form.type === "Both" ? "Total spend *" : "Total spend"}
                    >
                      <input
                        inputMode="decimal"
                        value={form.totalSpend}
                        onChange={(e) => setForm((f) => ({ ...f, totalSpend: e.target.value }))}
                        className={fieldClass}
                        placeholder="0"
                      />
                    </Field>
                    <Field
                      label={
                        form.type === "Both" ? "Discount rate (%) *" : "Discount rate (%)"
                      }
                    >
                      <input
                        inputMode="decimal"
                        value={form.discountRate}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, discountRate: e.target.value }))
                        }
                        className={fieldClass}
                        placeholder="0"
                      />
                    </Field>
                    <Field
                      label={
                        form.type === "Both"
                          ? "Performance score (0–5) *"
                          : "Performance score (0–5)"
                      }
                    >
                      <input
                        inputMode="decimal"
                        value={form.performanceScore}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, performanceScore: e.target.value }))
                        }
                        className={fieldClass}
                        placeholder="4.8"
                      />
                    </Field>
                    <Field label="Status">
                      <ScrollSelect
                        value={form.status}
                        placeholder="Select status"
                        options={STATUS_OPTIONS.map((status) => ({
                          value: status,
                          label: statusLabel(status),
                        }))}
                        onChange={(next) =>
                          setForm((f) => ({
                            ...f,
                            status: next as CompanyStatus,
                          }))
                        }
                        className={fieldClass}
                        allowEmpty={false}
                      />
                    </Field>
                  </>
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
                  className="rounded-full px-4 py-2.5 text-sm font-bold text-[#5B6577] hover:bg-[#d4dee9] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-full bg-[#051A2D] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0a3050] disabled:opacity-50"
                >
                  {saving ? "Saving…" : editing ? "Save changes" : `Create ${config.singular}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RowActions({
  deleting,
  onEdit,
  onDelete,
}: {
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onEdit}
        className="rounded-full px-3 py-1.5 text-xs font-bold text-[#051A2D] hover:bg-[#051A2D]/[0.06]"
      >
        Edit
      </button>
      <button
        type="button"
        disabled={deleting}
        onClick={onDelete}
        className="rounded-full px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        {deleting ? "…" : "Delete"}
      </button>
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
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#5B6577]">
        {label}
      </span>
      {children}
    </label>
  );
}
