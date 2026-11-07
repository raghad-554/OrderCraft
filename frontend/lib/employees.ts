import { apiFetch } from "@/lib/api";

export type UserRole = "Admin" | "ProcurementManager" | "Finance";

export type Employee = {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: UserRole;
  roleId?: string | null;
  roleName?: string | null;
  roleKey?: string | null;
  isSystemRole?: boolean;
  phoneNumber: string;
  department?: string | null;
  departmentId?: string | null;
  companyId?: string | null;
  companyName?: string | null;
  isActive: boolean;
  membershipId?: string | null;
  membershipStatus?: string | null;
  lastLoginAt?: string | null;
  createdAt: string;
};

export type EmployeePayload = {
  username: string;
  fullName: string;
  email: string;
  password?: string;
  departmentId: string;
  isOrgAdmin?: boolean;
  phoneNumber: string;
  companyId?: string | null;
  isActive: boolean;
};

export function roleLabel(role: UserRole | string) {
  if (role === "ProcurementManager") return "Procurement Manager";
  return role;
}

export function employeeRoleLabel(employee: Pick<Employee, "role" | "roleName">) {
  return employee.roleName?.trim() || roleLabel(employee.role);
}

export function isSystemAdminEmployee(employee: Pick<Employee, "role" | "roleKey" | "isSystemRole">) {
  return (
    employee.isSystemRole === true ||
    employee.role === "Admin" ||
    (employee.roleKey ?? "").toLowerCase() === "admin"
  );
}

export function employeeUpdatePayload(employee: Employee, departmentId: string): EmployeePayload {
  return {
    username: employee.username,
    fullName: employee.fullName,
    email: employee.email,
    phoneNumber: employee.phoneNumber ?? "",
    departmentId,
    isOrgAdmin: isSystemAdminEmployee(employee),
    companyId: employee.companyId ?? null,
    isActive: employee.isActive,
  };
}

export function listEmployees(name?: string) {
  const qs = name?.trim() ? `?name=${encodeURIComponent(name.trim())}` : "";
  return apiFetch<Employee[]>(`/api/Users${qs}`);
}

export function createEmployee(payload: EmployeePayload) {
  return apiFetch<Employee>("/api/Users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateEmployee(id: string, payload: EmployeePayload) {
  return apiFetch<Employee>(`/api/Users/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deactivateEmployee(id: string) {
  return apiFetch<void>(`/api/Users/${id}/deactivate`, { method: "POST" });
}

export function activateEmployee(id: string) {
  return apiFetch<void>(`/api/Users/${id}/activate`, { method: "POST" });
}

export function changeOwnPassword(currentPassword: string, newPassword: string) {
  return apiFetch<void>("/api/Auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export function resetEmployeePassword(id: string, newPassword: string) {
  return apiFetch<{ userId: string }>(`/api/Users/${id}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ newPassword }),
  });
}

export function deleteEmployee(id: string) {
  return apiFetch<void>(`/api/Users/${id}`, { method: "DELETE" });
}

export function formatLastLogin(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
