"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { ApiError } from "@/lib/api";
import { getSession, isAdmin } from "@/lib/auth";
import OrgCatalogManager from "@/components/admin/OrgCatalogManager";
import {
  type Employee,
  isSystemAdminEmployee,
  listEmployees,
} from "@/lib/employees";
import { listOrganizationDepartments, type OrganizationDepartment } from "@/lib/org-catalog";
import {
  ACCESS_LEVELS,
  accessLabel,
  canViewPage,
  getUserPermissions,
  listPermissionCatalog,
  type PageAccessLevel,
  type PageCatalogItem,
  type PagePermissionItem,
  type UserPermissions,
  updateUserPermissions,
} from "@/lib/permissions";
import { defaultPermissionsForRole } from "@/lib/roles";

function LevelBadge({ level }: { level: PageAccessLevel }) {
  const tone =
    level === "Edit"
      ? "bg-emerald-50 text-emerald-700"
      : level === "View"
        ? "bg-sky-50 text-sky-700"
        : "bg-slate-100 text-slate-600";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>
      {accessLabel(level)}
    </span>
  );
}

export default function RolesPermissionsPage() {
  const session = getSession();
  const callerIsAdmin = isAdmin(session?.user.role ?? "");
  const canViewAudit = canViewPage(
    session?.permissions,
    "auditLog",
    callerIsAdmin,
    session?.enabledPageKeys,
  );

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [catalog, setCatalog] = useState<PageCatalogItem[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [draft, setDraft] = useState<PagePermissionItem[]>([]);
  const [selectedMeta, setSelectedMeta] = useState<UserPermissions | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, pages, departmentRows] = await Promise.all([
        listEmployees(),
        listPermissionCatalog(),
        listOrganizationDepartments(true),
      ]);
      setEmployees(rows);
      setCatalog(pages);
      setDepartments(Array.isArray(departmentRows) ? departmentRows : []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load permissions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = term
      ? employees.filter(
          (e) =>
            e.fullName.toLowerCase().includes(term) ||
            e.email.toLowerCase().includes(term) ||
            (e.department ?? "").toLowerCase().includes(term),
        )
      : employees;
    return list.slice().sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [employees, search]);

  async function openEditor(employee: Employee) {
    if (!callerIsAdmin) {
      setError("Only admins can change page access for other users.");
      return;
    }

    setFormError(null);
    setNotice(null);
    setSelected(employee);
    try {
      const data = await getUserPermissions(employee.id);
      setSelectedMeta(data);
      setDraft(data.permissions);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not load user access.");
      setDraft(defaultPermissionsForRole(employee.role));
      setSelectedMeta(null);
    }
  }

  function closeEditor() {
    if (saving) return;
    setSelected(null);
    setSelectedMeta(null);
    setDraft([]);
    setFormError(null);
  }

  function setLevel(pageKey: string, accessLevel: PageAccessLevel) {
    setDraft((prev) => {
      const next = prev.filter((p) => p.pageKey !== pageKey);
      next.push({ pageKey, accessLevel });
      return next;
    });
  }

  function levelFor(pageKey: string): PageAccessLevel {
    return draft.find((p) => p.pageKey === pageKey)?.accessLevel ?? "Hidden";
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    setFormError(null);
    try {
      await updateUserPermissions(selected.id, draft);
      setNotice(`Saved page access for ${selected.fullName}.`);
      closeEditor();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not save access.");
    } finally {
      setSaving(false);
    }
  }

  if (!callerIsAdmin) {
    return (
      <div className="animate-rise">
        <Link
          href="/admin/employees"
          className="mb-4 inline-flex text-sm font-semibold text-[#051A2D] hover:underline"
        >
          ← Back to Employees
        </Link>
        <AdminPageHeader
          title="Roles & Permissions"
          description="Only admin accounts can assign page access."
        />
        <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-medium text-amber-800">
          Ask an admin to open this page and set which screens you can view or edit.
        </div>
      </div>
    );
  }

  return (
    <div className="animate-rise">
      <Link
        href="/admin/employees"
        className="mb-4 inline-flex text-sm font-semibold text-[#051A2D] hover:underline"
      >
        ← Back to Employees
      </Link>

      <AdminPageHeader
        title="Roles & Permissions"
        description="Define department default page access, then adjust access for each person if needed."
      />

      <OrgCatalogManager onMembersChanged={() => void load()} />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Search employees</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee…"
            className="w-full rounded-2xl border border-black/[0.06] bg-[#e4ebf2] px-4 py-2.5 text-sm font-medium text-[#0B1220] outline-none ring-[#051A2D]/30 placeholder:text-[#5B6577] focus:ring-2"
          />
        </label>
        <p className="text-sm font-semibold text-[#5B6577]">
          {loading
            ? "Loading…"
            : `${rows.length} ${rows.length === 1 ? "user" : "users"}`}
        </p>
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          <p>{notice}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 font-bold text-emerald-900 hover:underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[24px] border border-black/[0.04] bg-[#e4ebf2]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#e8eef4] text-xs font-semibold tracking-wide text-[#5B6577]">
              <tr>
                <th className="px-5 py-3.5">Employee</th>
                <th className="px-5 py-3.5">Department</th>
                <th className="px-5 py-3.5">Access summary</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-[#5B6577]">
                    Loading users…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-[#5B6577]">
                    No employees found.
                  </td>
                </tr>
              ) : (
                rows.map((employee) => (
                  <tr
                    key={employee.id}
                    className="border-t border-black/[0.04] transition hover:bg-[#d4dee9]"
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-[#0B1220]">{employee.fullName}</p>
                      <p className="mt-0.5 text-xs font-semibold text-[#5B6577]">
                        {employee.email}
                      </p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex rounded-full bg-[#051A2D]/[0.06] px-2.5 py-1 text-xs font-bold text-[#051A2D]">
                        {employee.department || "—"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[#4B5563]">
                      {isSystemAdminEmployee(employee)
                        ? "Full access to all pages"
                        : "Custom page access set by admin"}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {canViewAudit ? (
                        <Link
                          href={`/admin/audit-log?employeeId=${employee.id}`}
                          className="rounded-full px-3 py-1.5 text-xs font-bold text-[#051A2D] hover:bg-[#051A2D]/[0.06]"
                        >
                          Monitor
                        </Link>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void openEditor(employee)}
                          className="rounded-full px-3 py-1.5 text-xs font-bold text-[#051A2D] hover:bg-[#051A2D]/[0.06]"
                        >
                          {isSystemAdminEmployee(employee) ? "View access" : "Set pages"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 bg-[#051A2D]/55"
            onClick={closeEditor}
          />
          <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] bg-[#e4ebf2] p-6 shadow-2xl sm:p-7">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-[#0B1220]">Page access</h2>
                <p className="mt-1 text-sm font-semibold text-[#5B6577]">
                  {selected.fullName}
                  {selected.department ? ` · ${selected.department}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-full px-3 py-1 text-sm font-bold text-[#5B6577] hover:bg-[#d4dee9]"
              >
                Close
              </button>
            </div>

            {selectedMeta?.isAdmin || isSystemAdminEmployee(selected) ? (
              <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800">
                Admin accounts always have full edit access on every page.
              </div>
            ) : (
              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const department = departments.find(
                      (item) => item.id === selected.departmentId,
                    );
                    setDraft(
                      department?.permissions?.length
                        ? department.permissions
                        : defaultPermissionsForRole(selected.role),
                    );
                  }}
                  className="rounded-full bg-[#d4dee9] px-4 py-2 text-xs font-bold text-[#051A2D]"
                >
                  Apply department defaults
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDraft(catalog.map((p) => ({ pageKey: p.key, accessLevel: "Hidden" })))
                  }
                  className="rounded-full bg-[#d4dee9] px-4 py-2 text-xs font-bold text-[#051A2D]"
                >
                  Hide all pages
                </button>
              </div>
            )}

            <div className="space-y-3">
              {catalog.map((page) => {
                const level = levelFor(page.key);
                const locked = isSystemAdminEmployee(selected);
                return (
                  <div
                    key={page.key}
                    className="rounded-[20px] border border-black/[0.04] bg-[#e8eef4] px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[#0B1220]">{page.label}</p>
                        <p className="mt-0.5 text-xs font-semibold text-[#5B6577]">
                          {page.description}
                        </p>
                      </div>
                      {locked ? (
                        <LevelBadge level="Edit" />
                      ) : (
                        <div className="flex shrink-0 gap-1.5">
                          {ACCESS_LEVELS.map((option) => {
                            const active = level === option;
                            return (
                              <button
                                key={option}
                                type="button"
                                onClick={() => setLevel(page.key, option)}
                                className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                                  active
                                    ? "bg-[#051A2D] text-white"
                                    : "bg-[#e4ebf2] text-[#051A2D] ring-1 ring-black/[0.08]"
                                }`}
                              >
                                {accessLabel(option)}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {formError ? (
              <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {formError}
              </p>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeEditor}
                disabled={saving}
                className="rounded-full px-4 py-2.5 text-sm font-bold text-[#5B6577] hover:bg-[#d4dee9] disabled:opacity-50"
              >
                Cancel
              </button>
              {!isSystemAdminEmployee(selected) ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save()}
                  className="rounded-full bg-[#051A2D] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0a3050] disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save access"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
