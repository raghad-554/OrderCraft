"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { actionLabel, actionTone, formatAuditWhen } from "@/lib/audit";
import { getSession, isAdmin, isFinance, isProcurement } from "@/lib/auth";
import {
  compactMoney,
  formatTrendDelta,
  getDashboardSummary,
  type DashboardSummary,
  type MetricTrend,
} from "@/lib/dashboard";
import { formatMoney } from "@/lib/orders";
import { canEditPage, canViewPage } from "@/lib/permissions";

const FINANCE_ATTENTION_KEYS = new Set([
  "openInvoices",
  "unpaidInvoices",
  "overdueInvoices",
]);
const ORDER_ATTENTION_KEYS = new Set(["pendingOrders", "draftOrders"]);

function roleLabel(role: string) {
  if (/^admin$/i.test(role)) return "Admin";
  if (/finance/i.test(role)) return "Finance";
  if (/procurement/i.test(role)) return "Procurement";
  return role.replace(/([a-z])([A-Z])/g, "$1 $2") || "Member";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function avatarKey(userId: string) {
  return `ordercraft_avatar_${userId}`;
}

function attentionBadge(key: string) {
  if (key === "pendingOrders") return "bg-amber-100 text-amber-800";
  if (key === "draftOrders") return "bg-sky-100 text-sky-800";
  if (key === "overdueInvoices" || key === "unpaidInvoices")
    return "bg-rose-100 text-rose-800";
  if (key === "openInvoices") return "bg-orange-100 text-orange-800";
  return "bg-[#E8EEF3] text-[#051A2D]";
}

/** Stable mock % from user id — personal only, not other employees. */
function personalTimePercent(userId: string) {
  if (!userId) return 55;
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash + userId.charCodeAt(i) * (i + 1)) % 97;
  return 40 + (hash % 46); // 40–85
}

type VolumeMode = "sales" | "purchase";

export default function AdminDashboard() {
  const session = getSession();
  const role = session?.user.role ?? "";
  const admin = isAdmin(role);
  const finance = !admin && (isFinance(role) || /finance/i.test(role));
  const procurement =
    !admin && !finance && (isProcurement(role) || /procurement/i.test(role));
  const employee = !admin; // all non-admin staff share one page shape
  const showFinanceMoney = admin || finance || isFinance(role);
  const enabled = session?.enabledPageKeys;
  const perms = session?.permissions;

  const canOrders = canViewPage(perms, "purchaseOrders", admin, enabled);
  const canInvoices = canViewPage(perms, "invoices", admin, enabled);
  const canCompanies = canViewPage(perms, "companies", admin, enabled);
  const canViewAudit = canViewPage(perms, "auditLog", admin, enabled);
  const canCreateOrder = canEditPage(perms, "purchaseOrders", admin, enabled);
  const canCreateInvoice = canEditPage(perms, "invoices", admin, enabled);
  const canCreateCompany = canEditPage(perms, "companies", admin, enabled);

  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [volumeMode, setVolumeMode] = useState<VolumeMode>(
    procurement || (!finance && canOrders) ? "purchase" : "sales",
  );

  const displayName = session?.user.fullName || session?.user.username || "User";
  const department = session?.user.department?.trim() || "Operations";
  const roleText = roleLabel(role);
  const myTimePercent = personalTimePercent(session?.user.id ?? "");

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

  useEffect(() => {
    if (!session?.user.id) return;
    setAvatarUrl(localStorage.getItem(avatarKey(session.user.id)));
  }, [session?.user.id]);

  useEffect(() => {
    if (finance) setVolumeMode("sales");
    else if (procurement) setVolumeMode("purchase");
  }, [finance, procurement]);

  const attention = useMemo(() => {
    let rows = data?.attention ?? [];
    if (finance) {
      rows = rows.filter((item) => FINANCE_ATTENTION_KEYS.has(item.key));
    } else if (procurement) {
      rows = rows.filter((item) => ORDER_ATTENTION_KEYS.has(item.key));
    } else if (employee && !showFinanceMoney) {
      rows = rows.filter((item) => !FINANCE_ATTENTION_KEYS.has(item.key));
    }
    return rows;
  }, [data?.attention, finance, procurement, employee, showFinanceMoney]);

  function onPickAvatar(file: File | null) {
    if (!file || !session?.user.id) return;
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === "string" ? reader.result : null;
      if (!url) return;
      localStorage.setItem(avatarKey(session.user.id), url);
      setAvatarUrl(url);
    };
    reader.readAsDataURL(file);
  }

  const openCount =
    (data?.invoices.unpaid ?? 0) +
    (data?.invoices.partiallyPaid ?? 0) +
    (data?.invoices.overdue ?? 0);

  const progressPercent =
    admin || finance
      ? Number(data?.progress.paidInvoicePercent ?? 0)
      : Number(data?.progress.fulfilledOrderPercent ?? 0);

  const attentionSubtitle = finance
    ? "Billing items that need follow-up"
    : procurement
      ? "Orders that need your action"
      : admin
        ? "Follow-ups across orders & billing"
        : "Items that need your follow-up";

  const overviewSubtitle = finance
    ? "Invoice and cash position"
    : procurement
      ? "Order pipeline status"
      : admin
        ? "Last 30 days vs prior 30 days"
        : "Your department overview";

  const hoursUsed = Math.round((myTimePercent / 100) * 8 * 10) / 10;

  return (
    <div className="animate-rise space-y-5">
      {/* Profile — same for everyone */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-[4.5rem] w-[4.5rem] items-center justify-center overflow-hidden rounded-full border-[3px] border-[#2EC4B6] bg-[#E8F7F5] text-lg font-bold text-[#051A2D]"
              aria-label="Add profile picture"
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <svg viewBox="0 0 24 24" className="h-9 w-9 text-[#2EC4B6]" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="8.5" r="3.2" />
                  <path strokeLinecap="round" d="M5 19c1.5-3.2 3.8-4.8 7-4.8s5.5 1.6 7 4.8" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#051A2D] text-white"
              aria-label="Upload photo"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path strokeLinecap="round" d="M12 6v12M6 12h12" />
              </svg>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                onPickAvatar(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B1220] sm:text-[1.75rem]">
              {displayName}
            </h1>
            <p className="mt-1 text-sm font-medium text-[#8B95A5]">
              {department} — {roleText}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-full border border-black/[0.08] bg-white px-4 py-2 text-sm font-bold text-[#051A2D] hover:bg-[#F8FAFB]"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}

      {/* Same 3-column shape for admin & employees */}
      <div className="grid gap-4 xl:grid-cols-12">
        <section className="rounded-[22px] border border-black/[0.04] bg-white p-4 xl:col-span-3">
          <h2 className="text-sm font-bold text-[#0B1220]">Needs attention</h2>
          <p className="mt-0.5 text-xs font-medium text-[#8B95A5]">{attentionSubtitle}</p>
          <div className="mt-4 space-y-2">
            {loading ? (
              [0, 1, 2].map((i) => (
                <div key={i} className="h-11 animate-pulse rounded-xl bg-[#F3F5F7]" />
              ))
            ) : !attention.length ? (
              <p className="rounded-xl bg-[#F8FAFB] px-3 py-6 text-center text-xs font-medium text-[#8B95A5]">
                Nothing urgent right now.
              </p>
            ) : (
              attention.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className="flex items-center justify-between gap-2 rounded-xl bg-[#F8FAFB] px-3 py-2.5 transition hover:bg-[#F0F3F6]"
                >
                  <span className="text-xs font-semibold text-[#0B1220]">{item.label}</span>
                  <span
                    className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${attentionBadge(item.key)}`}
                  >
                    {item.count}
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="rounded-[22px] border border-black/[0.04] bg-white p-4 xl:col-span-5">
          <h2 className="text-sm font-bold text-[#0B1220]">Overview</h2>
          <p className="mt-0.5 text-xs font-medium text-[#8B95A5]">{overviewSubtitle}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {admin ? (
              <>
                {canOrders ? (
                  <>
                    <OverviewCard
                      label="Active orders"
                      value={loading ? "…" : String(data?.orders.total ?? 0)}
                      moneyHint={loading ? undefined : `${data?.orders.approved ?? 0} approved`}
                      trend={data?.orders.totalTrend}
                      href="/admin/purchase-orders"
                    />
                    <OverviewCard
                      label="Pending approvals"
                      value={loading ? "…" : String(data?.orders.pending ?? 0)}
                      moneyHint="Awaiting review"
                      href="/admin/purchase-orders?status=Pending"
                    />
                  </>
                ) : null}
                {showFinanceMoney ? (
                  <>
                    <OverviewCard
                      label="Open invoices"
                      value={loading ? "…" : String(openCount)}
                      moneyHint={
                        loading
                          ? undefined
                          : `${formatMoney(data?.invoices.outstandingAmount ?? 0)} due`
                      }
                      trend={data?.invoices.openTrend}
                      href="/admin/invoices?status=Open"
                    />
                    <OverviewCard
                      label="Outstanding balance"
                      value={loading ? "…" : compactMoney(data?.invoices.outstandingAmount ?? 0)}
                      moneyHint={loading ? undefined : `${data?.invoices.overdue ?? 0} overdue`}
                      href="/admin/invoices?status=Open"
                    />
                  </>
                ) : null}
              </>
            ) : null}

            {finance ? (
              <>
                <OverviewCard
                  label="Open invoices"
                  value={loading ? "…" : String(openCount)}
                  moneyHint={
                    loading
                      ? undefined
                      : `${formatMoney(data?.invoices.outstandingAmount ?? 0)} due`
                  }
                  trend={data?.invoices.openTrend}
                  href="/admin/invoices?status=Open"
                />
                <OverviewCard
                  label="Outstanding balance"
                  value={loading ? "…" : compactMoney(data?.invoices.outstandingAmount ?? 0)}
                  moneyHint={loading ? undefined : `${data?.invoices.overdue ?? 0} overdue`}
                  href="/admin/invoices?status=Open"
                />
                <OverviewCard
                  label="Unpaid invoices"
                  value={loading ? "…" : String(data?.invoices.unpaid ?? 0)}
                  moneyHint="Not paid yet"
                  href="/admin/invoices?status=Unpaid"
                />
                <OverviewCard
                  label="Paid invoices"
                  value={loading ? "…" : String(data?.invoices.paid ?? 0)}
                  moneyHint="Fully settled"
                  href="/admin/invoices?status=Paid"
                />
              </>
            ) : null}

            {employee && !finance ? (
              <>
                {canOrders ? (
                  <>
                    <OverviewCard
                      label="Active orders"
                      value={loading ? "…" : String(data?.orders.total ?? 0)}
                      moneyHint={loading ? undefined : `${data?.orders.draft ?? 0} draft`}
                      trend={data?.orders.totalTrend}
                      href="/admin/purchase-orders"
                    />
                    <OverviewCard
                      label="Pending approvals"
                      value={loading ? "…" : String(data?.orders.pending ?? 0)}
                      moneyHint="Awaiting review"
                      href="/admin/purchase-orders?status=Pending"
                    />
                    <OverviewCard
                      label="Approved orders"
                      value={loading ? "…" : String(data?.orders.approved ?? 0)}
                      moneyHint="Ready for fulfillment"
                      trend={data?.orders.approvedTrend}
                      href="/admin/purchase-orders?status=Approved"
                    />
                  </>
                ) : null}
                {canCompanies ? (
                  <OverviewCard
                    label="Partners"
                    value={
                      loading
                        ? "…"
                        : String((data?.partners.clients ?? 0) + (data?.partners.vendors ?? 0))
                    }
                    moneyHint={
                      loading
                        ? undefined
                        : `${data?.partners.clients ?? 0} clients · ${data?.partners.vendors ?? 0} vendors`
                    }
                    trend={data?.partners.totalTrend}
                    href="/admin/companies"
                  />
                ) : null}
                {canInvoices && !canOrders ? (
                  <OverviewCard
                    label="Invoices"
                    value={loading ? "…" : String(data?.invoices.total ?? 0)}
                    moneyHint="View billing"
                    href="/admin/invoices"
                  />
                ) : null}
              </>
            ) : null}
          </div>
        </section>

        {/* Admin: recent activity · Employees: personal time only */}
        <section className="rounded-[22px] border border-black/[0.04] bg-white p-4 xl:col-span-4">
          {admin ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-[#0B1220]">Recent activity</h2>
                  <p className="mt-0.5 text-xs font-medium text-[#8B95A5]">Latest actions</p>
                </div>
                {canViewAudit ? (
                  <Link
                    href="/admin/audit-log"
                    className="text-[11px] font-bold text-[#051A2D] hover:underline"
                  >
                    Full log
                  </Link>
                ) : null}
              </div>
              <ul className="mt-3 max-h-[18rem] space-y-2 overflow-y-auto">
                {!canViewAudit ? (
                  <li className="py-8 text-center text-xs font-medium text-[#8B95A5]">
                    Audit access required.
                  </li>
                ) : loading ? (
                  [0, 1, 2, 3].map((i) => (
                    <li key={i} className="h-12 animate-pulse rounded-xl bg-[#F3F5F7]" />
                  ))
                ) : !data?.recentActivity.length ? (
                  <li className="py-8 text-center text-xs font-medium text-[#8B95A5]">
                    No activity yet.
                  </li>
                ) : (
                  data.recentActivity.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-start gap-2.5 rounded-xl bg-[#F8FAFB] px-3 py-2.5"
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#051A2D] text-[10px] font-bold text-white">
                        {initials(row.actorName)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-[#0B1220]">
                          {row.entityLabel
                            ? `${row.entityType}: ${row.entityLabel}`
                            : row.entityType}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] font-medium text-[#8B95A5]">
                          {row.actorName}
                          {row.summary
                            ? ` · ${row.summary.replace(/^\[demo\]\s*/i, "")}`
                            : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span
                          className={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-bold ${actionTone(row.action)}`}
                        >
                          {actionLabel(row.action)}
                        </span>
                        <p className="mt-1 text-[9px] font-medium text-[#8B95A5]">
                          {formatAuditWhen(row.createdAt)}
                        </p>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </>
          ) : (
            <>
              <h2 className="text-sm font-bold text-[#0B1220]">My time today</h2>
              <p className="mt-0.5 text-xs font-medium text-[#8B95A5]">
                Your share of the workday · preview only
              </p>
              <div className="mt-4 flex flex-col items-center">
                <ProgressRing percent={myTimePercent} />
                <p className="mt-3 text-sm font-bold text-[#0B1220]">{displayName}</p>
                <p className="mt-1 text-xs font-medium text-[#8B95A5]">
                  About {hoursUsed}h of an 8h day (sample)
                </p>
                <p className="mt-3 text-center text-[10px] font-medium text-[#8B95A5]">
                  Only your time is shown — live tracking comes later.
                </p>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Bottom row — same shape; actions differ by role */}
      <div className="grid gap-4 lg:grid-cols-12">
        {canOrders ? (
          <section className="rounded-[22px] border border-black/[0.04] bg-white p-4 lg:col-span-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-[#0B1220]">
                  {volumeMode === "sales"
                    ? "Sales volume this year"
                    : "Purchase volume this year"}
                </h2>
                <p className="mt-0.5 text-xs font-medium text-[#8B95A5]">
                  {volumeMode === "sales"
                    ? "Sale orders · last 12 months"
                    : "Purchase orders · last 12 months"}
                </p>
              </div>
              {admin || finance ? (
                <div className="inline-flex rounded-full border border-black/[0.08] bg-[#F8FAFB] p-0.5">
                  <button
                    type="button"
                    onClick={() => setVolumeMode("sales")}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                      volumeMode === "sales"
                        ? "bg-[#7B61FF] text-white"
                        : "text-[#8B95A5] hover:text-[#0B1220]"
                    }`}
                  >
                    Sales
                  </button>
                  <button
                    type="button"
                    onClick={() => setVolumeMode("purchase")}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                      volumeMode === "purchase"
                        ? "bg-[#2EC4B6] text-white"
                        : "text-[#8B95A5] hover:text-[#0B1220]"
                    }`}
                  >
                    Purchase
                  </button>
                </div>
              ) : null}
            </div>
            <MonthlyVolumeChart
              points={data?.monthlyVolumes ?? []}
              loading={loading}
              mode={volumeMode}
            />
            <div className="mt-3 flex gap-4 text-[10px] font-bold uppercase tracking-wide text-[#8B95A5]">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={`h-2 w-2 rounded-full ${
                    volumeMode === "sales" ? "bg-[#7B61FF]" : "bg-[#2EC4B6]"
                  }`}
                />
                {volumeMode === "sales" ? "Sales" : "Purchase"}
              </span>
            </div>
          </section>
        ) : (
          <section className="rounded-[22px] border border-black/[0.04] bg-white p-4 lg:col-span-5">
            <h2 className="text-sm font-bold text-[#0B1220]">Volume chart</h2>
            <p className="mt-6 py-10 text-center text-xs font-medium text-[#8B95A5]">
              Order access is required to view volume charts.
            </p>
          </section>
        )}

        <section className="rounded-[22px] border border-black/[0.04] bg-white p-4 lg:col-span-4">
          <h2 className="text-sm font-bold text-[#0B1220]">
            {admin || finance ? "Payment progress" : "Fulfillment progress"}
          </h2>
          <p className="mt-0.5 text-xs font-medium text-[#8B95A5]">
            {admin || finance
              ? "Share of invoices fully paid"
              : "Share of orders approved or beyond"}
          </p>
          <div className="mt-4 flex flex-col items-center">
            <ProgressRing percent={loading ? 0 : progressPercent} />
            <div className="mt-4 w-full max-w-[14rem] space-y-1.5 text-left text-xs">
              {(admin || procurement || (employee && !finance)) && (
                <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-2">
                  <span className="font-medium text-[#8B95A5]">Top vendor</span>
                  <span className="truncate font-bold text-[#0B1220]">
                    {data?.topVendorName || "—"}
                  </span>
                </div>
              )}
              {(admin || finance) && (
                <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-2">
                  <span className="font-medium text-[#8B95A5]">Top client</span>
                  <span className="truncate font-bold text-[#0B1220]">
                    {data?.topClientName || "—"}
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="flex flex-col rounded-[22px] border border-black/[0.04] bg-white p-4 lg:col-span-3">
          <h2 className="text-sm font-bold text-[#0B1220]">Quick actions</h2>
          <p className="mt-0.5 text-xs font-medium text-[#8B95A5]">
            {finance
              ? "Finance actions"
              : procurement
                ? "Procurement actions"
                : admin
                  ? "Admin actions"
                  : "Your department actions"}
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {admin ? (
              <>
                {canCreateOrder ? (
                  <QuickAction href="/admin/purchase-orders?create=1" label="New purchase order" />
                ) : null}
                {canCreateCompany ? (
                  <QuickAction href="/admin/companies" label="Add company" />
                ) : null}
                {canCreateInvoice ? (
                  <QuickAction href="/admin/invoices?create=1" label="New invoice" accent />
                ) : null}
              </>
            ) : null}

            {finance ? (
              <>
                <QuickAction href="/admin/invoices?create=1" label="New invoice" accent />
                <QuickAction href="/admin/invoices?status=Open" label="Open invoices" />
                <QuickAction href="/admin/invoices?status=Overdue" label="Overdue invoices" />
              </>
            ) : null}

            {employee && !finance ? (
              <>
                {canCreateOrder ? (
                  <QuickAction href="/admin/purchase-orders?create=1" label="New purchase order" />
                ) : canOrders ? (
                  <QuickAction href="/admin/purchase-orders" label="View orders" />
                ) : null}
                {canOrders ? (
                  <QuickAction
                    href="/admin/purchase-orders?status=Pending"
                    label="Pending approvals"
                  />
                ) : null}
                {canCreateCompany ? (
                  <QuickAction href="/admin/companies" label="Add company" />
                ) : canCompanies ? (
                  <QuickAction href="/admin/companies" label="View companies" />
                ) : null}
                {canInvoices ? (
                  <QuickAction href="/admin/invoices" label="View invoices" />
                ) : null}
              </>
            ) : null}

            {admin &&
            !canCreateOrder &&
            !canCreateCompany &&
            !canCreateInvoice ? (
              <p className="py-6 text-center text-xs font-medium text-[#8B95A5]">
                No create permissions.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function OverviewCard({
  label,
  value,
  moneyHint,
  trend,
  href,
}: {
  label: string;
  value: string;
  moneyHint?: string;
  trend?: MetricTrend | null;
  href: string;
}) {
  const delta = formatTrendDelta(trend);
  const up = trend?.deltaPercent != null && Number(trend.deltaPercent) > 0;
  const down = trend?.deltaPercent != null && Number(trend.deltaPercent) < 0;

  return (
    <Link
      href={href}
      className="rounded-2xl border border-black/[0.05] bg-[#F8FAFB] px-3.5 py-3 transition hover:border-[#051A2D]/15 hover:bg-white"
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8B95A5]">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-[#0B1220]">{value}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="truncate text-[10px] font-medium text-[#8B95A5]">
          {moneyHint ?? " "}
        </p>
        {delta ? (
          <span
            className={`shrink-0 text-[10px] font-bold ${
              up ? "text-emerald-600" : down ? "text-rose-600" : "text-[#8B95A5]"
            }`}
          >
            {delta}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

function QuickAction({
  href,
  label,
  accent,
}: {
  href: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wide transition ${
        accent
          ? "bg-gradient-to-r from-[#051A2D] to-[#2EC4B6] text-white hover:opacity-95"
          : "bg-[#051A2D] text-white hover:bg-[#0a2a45]"
      }`}
    >
      <span className="text-base leading-none">+</span>
      {label}
    </Link>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const p = Math.max(0, Math.min(100, percent));
  const r = 54;
  const c = 2 * Math.PI * r;
  const offset = c - (p / 100) * c;

  return (
    <div className="relative h-36 w-36">
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#E8EEF3" strokeWidth="12" />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke="#2EC4B6"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-2xl font-bold text-[#0B1220]">{Math.round(p)}%</p>
        <p className="text-[10px] font-bold uppercase tracking-wide text-[#8B95A5]">
          Progress
        </p>
      </div>
    </div>
  );
}

function MonthlyVolumeChart({
  points,
  loading,
  mode,
}: {
  points: { month: string; purchaseAmount: number; saleAmount: number }[];
  loading: boolean;
  mode: VolumeMode;
}) {
  if (loading) {
    return <div className="mt-6 h-40 animate-pulse rounded-xl bg-[#F3F5F7]" />;
  }

  const values = points.map((p) =>
    mode === "sales" ? p.saleAmount : p.purchaseAmount,
  );
  const max = Math.max(1, ...values);
  const h = 140;
  const gap = 10;
  const n = Math.max(points.length, 1);
  const barW = Math.max(10, Math.min(22, (320 - gap * n) / n));
  const color = mode === "sales" ? "#7B61FF" : "#2EC4B6";

  return (
    <div className="mt-4 overflow-x-auto">
      <svg
        viewBox={`0 0 ${n * (barW + gap) + 20} ${h + 28}`}
        className="h-44 w-full min-w-[280px]"
        role="img"
        aria-label={
          mode === "sales"
            ? "Monthly sales volume chart"
            : "Monthly purchase volume chart"
        }
      >
        {points.map((p, i) => {
          const amount = mode === "sales" ? p.saleAmount : p.purchaseAmount;
          const x = 10 + i * (barW + gap);
          const barH = (amount / max) * (h - 8);
          return (
            <g key={`${p.month}-${mode}`}>
              <rect
                x={x}
                y={h - barH}
                width={barW}
                height={Math.max(barH, amount > 0 ? 2 : 1)}
                rx="4"
                fill={color}
                opacity={amount > 0 ? 1 : 0.25}
              />
              <text
                x={x + barW / 2}
                y={h + 16}
                textAnchor="middle"
                className="fill-[#8B95A5]"
                fontSize="9"
                fontWeight="600"
              >
                {p.month}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
