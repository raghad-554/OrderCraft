import { apiFetch } from "@/lib/api";

export type AuditLog = {
  id: string;
  actorUserId?: string | null;
  actorName: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  summary?: string | null;
  requestId?: string | null;
  createdAt: string;
};

export const AUDIT_ACTIONS = [
  "Login",
  "Created",
  "Updated",
  "Deleted",
  "Activated",
  "Deactivated",
  "PasswordReset",
  "PermissionsUpdated",
  "StatusChanged",
] as const;

export function listAuditLogs(params: {
  entityType?: string;
  action?: string;
  search?: string;
  employeeId?: string;
} = {}) {
  const query = new URLSearchParams();
  if (params.entityType) query.set("entityType", params.entityType);
  if (params.action) query.set("action", params.action);
  if (params.search?.trim()) query.set("search", params.search.trim());
  if (params.employeeId) query.set("employeeId", params.employeeId);
  const qs = query.toString();
  return apiFetch<AuditLog[]>(`/api/AuditLogs${qs ? `?${qs}` : ""}`);
}

export function formatAuditWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function actionTone(action: string) {
  switch (action) {
    case "Created":
    case "Login":
    case "Activated":
      return "bg-emerald-50 text-emerald-700";
    case "Updated":
    case "StatusChanged":
    case "PermissionsUpdated":
    case "PasswordReset":
      return "bg-sky-50 text-sky-700";
    case "Deleted":
    case "Deactivated":
      return "bg-red-50 text-red-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export function actionLabel(action: string) {
  if (action === "PasswordReset") return "Password reset";
  if (action === "PermissionsUpdated") return "Permissions updated";
  if (action === "StatusChanged") return "Status changed";
  return action;
}
