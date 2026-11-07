"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { ApiError } from "@/lib/api";
import { actionLabel, actionTone, formatAuditWhen } from "@/lib/audit";
import { getSession, isAdmin } from "@/lib/auth";
import { getDashboardSummary, type DashboardSummary } from "@/lib/dashboard";
import { formatMoney } from "@/lib/orders";
import { canViewPage } from "@/lib/permissions";

const shortcuts = [
  { label: "Purchase Orders", href: "/admin/purchase-orders", hint: "Create and track POs", pageKey: "purchaseOrders" },
  { label: "Invoices", href: "/admin/invoices", hint: "Billing status", pageKey: "invoices" },
  { label: "Companies", href: "/admin/companies", hint: "Clients and vendors", pageKey: "companies" },
  { label: "Products", href: "/admin/products", hint: "Vendor catalog", pageKey: "products" },
  { label: "Employees", href: "/admin/employees", hint: "Accounts and roles", pageKey: "employees" },
  { label: "Audit Log", href: "/admin/audit-log", hint: "Monitor activity", pageKey: "auditLog" },
];

export default function AdminDashboard() {
  const session = getSession();
  const admin = isAdmin(session?.user.role ?? "");
  const canViewAudit = canViewPage(
    session?.permissions,
    "auditLog",
    admin,
    session?.enabledPageKeys,
  );
  const visibleShortcuts = shortcuts.filter((item) =>
    canViewPage(session?.permissions, item.pageKey, admin, session?.enabledPageKeys),
  );
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getDashboardSummary());
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load dashboard.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="animate-rise">
      <AdminPageHeader
        title="Dashboard"
        description="At-a-glance status across orders, invoices, partners, and people."
        action={
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full border border-black/[0.08] bg-white px-4 py-2.5 text-sm font-bold text-[#051A2D] hover:bg-[#F8FAFB]"
          >
            Refresh
          </button>
        }
      />

      {error ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <KpiCard
          label="Purchase orders"
          value={loading ? "…" : String(data?.orders.total ?? 0)}
          hint={
            loading
              ? "Loading"
              : `${data?.orders.pending ?? 0} pending · ${data?.orders.draft ?? 0} draft`
          }
          href="/admin/purchase-orders"
        />
        <KpiCard
          label="Approved POs"
          value={loading ? "…" : String(data?.orders.approved ?? 0)}
          hint="Ready for fulfillment"
          href="/admin/purchase-orders"
        />
        <KpiCard
          label="Open invoices"
          value={
            loading
              ? "…"
              : String(
                  (data?.invoices.unpaid ?? 0) +
                    (data?.invoices.partiallyPaid ?? 0) +
                    (data?.invoices.overdue ?? 0),
                )
          }
          hint={
            loading
              ? "Loading"
              : `${formatMoney(data?.invoices.outstandingAmount ?? 0)} outstanding`
          }
          href="/admin/invoices"
        />
        <KpiCard
          label="Partners"
          value={
            loading
              ? "…"
              : String((data?.partners.clients ?? 0) + (data?.partners.vendors ?? 0))
          }
          hint={
            loading
              ? "Loading"
              : `${data?.partners.clients ?? 0} clients · ${data?.partners.vendors ?? 0} vendors`
          }
          href="/admin/companies"
        />
        <KpiCard
          label="Products"
          value={loading ? "…" : String(data?.productCount ?? 0)}
          hint="Active catalog items"
          href="/admin/products"
        />
        <KpiCard
          label="Employees"
          value={loading ? "…" : String(data?.employees.active ?? 0)}
          hint={
            loading ? "Loading" : `${data?.employees.total ?? 0} total accounts`
          }
          href="/admin/employees"
        />
      </div>

      <div className={`mb-5 grid gap-4 ${canViewAudit ? "xl:grid-cols-[1.1fr_0.9fr]" : ""}`}>
        <section className="rounded-[24px] border border-black/[0.04] bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[#0B1220]">Needs attention</h2>
              <p className="mt-0.5 text-sm font-medium text-[#8B95A5]">
                Items that usually need a follow-up
              </p>
            </div>
          </div>
          {loading ? (
            <p className="py-8 text-center text-sm text-[#8B95A5]">Loading…</p>
          ) : !data?.attention.length ? (
            <p className="rounded-2xl bg-[#F8FAFB] px-4 py-6 text-center text-sm font-medium text-[#8B95A5]">
              Nothing urgent right now.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.attention.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-[#F8FAFB] px-4 py-3 transition hover:bg-[#F3F5F7]"
                  >
                    <span className="text-sm font-semibold text-[#0B1220]">{item.label}</span>
                    <span className="inline-flex min-w-[2rem] items-center justify-center rounded-full bg-[#051A2D] px-2.5 py-1 text-xs font-bold text-white">
                      {item.count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {canViewAudit ? (
        <section className="rounded-[24px] border border-black/[0.04] bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[#0B1220]">Recent activity</h2>
              <p className="mt-0.5 text-sm font-medium text-[#8B95A5]">
                Latest actions across the system
              </p>
            </div>
            <Link
              href="/admin/audit-log"
              className="text-xs font-bold text-[#051A2D] hover:underline"
            >
              Open audit log
            </Link>
          </div>
          {loading ? (
            <p className="py-8 text-center text-sm text-[#8B95A5]">Loading…</p>
          ) : !data?.recentActivity.length ? (
            <p className="rounded-2xl bg-[#F8FAFB] px-4 py-6 text-center text-sm font-medium text-[#8B95A5]">
              No activity yet.
            </p>
          ) : (
            <ul className="divide-y divide-black/[0.04]">
              {data.recentActivity.map((row) => (
                <li key={row.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#0B1220]">
                      {row.actorName}
                    </p>
                    <p className="mt-0.5 truncate text-xs font-medium text-[#8B95A5]">
                      {row.entityLabel
                        ? `${row.entityType}: ${row.entityLabel}`
                        : row.entityType}
                      {row.summary ? ` · ${row.summary.replace(/^\[demo\]\s*/, "")}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${actionTone(row.action)}`}
                    >
                      {actionLabel(row.action)}
                    </span>
                    <p className="mt-1 text-[11px] font-medium text-[#8B95A5]">
                      {formatAuditWhen(row.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        ) : null}
      </div>

      <section>
        <h2 className="mb-3 text-base font-bold text-[#0B1220]">Shortcuts</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleShortcuts.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-[24px] border border-black/[0.04] bg-white px-5 py-5 transition hover:ring-1 hover:ring-[#051A2D]/15"
            >
              <p className="text-lg font-bold text-[#051A2D]">{item.label}</p>
              <p className="mt-1 text-sm font-medium text-[#8B95A5]">{item.hint}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-[22px] border border-black/[0.04] bg-white px-5 py-4 transition hover:ring-1 hover:ring-[#051A2D]/15"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[#8B95A5]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[#0B1220]">{value}</p>
      <p className="mt-1 text-xs font-medium text-[#8B95A5]">{hint}</p>
    </Link>
  );
}
