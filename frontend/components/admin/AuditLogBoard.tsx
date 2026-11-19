"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import ScrollSelect from "@/components/ui/ScrollSelect";
import { ApiError } from "@/lib/api";
import {
  type AuditLog,
  AUDIT_ACTIONS,
  actionLabel,
  actionTone,
  formatAuditWhen,
  listAuditLogs,
} from "@/lib/audit";
import { listEmployees, roleLabel, type Employee } from "@/lib/employees";

export default function AuditLogBoard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const employeeFromUrl = searchParams.get("employeeId")?.trim() || "All";

  const [rows, setRows] = useState<AuditLog[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState(employeeFromUrl);
  const [action, setAction] = useState("All");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEmployeeId(employeeFromUrl);
  }, [employeeFromUrl]);

  function selectEmployee(nextId: string) {
    setEmployeeId(nextId);
    const params = new URLSearchParams(searchParams.toString());
    if (nextId === "All") params.delete("employeeId");
    else params.set("employeeId", nextId);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const loadEmployees = useCallback(async () => {
    try {
      setEmployees(await listEmployees());
    } catch {
      setEmployees([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAuditLogs({
        employeeId: employeeId === "All" ? undefined : employeeId,
        action: action === "All" ? undefined : action,
      });
      setRows(data);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load audit log.",
      );
    } finally {
      setLoading(false);
    }
  }, [action, employeeId]);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === employeeId) ?? null,
    [employeeId, employees],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => {
      const haystack = [
        row.actorName,
        row.action,
        row.entityType,
        row.entityLabel,
        row.summary,
        row.requestId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [rows, search]);

  const totals = useMemo(() => {
    const logins = filtered.filter((r) => r.action === "Login").length;
    const accountChanges = filtered.filter((r) =>
      ["Created", "Updated", "Deleted", "Activated", "Deactivated", "PasswordReset", "PasswordChanged", "PermissionsUpdated"].includes(
        r.action,
      ),
    ).length;
    const workActions = filtered.length - logins - accountChanges;
    return {
      total: filtered.length,
      logins,
      accountChanges,
      workActions: Math.max(0, workActions),
    };
  }, [filtered]);

  return (
    <div className="animate-rise">
      <AdminPageHeader
        title="Audit Log"
        description="Monitor what each employee does in the system. Pick an employee to review their activity."
        action={
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full border border-black/[0.08] bg-[#e4ebf2] px-4 py-2.5 text-sm font-bold text-[#051A2D] hover:bg-[#d4dee9]"
          >
            Refresh
          </button>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Events" value={String(totals.total)} />
        <StatCard label="Logins" value={String(totals.logins)} />
        <StatCard label="Account changes" value={String(totals.accountChanges)} />
        <StatCard label="Work actions" value={String(totals.workActions)} />
      </div>

      {selectedEmployee ? (
        <div className="mb-4 rounded-[22px] border border-black/[0.04] bg-[#e4ebf2] px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#5B6577]">
            Tracking
          </p>
          <p className="mt-1 text-lg font-bold text-[#0B1220]">
            {selectedEmployee.fullName}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-[#5B6577]">
            {selectedEmployee.username} · {roleLabel(selectedEmployee.role)}
            {selectedEmployee.department ? ` · ${selectedEmployee.department}` : ""}
            {selectedEmployee.isActive ? "" : " · Inactive"}
          </p>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="min-w-[220px] flex-1">
          <span className="sr-only">Employee</span>
          <ScrollSelect
            value={employeeId === "All" ? "" : employeeId}
            placeholder="All employees"
            options={employees.map((employee) => ({
              value: employee.id,
              label: `${employee.fullName} (${employee.username})`,
            }))}
            onChange={(next) => selectEmployee(next || "All")}
            className="w-full rounded-2xl border border-black/[0.06] bg-[#e4ebf2] px-4 py-2.5 text-sm font-bold text-[#051A2D] outline-none focus:ring-2 focus:ring-[#051A2D]/30"
          />
        </label>
        <label className="min-w-[180px] shrink-0">
          <span className="sr-only">Action</span>
          <ScrollSelect
            value={action === "All" ? "" : action}
            placeholder="All actions"
            options={AUDIT_ACTIONS.map((item) => ({
              value: item,
              label: actionLabel(item),
            }))}
            onChange={(next) => setAction(next || "All")}
            className="rounded-2xl border border-black/[0.06] bg-[#e4ebf2] px-4 py-2.5 text-sm font-bold text-[#051A2D] outline-none focus:ring-2 focus:ring-[#051A2D]/30"
          />
        </label>
        <label className="relative min-w-[200px] flex-1">
          <span className="sr-only">Search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search summary, request id, or related item…"
            className="w-full rounded-2xl border border-black/[0.06] bg-[#e4ebf2] px-4 py-2.5 text-sm font-medium text-[#0B1220] outline-none ring-[#051A2D]/30 placeholder:text-[#5B6577] focus:ring-2"
          />
        </label>
        <p className="text-sm font-semibold text-[#5B6577]">
          {loading ? "Loading…" : `${filtered.length} events · view only`}
        </p>
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[24px] border border-black/[0.04] bg-[#e4ebf2]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#e8eef4] text-xs font-semibold tracking-wide text-[#5B6577]">
              <tr>
                <th className="px-5 py-3.5">When</th>
                <th className="px-5 py-3.5">Employee</th>
                <th className="px-5 py-3.5">Action</th>
                <th className="px-5 py-3.5">Related to</th>
                <th className="px-5 py-3.5">Details</th>
                <th className="px-5 py-3.5">Request ID</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-[#5B6577]">
                    Loading audit log…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-[#5B6577]">
                    {employeeId === "All"
                      ? "No activity yet. Sign in, edit an employee, or change permissions to start tracking."
                      : "No activity for this employee yet."}
                  </td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const aboutEmployee =
                    row.entityType === "Employee" || row.entityType === "User";
                  const related = aboutEmployee
                    ? row.entityLabel || "Employee account"
                    : `${row.entityType}${row.entityLabel ? `: ${row.entityLabel}` : ""}`;

                  return (
                    <tr
                      key={row.id}
                      className="border-t border-black/[0.04] transition hover:bg-[#d4dee9]"
                    >
                      <td className="whitespace-nowrap px-5 py-3.5 text-[#4B5563]">
                        {formatAuditWhen(row.createdAt)}
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-[#0B1220]">
                        {row.actorName}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${actionTone(row.action)}`}
                        >
                          {actionLabel(row.action)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-[#4B5563]">{related}</td>
                      <td className="max-w-md px-5 py-3.5 text-[#4B5563]">
                        {row.summary || "—"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <RequestIdChip requestId={row.requestId} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RequestIdChip({ requestId }: { requestId?: string | null }) {
  const [copied, setCopied] = useState(false);

  if (!requestId) {
    return <span className="text-[#5B6577]">—</span>;
  }

  const short =
    requestId.length > 10 ? `${requestId.slice(0, 8)}…` : requestId;

  async function copy() {
    try {
      await navigator.clipboard.writeText(requestId!);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard may be blocked; still allow selecting via title.
    }
  }

  return (
    <button
      type="button"
      title={copied ? "Copied" : `Copy request id\n${requestId}`}
      onClick={copy}
      className="inline-flex max-w-[9.5rem] items-center rounded-md border border-black/[0.06] bg-[#e8eef4] px-2 py-1 font-mono text-[11px] text-[#4B5563] transition hover:border-black/[0.12] hover:bg-[#e4ebf2]"
    >
      {copied ? "Copied" : short}
    </button>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-black/[0.04] bg-[#e4ebf2] px-5 py-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#5B6577]">{label}</p>
      <p className="mt-1 text-xl font-bold text-[#0B1220]">{value}</p>
    </div>
  );
}
