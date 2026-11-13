"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { type OrganizationSummary } from "@/lib/organizations";
import {
  canViewPage,
  type PagePermissionItem,
} from "@/lib/permissions";

const navItems = [
  { href: "/admin", label: "Dashboard", pageKey: "dashboard", exact: true },
  { href: "/admin/companies", label: "Company", pageKey: "companies" },
  { href: "/admin/products", label: "Products", pageKey: "products" },
  { href: "/admin/employees", label: "Employee", pageKey: "employees" },
  { href: "/admin/purchase-orders", label: "Orders", pageKey: "purchaseOrders" },
  { href: "/admin/invoices", label: "Invoices", pageKey: "invoices" },
  { href: "/admin/audit-log", label: "Audit Log", pageKey: "auditLog" },
  { href: "/admin/settings", label: "Setting", pageKey: "settings" },
] as const;

function NavIcon({ label }: { label: string }) {
  const common = "h-[18px] w-[18px] shrink-0";
  switch (label) {
    case "Dashboard":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="3" width="8" height="8" rx="1.5" />
          <rect x="13" y="3" width="8" height="5" rx="1.5" />
          <rect x="13" y="10" width="8" height="11" rx="1.5" />
          <rect x="3" y="13" width="8" height="8" rx="1.5" />
        </svg>
      );
    case "Company":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" d="M4 20V6a2 2 0 0 1 2-2h7v16M13 8h5a2 2 0 0 1 2 2v10M8 8h1M8 12h1M8 16h1M16 12h1M16 16h1" />
        </svg>
      );
    case "Products":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.5 12 3 3 8.5v7L12 21l9-5.5v-7Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 12v9M3 8.5l9 3.5 9-3.5" />
        </svg>
      );
    case "Employee":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="9" cy="8" r="3.5" />
          <path strokeLinecap="round" d="M3.5 19a5.5 5.5 0 0 1 11 0" />
        </svg>
      );
    case "Orders":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" d="M7 4h10l1 16H6L7 4Z" />
          <path strokeLinecap="round" d="M9 9h6M9 13h6" />
        </svg>
      );
    case "Invoices":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" d="M6 3h9l3 3v15H6V3Z" />
          <path strokeLinecap="round" d="M9 10h6M9 14h4" />
        </svg>
      );
    case "Audit Log":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" d="M6 3h9l3 3v15H6V3Z" />
          <path strokeLinecap="round" d="M9 8h6M9 12h6M9 16h4" />
        </svg>
      );
    case "Setting":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="3" />
          <path strokeLinecap="round" d="M12 3v2M12 19v2M3 12h2M19 12h2" />
        </svg>
      );
    default:
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" d="M4 7h16M4 12h10M4 17h14" />
        </svg>
      );
  }
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminSidebar({
  fullName,
  username,
  role,
  permissions,
  organization,
  organizations,
  enabledPageKeys,
  onLogout,
  onSwitchOrganization,
  onChangePassword,
}: {
  fullName: string;
  username: string;
  role: string;
  permissions: PagePermissionItem[];
  organization?: OrganizationSummary | null;
  organizations?: OrganizationSummary[];
  enabledPageKeys?: string[];
  onLogout: () => void;
  onSwitchOrganization?: (id: string) => void;
  onChangePassword?: () => void;
}) {
  const pathname = usePathname();
  const displayName = fullName || username;
  const admin = isAdmin(role);
  const visibleItems = navItems.filter((item) =>
    canViewPage(permissions, item.pageKey, admin, enabledPageKeys),
  );

  return (
    <aside className="flex h-full w-[248px] shrink-0 flex-col px-4 py-5 text-white lg:w-[260px]">
      <div className="flex items-center gap-3 px-2 pb-6 pt-1">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#2DD4A8]/15 ring-1 ring-[#2DD4A8]/35">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#2DD4A8]" fill="none" stroke="currentColor" strokeWidth="1.9">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h10M4 17h14" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 10l4 2-4 2" />
          </svg>
        </span>
        <div>
          <p className="text-[15px] font-bold tracking-tight">OrderCraft</p>
          <p className="text-[11px] font-medium text-white/45">Admin Console</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto pr-1">
        {visibleItems.map((item) => {
          const active = isActive(pathname, item.href, "exact" in item ? item.exact : false);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[13.5px] font-medium transition ${
                active
                  ? "bg-white/12 text-white"
                  : "text-white/55 hover:bg-white/[0.06] hover:text-white/90"
              }`}
            >
              <span className={active ? "text-[#2DD4A8]" : "text-white/45"}>
                <NavIcon label={item.label} />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {organization ? (
        <div className="mb-3 px-2">
          <p className="mb-1 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/40">
            Organization
          </p>
          {(organizations?.length ?? 0) > 1 ? (
            <select
              value={organization.id}
              onChange={(event) => onSwitchOrganization?.(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white outline-none"
            >
              {(organizations ?? [organization]).map((org) => (
                <option key={org.id} value={org.id} className="text-[#051A2D]">
                  {org.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white">
              {organization.name}
            </p>
          )}
        </div>
      ) : null}

      <div className="mt-4 border-t border-white/10 pt-4">
        <div className="flex items-center gap-3 rounded-2xl px-2 py-2">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2DD4A8] text-sm font-bold text-[#051A2D]">
            {initials(displayName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{displayName}</p>
            <p className="truncate text-[11px] font-medium text-white/45">{role || "Admin"}</p>
          </div>
        </div>
        {onChangePassword ? (
          <button
            type="button"
            onClick={onChangePassword}
            className="mt-2 w-full rounded-2xl px-3 py-2 text-left text-[12.5px] font-semibold text-white/50 transition hover:bg-white/[0.06] hover:text-white"
          >
            Change password
          </button>
        ) : null}
        <button
          type="button"
          onClick={onLogout}
          className="mt-2 w-full rounded-2xl px-3 py-2 text-left text-[12.5px] font-semibold text-white/50 transition hover:bg-white/[0.06] hover:text-white"
        >
          Log out
        </button>
      </div>
    </aside>
  );
}
