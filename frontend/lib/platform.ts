import { apiFetch } from "@/lib/api";

export type PlatformPage = {
  key: string;
  label: string;
  description: string;
};

export type PlatformOrganization = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  contactEmail?: string | null;
  contactPhone?: string | null;
  enabledPageKeys: string[];
  createdAt: string;
  memberCount: number;
};

export type CreatePlatformOrganizationInput = {
  name: string;
  slug?: string;
  contactEmail?: string;
  contactPhone?: string;
  enabledPageKeys: string[];
  adminUsername: string;
  adminFullName: string;
  adminEmail: string;
  adminPassword: string;
  adminPhone?: string;
};

export type UpdatePlatformOrganizationInput = {
  name: string;
  contactEmail?: string;
  contactPhone?: string;
  isActive: boolean;
  enabledPageKeys: string[];
};

export function listPlatformPages() {
  return apiFetch<PlatformPage[]>("/api/platform/pages");
}

export function listPlatformOrganizations() {
  return apiFetch<PlatformOrganization[]>("/api/platform/organizations");
}

export function createPlatformOrganization(input: CreatePlatformOrganizationInput) {
  return apiFetch<PlatformOrganization>("/api/platform/organizations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updatePlatformOrganization(
  id: string,
  input: UpdatePlatformOrganizationInput,
) {
  return apiFetch<PlatformOrganization>(`/api/platform/organizations/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
