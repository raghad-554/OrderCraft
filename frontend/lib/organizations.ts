import { apiFetch } from "@/lib/api";
import type { Employee, UserRole } from "@/lib/employees";
import type { PagePermissionItem } from "@/lib/permissions";

export type MembershipStatus = "Active" | "Suspended" | "Revoked";

export type OrganizationSummary = {
  id: string;
  name: string;
  slug: string;
  membershipId: string;
  role: UserRole;
  status: MembershipStatus;
  enabledPageKeys?: string[];
};

export type SwitchOrganizationResult = {
  token: string;
  expiresAt: string;
  organization: OrganizationSummary;
  permissions: PagePermissionItem[];
  user: {
    id: string;
    username: string;
    fullName: string;
    email: string;
    role: string;
  };
  enabledPageKeys: string[];
};

export type OrganizationSettings = {
  approvalThreshold: number;
};

export function getOrganizationSettings() {
  return apiFetch<OrganizationSettings>("/api/Organizations/settings");
}

export function updateOrganizationSettings(approvalThreshold: number) {
  return apiFetch<OrganizationSettings>("/api/Organizations/settings", {
    method: "PUT",
    body: JSON.stringify({ approvalThreshold }),
  });
}

export function listMyOrganizations() {
  return apiFetch<OrganizationSummary[]>("/api/Organizations/mine");
}

export function switchOrganization(id: string, password: string) {
  return apiFetch<SwitchOrganizationResult>(`/api/Organizations/${id}/switch`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export function addExistingMember(
  usernameOrEmail: string,
  departmentId: string,
  isOrgAdmin = false,
) {
  return apiFetch<Employee>("/api/Organizations/members", {
    method: "POST",
    body: JSON.stringify({ usernameOrEmail, departmentId, isOrgAdmin }),
  });
}
