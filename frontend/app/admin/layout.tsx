"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import ChangePasswordDialog from "@/components/admin/ChangePasswordDialog";
import OrganizationChooser from "@/components/admin/OrganizationChooser";
import SwitchOrganizationDialog from "@/components/admin/SwitchOrganizationDialog";
import {
  applyOrganizationSession,
  logoutSession,
  getSession,
  isAdmin,
  isPlatformAdminSession,
  updateSessionPermissions,
  type AuthSession,
} from "@/lib/auth";
import {
  getOrganizationSettings,
  listMyOrganizations,
  switchOrganization,
} from "@/lib/organizations";
import { setOrgCurrency } from "@/lib/money";
import { ApiError } from "@/lib/api";
import {
  canViewPage,
  firstAllowedPath,
  getMyPermissions,
  pageKeyForPath,
  type PageCatalogItem,
} from "@/lib/permissions";

const FALLBACK_CATALOG: PageCatalogItem[] = [
  { key: "dashboard", label: "Dashboard", description: "", path: "/admin" },
  { key: "companies", label: "Companies", description: "", path: "/admin/companies" },
  { key: "products", label: "Products", description: "", path: "/admin/products" },
  { key: "employees", label: "Employees", description: "", path: "/admin/employees" },
  { key: "roles", label: "Roles", description: "", path: "/admin/employees/roles" },
  {
    key: "purchaseOrders",
    label: "Orders",
    description: "",
    path: "/admin/purchase-orders",
  },
  { key: "invoices", label: "Invoices", description: "", path: "/admin/invoices" },
  { key: "auditLog", label: "Audit log", description: "", path: "/admin/audit-log" },
  { key: "settings", label: "Settings", description: "", path: "/admin/settings" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [pendingOrgId, setPendingOrgId] = useState<string | null>(null);
  const [switchSaving, setSwitchSaving] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const current = getSession();
      if (!current) {
        router.replace("/login");
        return;
      }
      if (isPlatformAdminSession(current)) {
        router.replace("/platform");
        return;
      }

      try {
        if (current.organization?.id) {
          const mine = await getMyPermissions();
          updateSessionPermissions(mine.permissions);
          try {
            const settings = await getOrganizationSettings();
            setOrgCurrency(settings.defaultCurrency);
          } catch {
            // Keep cached currency if settings are unavailable.
          }
        }
        const refreshed = getSession();
        if (!refreshed) {
          router.replace("/login");
          return;
        }
        if (!cancelled) {
          setSession(refreshed);
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          setSession(current);
          setReady(true);
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!session?.organization?.id) return;
    const admin = isAdmin(session.user.role);
    const pageKey = pageKeyForPath(pathname);
    if (!pageKey) return;
    if (!canViewPage(session.permissions, pageKey, admin, session.enabledPageKeys)) {
      const fallback = firstAllowedPath(
        session.permissions,
        FALLBACK_CATALOG,
        admin,
        session.enabledPageKeys,
      );
      if (fallback !== pathname) router.replace(fallback);
    }
  }, [pathname, session, router]);

  function logout() {
    void logoutSession().then(() => router.replace("/login"));
  }

  if (!ready || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#051A2D] text-sm font-medium text-white/80">
        Loading admin panel...
      </div>
    );
  }

  if (!session.organization?.id) {
    if ((session.organizations?.length ?? 0) > 0) {
      return (
        <OrganizationChooser
          fullName={session.user.fullName || session.user.username}
          organizations={session.organizations ?? []}
          onLogout={logout}
        />
      );
    }
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#051A2D] text-sm font-medium text-white/80">
        <p>This account is not assigned to an organization.</p>
        <button
          type="button"
          onClick={logout}
          className="rounded-full bg-[#e4ebf2] px-4 py-2 text-xs font-bold text-[#051A2D]"
        >
          Log out
        </button>
      </div>
    );
  }

  async function confirmSwitch(password: string) {
    if (!pendingOrgId) return;
    setSwitchSaving(true);
    setSwitchError(null);
    try {
      const switched = await switchOrganization(pendingOrgId, password);
      const mine = await listMyOrganizations().catch(() => null);
      applyOrganizationSession({
        token: switched.token,
        expiresAt: switched.expiresAt,
        organization: switched.organization,
        permissions: switched.permissions,
        user: switched.user,
        enabledPageKeys: switched.enabledPageKeys,
        organizations: mine ?? undefined,
      });
      window.location.assign("/admin");
    } catch (err) {
      setSwitchError(err instanceof ApiError ? err.message : "Could not open that organization.");
      setSwitchSaving(false);
    }
  }

  const pendingOrgName =
    session.organizations?.find((org) => org.id === pendingOrgId)?.name ?? "organization";

  return (
    <div className="min-h-screen bg-[#051A2D] p-2 sm:p-3 lg:p-4">
      <div className="flex h-[calc(100vh-1rem)] min-h-[640px] gap-0 overflow-hidden sm:h-[calc(100vh-1.5rem)] lg:h-[calc(100vh-2rem)]">
        <div className="hidden md:flex">
          <AdminSidebar
            fullName={session.user.fullName}
            username={session.user.username}
            role={session.user.role}
            permissions={session.permissions}
            organization={session.organization}
            organizations={session.organizations}
            enabledPageKeys={session.enabledPageKeys}
            onLogout={logout}
            onSwitchOrganization={(id) => {
              setSwitchError(null);
              setPendingOrgId(id);
            }}
            onChangePassword={() => setChangePasswordOpen(true)}
          />
        </div>

        {mobileNavOpen ? (
          <div className="fixed inset-0 z-40 md:hidden">
            <button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0 bg-black/50"
              onClick={() => setMobileNavOpen(false)}
            />
            <div className="relative z-10 h-full w-[280px] bg-[#051A2D] shadow-2xl">
              <AdminSidebar
                fullName={session.user.fullName}
                username={session.user.username}
                role={session.user.role}
                permissions={session.permissions}
                organization={session.organization}
                organizations={session.organizations}
                enabledPageKeys={session.enabledPageKeys}
                onLogout={logout}
                onSwitchOrganization={(id) => {
                  setMobileNavOpen(false);
                  setSwitchError(null);
                  setPendingOrgId(id);
                }}
                onChangePassword={() => {
                  setMobileNavOpen(false);
                  setChangePasswordOpen(true);
                }}
              />
            </div>
          </div>
        ) : null}

        <main className="admin-main-sheet relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-[28px] bg-[#c5d2e0] sm:rounded-[32px]">
          <div className="flex items-center gap-3 border-b border-black/[0.04] px-4 py-3 md:hidden">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#051A2D] text-white"
              aria-label="Open menu"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <p className="text-sm font-bold text-[#051A2D]">OrderCraft</p>
          </div>

          <div className="flex-1 overflow-auto px-5 py-6 sm:px-7 lg:px-9 lg:py-8">
            {children}
          </div>
        </main>
      </div>
      <ChangePasswordDialog
        open={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />
      {pendingOrgId ? (
        <SwitchOrganizationDialog
          organizationName={pendingOrgName}
          saving={switchSaving}
          error={switchError}
          onCancel={() => {
            if (switchSaving) return;
            setPendingOrgId(null);
            setSwitchError(null);
          }}
          onConfirm={(password) => void confirmSwitch(password)}
        />
      ) : null}
    </div>
  );
}
