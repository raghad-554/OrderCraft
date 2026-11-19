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

export type OrganizationPaymentTerms = "Net30" | "Net60" | "Immediate";

export type OrganizationSettings = {
  name: string;
  slug: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  logoUrl?: string | null;
  defaultCurrency: string;
  defaultTaxRate: number;
  defaultPaymentTerms: OrganizationPaymentTerms;
  approvalThreshold: number;
};

export type UpdateOrganizationSettingsPayload = {
  name: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  logoUrl?: string | null;
  defaultCurrency: string;
  defaultTaxRate: number;
  defaultPaymentTerms: OrganizationPaymentTerms;
  approvalThreshold: number;
};

export const ORGANIZATION_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "SAR",
  "AED",
  "JOD",
  "EGP",
  "KWD",
  "QAR",
  "BHD",
] as const;

export function getOrganizationSettings() {
  return apiFetch<OrganizationSettings>("/api/Organizations/settings");
}

export function updateOrganizationSettings(payload: UpdateOrganizationSettingsPayload) {
  return apiFetch<OrganizationSettings>("/api/Organizations/settings", {
    method: "PUT",
    body: JSON.stringify(payload),
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

export type InvitationStatus = "Pending" | "Accepted" | "Revoked" | "Expired";

export type OrganizationInvitation = {
  id: string;
  email: string;
  departmentId: string;
  departmentName: string;
  isOrgAdmin: boolean;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
  invitedByUserId: string;
  acceptToken?: string | null;
};

export function listInvitations() {
  return apiFetch<OrganizationInvitation[]>("/api/Organizations/invitations");
}

export function createInvitation(
  email: string,
  departmentId: string,
  isOrgAdmin = false,
) {
  return apiFetch<OrganizationInvitation>("/api/Organizations/invitations", {
    method: "POST",
    body: JSON.stringify({ email, departmentId, isOrgAdmin }),
  });
}

export function revokeInvitation(invitationId: string) {
  return apiFetch<void>(`/api/Organizations/invitations/${invitationId}/revoke`, {
    method: "POST",
  });
}

export function acceptInvitation(payload: {
  token: string;
  username?: string;
  fullName?: string;
  password?: string;
}) {
  return apiFetch<Employee>("/api/Organizations/invitations/accept", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function inviteAcceptPath(token: string) {
  return `/invite?token=${encodeURIComponent(token)}`;
}
