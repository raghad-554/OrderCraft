import type { PagePermissionItem } from "@/lib/permissions";
import type { OrganizationSummary } from "@/lib/organizations";
import { API_BASE } from "@/lib/api";

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

const USER_KEY = "ordercraft_user";
const REMEMBER_KEY = "ordercraft_remember";
const LEGACY_TOKEN_KEYS = ["ordercraft_token"] as const;

/** True when the user logged in with Remember me (persists across browser restarts). */
export function getRememberPreference(): boolean {
  if (typeof window === "undefined") return false;
  return (
    localStorage.getItem(REMEMBER_KEY) === "1" ||
    sessionStorage.getItem(REMEMBER_KEY) === "1"
  );
}

/** Remove any JWT leftovers from browser storage (HttpOnly cookie is the auth source). */
export function purgeAuthTokensFromStorage() {
  if (typeof window === "undefined") return;
  for (const key of LEGACY_TOKEN_KEYS) {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  }
}

function readUserRaw(): string | null {
  if (typeof window === "undefined") return null;
  return (
    sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY)
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

/** @deprecated JWT lives in HttpOnly cookie; kept for call-site compatibility. */
export function getAuthToken(): string | null {
  purgeAuthTokensFromStorage();
  return null;
}

export function getSession(): AuthSession | null {
  if (typeof window === "undefined") return null;

  purgeAuthTokensFromStorage();

  const raw = readUserRaw();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    // Drop any historically persisted token fields from the user blob.
    if (parsed && typeof parsed === "object") {
      delete parsed.token;
      delete parsed.Token;
    }

    const user = parsed.user ?? parsed;
    if (!user?.username) return null;

    const expiresAt = parsed.expiresAt ?? parsed.ExpiresAt;
    if (isExpired(expiresAt)) {
      clearSession();
      return null;
    }

    const orgRaw = (parsed.organization ?? parsed.Organization) as Record<string, unknown> | undefined;
    const readKeys = (rawKeys: unknown): string[] =>
      Array.isArray(rawKeys) ? rawKeys.map((item) => String(item)) : [];
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
      token: "",
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
  const user = data.user ?? (data as { User?: Record<string, unknown> }).User;
  if (!user) throw new Error("Login response missing user");

  const storage = remember ? localStorage : sessionStorage;
  purgeAuthTokensFromStorage();
  sessionStorage.removeItem(USER_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(REMEMBER_KEY);
  localStorage.removeItem(REMEMBER_KEY);

  const { token: _t, Token: _T, ...rest } = data as Record<string, unknown>;
  storage.setItem(
    USER_KEY,
    JSON.stringify({
      ...rest,
      permissions: normalizePermissions(data.permissions ?? data.Permissions),
    }),
  );
  storage.setItem(REMEMBER_KEY, remember ? "1" : "0");
}

export function updateSessionPermissions(permissions: PagePermissionItem[]) {
  if (typeof window === "undefined") return;
  purgeAuthTokensFromStorage();
  const raw =
    sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    delete parsed.token;
    delete parsed.Token;
    const next = { ...parsed, permissions };
    if (sessionStorage.getItem(USER_KEY)) {
      sessionStorage.setItem(USER_KEY, JSON.stringify(next));
    } else {
      localStorage.setItem(USER_KEY, JSON.stringify(next));
    }
  } catch {
    /* ignore */
  }
}

/** Patch the current org name (and list entry) after Settings save. */
export function updateSessionOrganizationName(name: string) {
  if (typeof window === "undefined") return;
  purgeAuthTokensFromStorage();
  const inSession = !!sessionStorage.getItem(USER_KEY);
  const raw =
    sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    delete parsed.token;
    delete parsed.Token;
    const organization = parsed.organization
      ? { ...parsed.organization, name }
      : parsed.organization;
    const organizations = Array.isArray(parsed.organizations)
      ? parsed.organizations.map((item: OrganizationSummary) =>
          item?.id && organization?.id && item.id === organization.id
            ? { ...item, name }
            : item,
        )
      : parsed.organizations;
    const next = { ...parsed, organization, organizations };
    const storage = inSession ? sessionStorage : localStorage;
    storage.setItem(USER_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  purgeAuthTokensFromStorage();
  sessionStorage.removeItem(USER_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(REMEMBER_KEY);
  localStorage.removeItem(REMEMBER_KEY);
}

/** Revoke the current JWT on the server (cookie), then clear local UI session storage. */
export async function logoutSession() {
  try {
    await fetch(`${API_BASE}/api/Auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // Still clear local session even if the network call fails.
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
    token?: string;
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
  const useRemember = remember ?? getRememberPreference();
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
