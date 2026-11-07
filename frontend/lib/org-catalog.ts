import { apiFetch } from "@/lib/api";
import type { UserRole } from "@/lib/employees";
import type { PagePermissionItem } from "@/lib/permissions";

export type OrganizationRole = {
  id: string;
  key: string;
  name: string;
  template: UserRole;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
  memberCount: number;
};

export type OrganizationDepartment = {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  memberCount: number;
  permissions: PagePermissionItem[];
};

export type UpsertOrganizationDepartmentPayload = {
  name: string;
  isActive: boolean;
  permissions: PagePermissionItem[];
};

export function listOrganizationRoles(includeInactive = false) {
  const qs = includeInactive ? "?includeInactive=true" : "";
  return apiFetch<OrganizationRole[]>(`/api/org-catalog/roles${qs}`);
}

export function listOrganizationDepartments(includeInactive = false) {
  const qs = includeInactive ? "?includeInactive=true" : "";
  return apiFetch<OrganizationDepartment[]>(`/api/org-catalog/departments${qs}`);
}

export function createOrganizationDepartment(payload: UpsertOrganizationDepartmentPayload) {
  return apiFetch<OrganizationDepartment>("/api/org-catalog/departments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateOrganizationDepartment(
  id: string,
  payload: UpsertOrganizationDepartmentPayload,
) {
  return apiFetch<OrganizationDepartment>(`/api/org-catalog/departments/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteOrganizationDepartment(id: string) {
  return apiFetch<void>(`/api/org-catalog/departments/${id}`, { method: "DELETE" });
}
