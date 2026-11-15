import type { PagePermissionItem } from "@/lib/permissions";
import type { OrganizationSummary } from "@/lib/organizations";

export type AuthUser = {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: string;
  department?: string | null;
};

export type AuthSession = {
  token: string;
  expiresAt?: string;
  user: AuthUser;
  permissions: PagePermissionItem[];
  organization?: OrganizationSummary | null;
  organizations?: OrganizationSummary[];
  isPlatformAdmin?: boolean;
  enabledPageKeys?: string[];
};

function readToken(): string | null {
  if (typeof window === "undefined") return null;
  return (
    sessionStorage.getItem("ordercraft_token") ||
    localStorage.getItem("ordercraft_token")
  );
}

function readUserRaw(): string | null {
  if (typeof window === "undefined") return null;
  if (sessionStorage.getItem("ordercraft_token")) {
    return sessionStorage.getItem("ordercraft_user");
  }
  if (localStorage.getItem("ordercraft_token")) {
    return localStorage.getItem("ordercraft_user");
  }
  return (
    sessionStorage.getItem("ordercraft_user") ||
    localStorage.getItem("ordercraft_user")
  );
}

function isExpired(expiresAt?: string) {
  if (!expiresAt) return false;
  const ms = DateParseSafe(expiresAt);
  return ms != null && ms <= Date.now();
}

function DateParseSafe(value: string) {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function normalizePermissions(raw: unknown): PagePermissionItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const row = item as Record<string, unknown>;
      const pageKey = String(row.pageKey ?? row.PageKey ?? "");
      const accessLevel = String(row.accessLevel ?? row.AccessLevel ?? "Hidden");
      if (!pageKey) return null;
      if (accessLevel !== "Hidden" && accessLevel !== "View" && accessLevel !== "Edit") {
        return null;
      }
      return { pageKey, accessLevel } as PagePermissionItem;
    })
    .filter((x): x is PagePermissionItem => x != null);
}

export function getAuthToken(): string | null {
  const token = readToken();
  if (!token || token === "undefined" || token === "null") return null;
  return token;
}

export function getSession(): AuthSession | null {
  if (typeof window === "undefined") return null;

  const token = getAuthToken();
  const raw = readUserRaw();
  if (!token || !raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const user = parsed.user ?? parsed;
    if (!user?.username) return null;

    const expiresAt = parsed.expiresAt ?? parsed.ExpiresAt;
    if (isExpired(expiresAt)) {
      clearSession();
      return null;
    }

    const orgRaw = (parsed.organization ?? parsed.Organization) as Record<string, unknown> | undefined;
    const readKeys = (raw: unknown): string[] =>
      Array.isArray(raw) ? raw.map((item) => String(item)) : [];
    const org = orgRaw
      ? {
          id: String(orgRaw.id ?? orgRaw.Id ?? ""),
          name: String(orgRaw.name ?? orgRaw.Name ?? ""),
          slug: String(orgRaw.slug ?? orgRaw.Slug ?? ""),
          membershipId: String(orgRaw.membershipId ?? orgRaw.MembershipId ?? ""),
          role: String(orgRaw.role ?? orgRaw.Role ?? user.role ?? ""),
          status: String(orgRaw.status ?? orgRaw.Status ?? "Active"),
          enabledPageKeys: readKeys(orgRaw.enabledPageKeys ?? orgRaw.EnabledPageKeys),
        }
      : null;
    const orgsRaw = parsed.organizations ?? parsed.Organizations;
    const orgs = Array.isArray(orgsRaw)
      ? orgsRaw.map((item: Record<string, unknown>) => ({
          id: String(item.id ?? item.Id ?? ""),
          name: String(item.name ?? item.Name ?? ""),
          slug: String(item.slug ?? item.Slug ?? ""),
          membershipId: String(item.membershipId ?? item.MembershipId ?? ""),
          role: String(item.role ?? item.Role ?? ""),
          status: String(item.status ?? item.Status ?? "Active"),
          enabledPageKeys: readKeys(item.enabledPageKeys ?? item.EnabledPageKeys),
        }))
      : [];
    const isPlatformAdmin = Boolean(
      parsed.isPlatformAdmin ?? parsed.IsPlatformAdmin,
    );
    const enabledPageKeys = readKeys(
      parsed.enabledPageKeys ?? parsed.EnabledPageKeys ?? org?.enabledPageKeys,
    );

    return {
      token,
      expiresAt,
      user: {
        id: String(user.id ?? user.Id ?? ""),
        username: String(user.username ?? ""),
        fullName: String(user.fullName ?? user.username ?? ""),
        email: String(user.email ?? ""),
        role: String(user.role ?? org?.role ?? ""),
        department: String(
          user.department ?? user.Department ?? "",
        ) || null,
      },
      permissions: normalizePermissions(parsed.permissions ?? parsed.Permissions),
      organization: org as OrganizationSummary | null,
      organizations: orgs as OrganizationSummary[],
      isPlatformAdmin,
      enabledPageKeys,
    };
  } catch {
    return null;
  }
}

export function saveSession(
  data: {
    token?: string;
    Token?: string;
    expiresAt?: string;
    user?: Record<string, unknown>;
    permissions?: unknown;
    Permissions?: unknown;
    organization?: unknown;
    organizations?: unknown;
    isPlatformAdmin?: boolean;
    enabledPageKeys?: string[];
  },
  remember: boolean,
) {
  const token = data.token ?? data.Token;
  if (!token) throw new Error("Login response missing token");

  const storage = remember ? localStorage : sessionStorage;
  sessionStorage.removeItem("ordercraft_token");
  sessionStorage.removeItem("ordercraft_user");
  localStorage.removeItem("ordercraft_token");
  localStorage.removeItem("ordercraft_user");

  storage.setItem("ordercraft_token", token);
  storage.setItem(
    "ordercraft_user",
    JSON.stringify({
      ...data,
      permissions: normalizePermissions(data.permissions ?? data.Permissions),
    }),
  );
}

export function updateSessionPermissions(permissions: PagePermissionItem[]) {
  if (typeof window === "undefined") return;
  const raw =
    sessionStorage.getItem("ordercraft_user") ||
    localStorage.getItem("ordercraft_user");
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    const next = { ...parsed, permissions };
    if (sessionStorage.getItem("ordercraft_user")) {
      sessionStorage.setItem("ordercraft_user", JSON.stringify(next));
    } else {
      localStorage.setItem("ordercraft_user", JSON.stringify(next));
    }
  } catch {
    /* ignore */
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem("ordercraft_token");
  sessionStorage.removeItem("ordercraft_user");
  localStorage.removeItem("ordercraft_token");
  localStorage.removeItem("ordercraft_user");
}

/** Revoke the current JWT on the server, then clear local session storage. */
export async function logoutSession() {
  const token = getAuthToken();
  if (token) {
    try {
      const apiBase =
        process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
        "http://localhost:5069";
      await fetch(`${apiBase}/api/Auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Still clear local session even if the network call fails.
    }
  }
  clearSession();
}

export function isAdmin(role: string) {
  return role.toLowerCase() === "admin";
}

export function isFinance(role: string) {
  return role.toLowerCase() === "finance";
}

export function isProcurement(role: string) {
  return role.toLowerCase() === "procurementmanager";
}

/** Org admin / Finance can see full financial field-change audit on orders. */
export function canViewOrderFinancialHistory(role: string) {
  return isAdmin(role) || isFinance(role);
}

export function applyOrganizationSession(
  data: {
    token: string;
    expiresAt: string;
    organization: OrganizationSummary;
    permissions: PagePermissionItem[];
    user: AuthUser | Record<string, unknown>;
    enabledPageKeys?: string[];
    organizations?: OrganizationSummary[];
  },
  remember?: boolean,
) {
  const current = getSession();
  const useRemember =
    remember ??
    (typeof window !== "undefined" && !!localStorage.getItem("ordercraft_token"));
  const orgs = data.organizations?.length
    ? data.organizations
    : current?.organizations?.length
      ? current.organizations.map((item) =>
          item.id === data.organization.id ? data.organization : item,
        )
      : [data.organization];
  if (!orgs.some((item) => item.id === data.organization.id)) {
    orgs.push(data.organization);
  }
  saveSession(
    {
      token: data.token,
      expiresAt: data.expiresAt,
      user: data.user,
      permissions: data.permissions,
      organization: data.organization,
      organizations: orgs,
      enabledPageKeys: data.enabledPageKeys ?? data.organization.enabledPageKeys ?? [],
      isPlatformAdmin: false,
    },
    useRemember,
  );
}

export function hasConsoleAccess(session: AuthSession | null) {
  return session != null;
}

export function isPlatformAdminSession(session: AuthSession | null) {
  return session?.isPlatformAdmin === true;
}
