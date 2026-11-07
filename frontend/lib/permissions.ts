import { apiFetch } from "@/lib/api";
import type { UserRole } from "@/lib/employees";

export type PageAccessLevel = "Hidden" | "View" | "Edit";

export type PageCatalogItem = {
  key: string;
  label: string;
  description: string;
  path: string;
};

export type PagePermissionItem = {
  pageKey: string;
  accessLevel: PageAccessLevel;
};

export type UserPermissions = {
  userId: string;
  fullName: string;
  email: string;
  role: UserRole;
  isAdmin: boolean;
  permissions: PagePermissionItem[];
};

export const ACCESS_LEVELS: PageAccessLevel[] = ["Hidden", "View", "Edit"];

export function listPermissionCatalog() {
  return apiFetch<PageCatalogItem[]>("/api/Permissions/catalog");
}

export function getMyPermissions() {
  return apiFetch<UserPermissions>("/api/Permissions/me");
}

export function getUserPermissions(userId: string) {
  return apiFetch<UserPermissions>(`/api/Permissions/users/${userId}`);
}

export function updateUserPermissions(userId: string, permissions: PagePermissionItem[]) {
  return apiFetch<UserPermissions>(`/api/Permissions/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify({ permissions }),
  });
}

export function accessForPage(
  permissions: PagePermissionItem[] | undefined,
  pageKey: string,
  isAdmin?: boolean,
): PageAccessLevel {
  if (isAdmin) return "Edit";
  const item = permissions?.find(
    (p) => p.pageKey.toLowerCase() === pageKey.toLowerCase(),
  );
  return item?.accessLevel ?? "Hidden";
}

export function isPageEnabled(enabledPageKeys: string[] | undefined, pageKey: string) {
  if (!enabledPageKeys || enabledPageKeys.length === 0) return true;
  return enabledPageKeys.some((key) => key.toLowerCase() === pageKey.toLowerCase());
}

export function canViewPage(
  permissions: PagePermissionItem[] | undefined,
  pageKey: string,
  isAdmin?: boolean,
  enabledPageKeys?: string[],
) {
  if (!isPageEnabled(enabledPageKeys, pageKey)) return false;
  const level = accessForPage(permissions, pageKey, isAdmin);
  return level === "View" || level === "Edit";
}

export function canEditPage(
  permissions: PagePermissionItem[] | undefined,
  pageKey: string,
  isAdmin?: boolean,
  enabledPageKeys?: string[],
) {
  if (!isPageEnabled(enabledPageKeys, pageKey)) return false;
  return accessForPage(permissions, pageKey, isAdmin) === "Edit";
}

export function firstAllowedPath(
  permissions: PagePermissionItem[] | undefined,
  catalog: PageCatalogItem[],
  isAdmin?: boolean,
  enabledPageKeys?: string[],
) {
  for (const page of catalog) {
    if (canViewPage(permissions, page.key, isAdmin, enabledPageKeys)) return page.path;
  }
  return "/login";
}

export function pageKeyForPath(pathname: string): string | null {
  if (pathname === "/admin" || pathname === "/admin/") return "dashboard";
  if (pathname.startsWith("/admin/employees/roles")) return "roles";
  if (pathname.startsWith("/admin/employees")) return "employees";
  if (pathname.startsWith("/admin/companies")) return "companies";
  if (pathname.startsWith("/admin/products")) return "products";
  if (pathname.startsWith("/admin/purchase-orders")) return "purchaseOrders";
  if (pathname.startsWith("/admin/invoices")) return "invoices";
  if (pathname.startsWith("/admin/audit-log")) return "auditLog";
  if (pathname.startsWith("/admin/settings")) return "settings";
  if (pathname.startsWith("/admin/feature-registry")) return "featureRegistry";
  return null;
}

export function accessLabel(level: PageAccessLevel) {
  if (level === "Hidden") return "Hidden";
  if (level === "View") return "View only";
  return "Can edit";
}
