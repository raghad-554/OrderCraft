"use client";

import {
  FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import ScrollSelect from "@/components/ui/ScrollSelect";
import { ApiError } from "@/lib/api";
import { getSession, isAdmin } from "@/lib/auth";
import { listCategories, listCompanies, type Category, type Company } from "@/lib/companies";
import { getOrgCurrency, setOrgCurrency, subscribeOrgCurrency } from "@/lib/money";
import { getOrganizationSettings } from "@/lib/organizations";
import { canEditPage } from "@/lib/permissions";
import {
  type Product,
  createProduct,
  deleteProduct,
  formatProductMoney,
  listProducts,
  updateProduct,
} from "@/lib/products";

const fieldClass =
  "w-full rounded-2xl border border-black/[0.06] bg-[#d4dee9] px-3.5 py-2.5 text-sm font-medium text-[#0B1220] outline-none focus:bg-[#e4ebf2] focus:ring-2 focus:ring-[#051A2D]/30";

type FormState = {
  name: string;
  sku: string;
  description: string;
  categoryId: string;
  unitPrice: string;
  stockQuantity: string;
  vendorId: string;
};

function emptyForm(vendorId = ""): FormState {
  return {
    name: "",
    sku: "",
    description: "",
    categoryId: "",
    unitPrice: "",
    stockQuantity: "0",
    vendorId,
  };
}

function fromProduct(product: Product): FormState {
  return {
    name: product.name,
    sku: product.sku,
    description: product.description ?? "",
    categoryId: product.categoryId ?? "",
    unitPrice: String(Number(product.price)),
    stockQuantity: String(product.stockQuantity),
    vendorId: product.companyId,
  };
}

export default function ProductDirectory() {
  const session = getSession();
  const canEdit = canEditPage(
    session?.permissions,
    "products",
    isAdmin(session?.user.role ?? ""),
  );

  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Company[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [currency, setCurrency] = useState(getOrgCurrency);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => subscribeOrgCurrency(setCurrency), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [productRows, companyRows, categoryRows, settings] = await Promise.all([
        listProducts(),
        listCompanies({ types: ["Supplier", "Both"] }),
        listCategories(),
        getOrganizationSettings().catch(() => null),
      ]);
      setProducts(productRows);
      setVendors(companyRows);
      setCategories(categoryRows);
      if (settings?.defaultCurrency) {
        setOrgCurrency(settings.defaultCurrency);
        setCurrency(settings.defaultCurrency);
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load products.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter((product) => {
      const haystack = [product.sku, product.name, product.companyName, product.categoryName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [products, search]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm(vendors[0]?.id ?? ""));
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setForm(fromProduct(product));
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
    if (!canEdit) {
      setFormError("You have view-only access to products.");
      return;
    }
    if (!form.name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (!form.sku.trim()) {
      setFormError("SKU is required.");
      return;
    }
    if (!form.vendorId) {
      setFormError("Vendor is required.");
      return;
    }
    const price = Number(form.unitPrice);
    if (Number.isNaN(price) || price <= 0) {
      setFormError("Unit price must be greater than 0.");
      return;
    }
    const stock = Number(form.stockQuantity);
    if (!Number.isInteger(stock) || stock < 0) {
      setFormError("Stock quantity must be a whole number of 0 or more.");
      return;
    }

    const payload = {
      companyId: form.vendorId,
      categoryId: form.categoryId || null,
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      sku: form.sku.trim(),
      price,
      stockQuantity: stock,
      isActive: true,
    };

    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await updateProduct(editing.id, payload);
      } else {
        await createProduct(payload);
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not save product.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(product: Product) {
    if (!canEdit) return;
    if (!window.confirm(`Delete product “${product.name}”?`)) return;
    setDeletingId(product.id);
    setError(null);
    try {
      await deleteProduct(product.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete product.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="animate-rise">
      <AdminPageHeader
        title="Products"
        description="Vendor catalog used when creating purchase orders."
        action={
          canEdit ? (
            <button
              type="button"
              onClick={openCreate}
              className="rounded-full bg-[#051A2D] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#0a3050]"
            >
              Add product
            </button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Search products</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by SKU or product name…"
            className="w-full rounded-2xl border border-black/[0.06] bg-[#e4ebf2] px-4 py-2.5 text-sm font-medium text-[#0B1220] outline-none ring-[#051A2D]/30 placeholder:text-[#5B6577] focus:ring-2"
          />
        </label>
        <p className="text-sm font-semibold text-[#5B6577]">
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

      <div className="overflow-hidden rounded-[24px] border border-black/[0.04] bg-[#e4ebf2]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#e8eef4] text-xs font-semibold tracking-wide text-[#5B6577]">
              <tr>
                <th className="px-5 py-3.5">SKU</th>
                <th className="px-5 py-3.5">Product name</th>
                <th className="px-5 py-3.5">Category</th>
                <th className="px-5 py-3.5">Unit price</th>
                <th className="px-5 py-3.5">Stock / Qty</th>
                <th className="px-5 py-3.5">Vendor</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-[#5B6577]">
                    Loading products…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-[#5B6577]">
                    No products found.
                  </td>
                </tr>
              ) : (
                filtered.map((product) => (
                  <tr
                    key={product.id}
                    className="border-t border-black/[0.04] transition hover:bg-[#d4dee9]"
                  >
                    <td className="px-5 py-3.5 font-semibold text-[#0B1220]">
                      {product.sku}
                    </td>
                    <td className="px-5 py-3.5 text-[#0B1220]">{product.name}</td>
                    <td className="px-5 py-3.5 text-[#4B5563]">
                      {product.categoryName || "—"}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-[#0B1220]">
                      {formatProductMoney(
                        Number(product.price),
                        product.currency || currency,
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-[#4B5563]">
                      {product.stockQuantity}
                    </td>
                    <td className="px-5 py-3.5 text-[#4B5563]">
                      {product.companyName || "—"}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(product)}
                          className="rounded-full px-3 py-1.5 text-xs font-bold text-[#051A2D] hover:bg-[#051A2D]/[0.06]"
                        >
                          Edit
                        </button>
                        {canEdit ? (
                          <button
                            type="button"
                            disabled={deletingId === product.id}
                            onClick={() => void onDelete(product)}
                            className="rounded-full px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            {deletingId === product.id ? "…" : "Delete"}
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

      {modalOpen
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4">
              <button
                type="button"
                aria-label="Close dialog"
                className="absolute inset-0 bg-[#051A2D]/55"
                onClick={closeModal}
              />
              <div className="relative z-10 my-auto max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[28px] bg-[#e4ebf2] p-6 shadow-2xl sm:p-7">
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-[#0B1220]">
                      {editing ? "Edit product" : "Add product"}
                    </h2>
                    <p className="mt-1 text-sm font-semibold text-[#5B6577]">
                      Products are linked to a vendor and available in Add PO line items.
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
                        disabled={!canEdit}
                      />
                    </Field>
                    <Field label="SKU *">
                      <input
                        value={form.sku}
                        onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                        className={fieldClass}
                        disabled={!canEdit}
                      />
                    </Field>
                    <Field label="Category">
                      <ScrollSelect
                        value={form.categoryId}
                        placeholder="No category"
                        options={categories.map((c) => ({ value: c.id, label: c.name }))}
                        onChange={(categoryId) => setForm((f) => ({ ...f, categoryId }))}
                        className={fieldClass}
                        disabled={!canEdit}
                      />
                    </Field>
                    <Field label="Unit price *">
                      <input
                        inputMode="decimal"
                        value={form.unitPrice}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, unitPrice: e.target.value }))
                        }
                        className={fieldClass}
                        disabled={!canEdit}
                        placeholder="0.00"
                      />
                    </Field>
                    <Field label="Stock quantity *">
                      <input
                        inputMode="numeric"
                        value={form.stockQuantity}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, stockQuantity: e.target.value }))
                        }
                        className={fieldClass}
                        disabled={!canEdit}
                      />
                    </Field>
                    <Field label="Vendor *" className="sm:col-span-2">
                      <ScrollSelect
                        value={form.vendorId}
                        placeholder="Select vendor"
                        options={vendors.map((v) => ({ value: v.id, label: v.name }))}
                        onChange={(vendorId) => setForm((f) => ({ ...f, vendorId }))}
                        className={fieldClass}
                        disabled={!canEdit}
                      />
                    </Field>
                    <Field label="Description" className="sm:col-span-2">
                      <textarea
                        value={form.description}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, description: e.target.value }))
                        }
                        rows={3}
                        className={`${fieldClass} resize-none`}
                        disabled={!canEdit}
                        placeholder="Optional"
                      />
                    </Field>
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
                    {canEdit ? (
                      <button
                        type="submit"
                        disabled={saving}
                        className="rounded-full bg-[#051A2D] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0a3050] disabled:opacity-50"
                      >
                        {saving
                          ? "Saving…"
                          : editing
                            ? "Save changes"
                            : "Create product"}
                      </button>
                    ) : null}
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}
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
