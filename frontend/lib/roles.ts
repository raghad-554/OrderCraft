import type { PageAccessLevel, PagePermissionItem } from "@/lib/permissions";
import type { UserRole } from "@/lib/employees";

/** Role starter templates for the admin permission editor. */
export function defaultPermissionsForRole(role: UserRole): PagePermissionItem[] {
  const all = (
    level: PageAccessLevel,
  ): PagePermissionItem[] => [
    { pageKey: "dashboard", accessLevel: level },
    { pageKey: "companies", accessLevel: level },
    { pageKey: "employees", accessLevel: level },
    { pageKey: "roles", accessLevel: level },
    { pageKey: "purchaseOrders", accessLevel: level },
    { pageKey: "invoices", accessLevel: level },
    { pageKey: "auditLog", accessLevel: level },
    { pageKey: "settings", accessLevel: level },
  ];

  if (role === "Admin") return all("Edit");

  if (role === "ProcurementManager") {
    return [
      { pageKey: "dashboard", accessLevel: "View" },
      { pageKey: "companies", accessLevel: "Edit" },
      { pageKey: "employees", accessLevel: "Hidden" },
      { pageKey: "roles", accessLevel: "Hidden" },
      { pageKey: "purchaseOrders", accessLevel: "Edit" },
      { pageKey: "invoices", accessLevel: "View" },
      { pageKey: "auditLog", accessLevel: "Hidden" },
      { pageKey: "settings", accessLevel: "Hidden" },
    ];
  }

  return [
    { pageKey: "dashboard", accessLevel: "View" },
    { pageKey: "companies", accessLevel: "View" },
    { pageKey: "employees", accessLevel: "Hidden" },
    { pageKey: "roles", accessLevel: "Hidden" },
    { pageKey: "purchaseOrders", accessLevel: "View" },
    { pageKey: "invoices", accessLevel: "Edit" },
    { pageKey: "auditLog", accessLevel: "Hidden" },
    { pageKey: "settings", accessLevel: "Hidden" },
  ];
}
