"use client";

import Link from "next/link";
import {
  FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import ScrollSelect from "@/components/ui/ScrollSelect";
import { ApiError } from "@/lib/api";
import { getSession, isAdmin } from "@/lib/auth";
import { listCompanies, type Company } from "@/lib/companies";
import {
  addExistingMember,
  createInvitation,
  inviteAcceptPath,
  listInvitations,
  revokeInvitation,
  type OrganizationInvitation,
} from "@/lib/organizations";
import DepartmentEditorDialog from "@/components/admin/DepartmentEditorDialog";
import {
  type Employee,
  type EmployeePayload,
  activateEmployee,
  createEmployee,
  deactivateEmployee,
  deleteEmployee,
  formatLastLogin,
  isSystemAdminEmployee,
  listEmployees,
  resetEmployeePassword,
  updateEmployee,
} from "@/lib/employees";
import {
  listOrganizationDepartments,
  type OrganizationDepartment,
} from "@/lib/org-catalog";
import {
  canEditPage,
  canViewPage,
  listPermissionCatalog,
  type PageCatalogItem,
} from "@/lib/permissions";

const fieldClass =
  "w-full rounded-2xl border border-black/[0.06] bg-[#d4dee9] px-3.5 py-2.5 text-sm font-medium text-[#0B1220] outline-none focus:bg-[#e4ebf2] focus:ring-2 focus:ring-[#051A2D]/30";

const PAGE_SIZE = 8;

type FormState = {
  username: string;
  fullName: string;
  email: string;
  password: string;
  phoneNumber: string;
  departmentId: string;
  isOrgAdmin: boolean;
  companyId: string;
  isActive: boolean;
};

function asList<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function defaultDepartmentId(departments?: OrganizationDepartment[] | null) {
  return asList(departments).find((department) => department.isActive)?.id ?? "";
}

function emptyForm(departments: OrganizationDepartment[]): FormState {
  return {
    username: "",
    fullName: "",
    email: "",
    password: "",
    phoneNumber: "",
    departmentId: defaultDepartmentId(departments),
    isOrgAdmin: false,
    companyId: "",
    isActive: true,
  };
}

function fromEmployee(employee: Employee): FormState {
  return {
    username: employee.username,
    fullName: employee.fullName,
    email: employee.email,
    password: "",
    phoneNumber: employee.phoneNumber,
    departmentId: employee.departmentId ?? "",
    isOrgAdmin: isSystemAdminEmployee(employee),
    companyId: employee.companyId ?? "",
    isActive: employee.isActive,
  };
}

function toPayload(form: FormState, includePassword: boolean): EmployeePayload {
  return {
    username: form.username.trim(),
    fullName: form.fullName.trim(),
    email: form.email.trim(),
    password: includePassword ? form.password : form.password.trim() || undefined,
    phoneNumber: form.phoneNumber.trim(),
    departmentId: form.departmentId,
    isOrgAdmin: form.isOrgAdmin,
    companyId: form.companyId || null,
    isActive: form.isActive,
  };
}

function validateForm(form: FormState, isCreate: boolean): string | null {
  if (!form.username.trim()) return "Username is required.";
  if (!form.fullName.trim()) return "Full name is required.";
  const parts = form.fullName.trim().split(/\s+/);
  if (parts.length !== 4) return "Full name must have exactly 4 parts.";
  if (!form.email.trim()) return "Email is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    return "Enter a valid email address.";
  }
  if (!form.phoneNumber.trim()) return "Phone number is required.";
  if (isCreate && form.password.trim().length < 6) {
    return "Password must be at least 6 characters.";
  }
  if (!form.departmentId) return "Department is required.";
  return null;
}

export default function EmployeeDirectory() {
  const session = getSession();
  const callerIsAdmin = isAdmin(session?.user.role ?? "");
  const canEdit = canEditPage(
    session?.permissions,
    "employees",
    callerIsAdmin,
  );
  const canViewAudit = canViewPage(
    session?.permissions,
    "auditLog",
    callerIsAdmin,
    session?.enabledPageKeys,
  );
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [pageCatalog, setPageCatalog] = useState<PageCatalogItem[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm([]));
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resetInfo, setResetInfo] = useState<string | null>(null);
  const [existingIdentifier, setExistingIdentifier] = useState("");
  const [existingDepartmentId, setExistingDepartmentId] = useState("");
  const [departmentEditorOpen, setDepartmentEditorOpen] = useState(false);
  const [existingBusy, setExistingBusy] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDepartmentId, setInviteDepartmentId] = useState("");
  const [inviteIsAdmin, setInviteIsAdmin] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<Employee | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSaving, setResetSaving] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, companyRows, departmentRows, pages, inviteRows] = await Promise.all([
        listEmployees(debouncedSearch || undefined),
        listCompanies(),
        listOrganizationDepartments(true),
        listPermissionCatalog(),
        canEdit ? listInvitations() : Promise.resolve([]),
      ]);
      setEmployees(asList(rows));
      setCompanies(asList(companyRows));
      setDepartments(asList(departmentRows));
      setPageCatalog(asList(pages));
      setInvitations(asList(inviteRows));
      setExistingDepartmentId((current) => current || defaultDepartmentId(departmentRows));
      setInviteDepartmentId((current) => current || defaultDepartmentId(departmentRows));
      setPage(1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load employees.");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, canEdit]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingInvites = useMemo(
    () => invitations.filter((row) => row.status === "Pending"),
    [invitations],
  );

  const pageCount = Math.max(1, Math.ceil(employees.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return employees.slice(start, start + PAGE_SIZE);
  }, [employees, currentPage]);

  function openCreate() {
    if (!canEdit) return;
    setEditing(null);
    setForm(emptyForm(departments));
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(employee: Employee) {
    if (!canEdit) return;
    setEditing(employee);
    setForm(fromEmployee(employee));
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setEditing(null);
    setFormError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    const isCreate = !editing;
    const validation = validateForm(form, isCreate);
    if (validation) {
      setFormError(validation);
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = toPayload(form, isCreate);
      if (editing) {
        await updateEmployee(editing.id, payload);
      } else {
        await createEmployee(payload);
      }
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not save employee.");
    } finally {
      setSaving(false);
    }
  }

  async function onAddExisting(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    const identifier = existingIdentifier.trim();
    if (!identifier) {
      setError("Enter the username or email used in the other organization.");
      return;
    }
    setExistingBusy(true);
    setError(null);
    try {
      await addExistingMember(identifier, existingDepartmentId);
      setExistingIdentifier("");
      setResetInfo(
        "That person was added to this organization. They keep their current password. Other organizations were not changed.",
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add that person to this organization.");
    } finally {
      setExistingBusy(false);
    }
  }

  async function onInvite(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    const email = inviteEmail.trim();
    if (!email || !inviteDepartmentId) {
      setError("Enter an email and department for the invitation.");
      return;
    }
    setInviteBusy(true);
    setError(null);
    setLastInviteLink(null);
    try {
      const created = await createInvitation(email, inviteDepartmentId, inviteIsAdmin);
      setInviteEmail("");
      setInviteIsAdmin(false);
      if (created.acceptToken) {
        const path = inviteAcceptPath(created.acceptToken);
        const absolute =
          typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
        setLastInviteLink(absolute);
        try {
          await navigator.clipboard.writeText(absolute);
        } catch {
          /* ignore clipboard failures */
        }
      }
      setResetInfo(
        created.acceptToken
          ? "Invitation created. Share the link below (also copied when clipboard allows)."
          : "Invitation created.",
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create invitation.");
    } finally {
      setInviteBusy(false);
    }
  }

  async function onRevokeInvite(invitation: OrganizationInvitation) {
    if (!canEdit) return;
    if (!window.confirm(`Revoke invitation for ${invitation.email}?`)) return;
    setError(null);
    try {
      await revokeInvitation(invitation.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not revoke invitation.");
    }
  }

  async function onDeactivate(employee: Employee) {
    if (!canEdit) return;
    const nextActive = !employee.isActive;
    const label = nextActive ? "activate" : "deactivate";
    if (!window.confirm(`${label[0].toUpperCase()}${label.slice(1)} ${employee.fullName}?`)) {
      return;
    }

    setBusyId(employee.id);
    setError(null);
    try {
      if (nextActive) await activateEmployee(employee.id);
      else await deactivateEmployee(employee.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not ${label} employee.`);
    } finally {
      setBusyId(null);
    }
  }

  function openReset(employee: Employee) {
    if (!canEdit) return;
    setResetTarget(employee);
    setResetPassword("");
    setResetConfirm("");
    setResetError(null);
  }

  function closeReset() {
    if (resetSaving) return;
    setResetTarget(null);
    setResetPassword("");
    setResetConfirm("");
    setResetError(null);
  }

  async function onReset(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || !resetTarget) return;
    if (resetPassword.trim().length < 6) {
      setResetError("Password must be at least 6 characters.");
      return;
    }
    if (resetPassword !== resetConfirm) {
      setResetError("Passwords do not match.");
      return;
    }

    setResetSaving(true);
    setResetError(null);
    setError(null);
    try {
      await resetEmployeePassword(resetTarget.id, resetPassword);
      setResetInfo(
        `Password updated for ${resetTarget.fullName} in this organization only. They must use it to open this organization. Other organizations keep their own passwords.`,
      );
      setResetTarget(null);
      setResetPassword("");
      setResetConfirm("");
    } catch (err) {
      setResetError(err instanceof ApiError ? err.message : "Could not reset password.");
    } finally {
      setResetSaving(false);
    }
  }

  async function onDelete(employee: Employee) {
    if (!canEdit) return;
    if (!window.confirm(`Delete ${employee.fullName}? This removes them from the employee list.`)) {
      return;
    }

    setBusyId(employee.id);
    setError(null);
    try {
      await deleteEmployee(employee.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete employee.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="animate-rise">
      <AdminPageHeader
        title="Employees"
        description="Create new accounts, or add someone who already works in another organization. Each organization has its own password, and data is not shared."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {canViewPage(session?.permissions, "roles", isAdmin(session?.user.role ?? "")) ? (
              <Link
                href="/admin/employees/roles"
                className="rounded-full bg-[#e4ebf2] px-5 py-2.5 text-sm font-bold text-[#051A2D] ring-1 ring-black/[0.08] transition hover:bg-[#d4dee9]"
              >
                Roles &amp; Permissions
              </Link>
            ) : null}
            {canEdit ? (
              <button
                type="button"
                onClick={openCreate}
                className="rounded-full bg-[#051A2D] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#0a3050]"
              >
                Add employee
              </button>
            ) : null}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Search employees</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, username, or email…"
            className="w-full rounded-2xl border border-black/[0.06] bg-[#e4ebf2] px-4 py-2.5 text-sm font-medium text-[#0B1220] outline-none ring-[#051A2D]/30 placeholder:text-[#5B6577] focus:ring-2"
          />
        </label>
        <p className="text-sm font-semibold text-[#5B6577]">
          {loading
            ? "Loading…"
            : `${employees.length} ${employees.length === 1 ? "employee" : "employees"}${canEdit ? "" : " · view only"}`}
        </p>
      </div>

      {canEdit ? (
        <div className="mb-4 space-y-3">
          <form
            onSubmit={(e) => void onAddExisting(e)}
            className="flex flex-wrap items-end gap-2 rounded-[24px] border border-black/[0.04] bg-[#e4ebf2] p-4"
          >
            <label className="min-w-[220px] flex-1">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#5B6577]">
                Add existing member
              </span>
              <input
                value={existingIdentifier}
                onChange={(e) => setExistingIdentifier(e.target.value)}
                placeholder="Username or email from the other organization"
                className={fieldClass}
              />
            </label>
            <label className="min-w-[180px]">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#5B6577]">
                Department
              </span>
              <ScrollSelect
                value={existingDepartmentId}
                placeholder="Select department"
                options={departments
                  .filter((department) => department.isActive)
                  .map((department) => ({
                    value: department.id,
                    label: department.name,
                  }))}
                onChange={setExistingDepartmentId}
                className={fieldClass}
              />
            </label>
            <button
              type="submit"
              disabled={existingBusy || !existingIdentifier.trim() || !existingDepartmentId}
              className="rounded-full bg-[#051A2D] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {existingBusy ? "Adding…" : "Add to this organization"}
            </button>
          </form>

          <form
            onSubmit={(e) => void onInvite(e)}
            className="flex flex-wrap items-end gap-2 rounded-[24px] border border-black/[0.04] bg-[#e4ebf2] p-4"
          >
            <label className="min-w-[220px] flex-1">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#5B6577]">
                Invite by email
              </span>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="name@company.com"
                className={fieldClass}
              />
            </label>
            <label className="min-w-[180px]">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#5B6577]">
                Department
              </span>
              <ScrollSelect
                value={inviteDepartmentId}
                placeholder="Select department"
                options={departments
                  .filter((department) => department.isActive)
                  .map((department) => ({
                    value: department.id,
                    label: department.name,
                  }))}
                onChange={setInviteDepartmentId}
                className={fieldClass}
              />
            </label>
            <label className="flex items-center gap-2 pb-2.5 text-sm font-medium text-[#4B5563]">
              <input
                type="checkbox"
                checked={inviteIsAdmin}
                onChange={(e) => setInviteIsAdmin(e.target.checked)}
                className="h-4 w-4 rounded border-black/20"
              />
              Org admin
            </label>
            <button
              type="submit"
              disabled={inviteBusy || !inviteEmail.trim() || !inviteDepartmentId}
              className="rounded-full border border-[#051A2D] bg-[#e4ebf2] px-5 py-2.5 text-sm font-bold text-[#051A2D] disabled:opacity-50"
            >
              {inviteBusy ? "Inviting…" : "Send invite"}
            </button>
          </form>

          {lastInviteLink ? (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <p className="font-semibold">Invite link</p>
              <p className="mt-1 break-all font-mono text-xs">{lastInviteLink}</p>
            </div>
          ) : null}

          {pendingInvites.length > 0 ? (
            <div className="overflow-hidden rounded-[24px] border border-black/[0.04] bg-[#e4ebf2]">
              <div className="border-b border-black/[0.04] px-4 py-3 text-xs font-bold uppercase tracking-wide text-[#5B6577]">
                Pending invitations
              </div>
              <ul className="divide-y divide-black/[0.04]">
                {pendingInvites.map((invite) => (
                  <li
                    key={invite.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-[#0B1220]">{invite.email}</p>
                      <p className="text-[#5B6577]">
                        {invite.departmentName}
                        {invite.isOrgAdmin ? " · Admin" : ""} · expires{" "}
                        {new Date(invite.expiresAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void onRevokeInvite(invite)}
                      className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50"
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}

      {resetInfo ? (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          <p>{resetInfo}</p>
          <button
            type="button"
            onClick={() => setResetInfo(null)}
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
                <th className="px-5 py-3.5">Name</th>
                <th className="px-5 py-3.5">Email</th>
                <th className="px-5 py-3.5">Department</th>
                <th className="px-5 py-3.5">Company</th>
                <th className="px-5 py-3.5">Last login</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-[#5B6577]">
                    Loading employees…
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-[#5B6577]">
                    No employees found.
                  </td>
                </tr>
              ) : (
                pageRows.map((employee) => {
                  const busy = busyId === employee.id;
                  return (
                    <tr
                      key={employee.id}
                      className="border-t border-black/[0.04] transition hover:bg-[#d4dee9]"
                    >
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-[#0B1220]">{employee.fullName}</p>
                        <p className="mt-0.5 text-xs font-semibold text-[#5B6577]">
                          @{employee.username}
                          {!employee.isActive ? (
                            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                              Inactive
                            </span>
                          ) : null}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 text-[#4B5563]">{employee.email}</td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex rounded-full bg-[#051A2D]/[0.06] px-2.5 py-1 text-xs font-bold text-[#051A2D]">
                          {employee.department || "—"}
                        </span>
                        {isSystemAdminEmployee(employee) ? (
                          <span className="ml-2 inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-bold uppercase text-sky-700">
                            Admin
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3.5 text-[#4B5563]">
                        {employee.companyName || "—"}
                      </td>
                      <td className="px-5 py-3.5 text-[#4B5563]">
                        {formatLastLogin(employee.lastLoginAt)}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {canViewAudit ? (
                          <Link
                            href={`/admin/audit-log?employeeId=${employee.id}`}
                            className="rounded-full px-3 py-1.5 text-xs font-bold text-[#051A2D] hover:bg-[#051A2D]/[0.06]"
                          >
                            Monitor
                          </Link>
                          ) : null}
                          {canEdit ? (
                            <>
                              <ActionButton disabled={busy} onClick={() => openEdit(employee)}>
                                Edit
                              </ActionButton>
                              <ActionButton
                                disabled={busy}
                                onClick={() => void onDeactivate(employee)}
                              >
                                {employee.isActive ? "Deactivate" : "Activate"}
                              </ActionButton>
                              <ActionButton disabled={busy} onClick={() => openReset(employee)}>
                                Reset
                              </ActionButton>
                              <ActionButton
                                danger
                                disabled={busy}
                                onClick={() => void onDelete(employee)}
                              >
                                Delete
                              </ActionButton>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {employees.length > PAGE_SIZE ? (
          <div className="flex items-center justify-between gap-3 border-t border-black/[0.04] px-5 py-3">
            <p className="text-xs font-semibold text-[#5B6577]">
              Page {currentPage} of {pageCount}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-full bg-[#d4dee9] px-3 py-1.5 text-xs font-bold text-[#051A2D] disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={currentPage >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                className="rounded-full bg-[#d4dee9] px-3 py-1.5 text-xs font-bold text-[#051A2D] disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 bg-[#051A2D]/55"
            onClick={closeModal}
          />
          <div className="relative z-10 max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[28px] bg-[#e4ebf2] p-6 shadow-2xl sm:p-7">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-[#0B1220]">
                  {editing ? "Edit employee" : "Add employee"}
                </h2>
                <p className="mt-1 text-sm font-semibold text-[#5B6577]">
                  {editing
                    ? "Update account details, department, and company."
                    : "Set username, email, and password. They sign in with these credentials."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full px-3 py-1 text-sm font-bold text-[#5B6577] hover:bg-[#d4dee9]"
              >
                Close
              </button>
            </div>

            <form noValidate autoComplete="off" onSubmit={(e) => void onSubmit(e)} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name *" className="sm:col-span-2">
                  <input
                    value={form.fullName}
                    onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                    className={fieldClass}
                    placeholder="First Second Third Family"
                  />
                </Field>
                <Field label="Username *">
                  <input
                    value={form.username}
                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                    className={fieldClass}
                    autoComplete="off"
                  />
                </Field>
                <Field label="Email *">
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className={fieldClass}
                    autoComplete="off"
                  />
                </Field>
                {editing ? null : (
                  <Field label="Password *">
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                      className={fieldClass}
                      autoComplete="off"
                      name="oc-employee-password"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      readOnly
                      onFocus={(e) => e.currentTarget.removeAttribute("readonly")}
                    />
                  </Field>
                )}
                <Field label="Phone *">
                  <input
                    value={form.phoneNumber}
                    onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                    className={fieldClass}
                  />
                </Field>
                <Field label="Department *" className="sm:col-span-2">
                  <div className="flex flex-wrap gap-2">
                    <div className="min-w-0 flex-1">
                      <ScrollSelect
                        value={form.departmentId}
                        placeholder="Select a department"
                        options={departments
                          .filter(
                            (department) =>
                              department.isActive || department.id === form.departmentId,
                          )
                          .map((department) => ({
                            value: department.id,
                            label: `${department.name}${department.isActive ? "" : " (inactive)"}`,
                          }))}
                        onChange={(departmentId) =>
                          setForm((f) => ({ ...f, departmentId }))
                        }
                        className={fieldClass}
                      />
                    </div>
                    {callerIsAdmin ? (
                      <button
                        type="button"
                        onClick={() => setDepartmentEditorOpen(true)}
                        className="shrink-0 rounded-2xl bg-[#051A2D] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#0a3050]"
                      >
                        Add department
                      </button>
                    ) : null}
                  </div>
                </Field>
                <Field label="Company" className="sm:col-span-2">
                  <ScrollSelect
                    value={form.companyId}
                    placeholder="No company"
                    options={companies.map((company) => ({
                      value: company.id,
                      label: company.name,
                    }))}
                    onChange={(companyId) => setForm((f) => ({ ...f, companyId }))}
                    className={fieldClass}
                  />
                </Field>
                {callerIsAdmin ? (
                  <label className="flex items-start gap-2 sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={form.isOrgAdmin}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, isOrgAdmin: e.target.checked }))
                      }
                      className="mt-0.5 h-4 w-4 rounded border-black/20"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-[#0B1220]">
                        Organization admin
                      </span>
                      <span className="block text-xs font-semibold text-[#5B6577]">
                        Full access to every page. Department defaults still apply to everyone else.
                      </span>
                    </span>
                  </label>
                ) : null}
                <label className="flex items-center gap-2 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                    className="h-4 w-4 rounded border-black/20"
                  />
                  <span className="text-sm font-semibold text-[#0B1220]">Active account</span>
                </label>
              </div>

              {formError ? (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                  {formError}
                </p>
              ) : null}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="rounded-full px-4 py-2.5 text-sm font-bold text-[#5B6577] hover:bg-[#d4dee9] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-full bg-[#051A2D] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0a3050] disabled:opacity-50"
                >
                  {saving ? "Saving…" : editing ? "Save changes" : "Create employee"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {resetTarget ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center">
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 bg-[#051A2D]/55"
            onClick={closeReset}
          />
          <div className="relative z-10 w-full max-w-md rounded-[28px] bg-[#e4ebf2] p-6 shadow-2xl sm:p-7">
            <h2 className="text-xl font-bold text-[#0B1220]">Set organization password</h2>
            <p className="mt-1 text-sm font-semibold text-[#5B6577]">
              {resetTarget.fullName} will use this password to open this organization. Other
              organizations keep their own passwords.
            </p>
            <form noValidate autoComplete="off" onSubmit={(e) => void onReset(e)} className="mt-5 space-y-4">
              {resetError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {resetError}
                </div>
              ) : null}
              <Field label="New password *">
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  className={fieldClass}
                  autoComplete="off"
                  name="oc-reset-password"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  readOnly
                  onFocus={(e) => e.currentTarget.removeAttribute("readonly")}
                />
              </Field>
              <Field label="Confirm password *">
                <input
                  type="password"
                  value={resetConfirm}
                  onChange={(e) => setResetConfirm(e.target.value)}
                  className={fieldClass}
                  autoComplete="off"
                  name="oc-reset-confirm"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  readOnly
                  onFocus={(e) => e.currentTarget.removeAttribute("readonly")}
                />
              </Field>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeReset}
                  disabled={resetSaving}
                  className="rounded-full px-4 py-2 text-sm font-bold text-[#5B6577] hover:bg-[#d4dee9]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetSaving}
                  className="rounded-full bg-[#051A2D] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  {resetSaving ? "Saving…" : "Save password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {departmentEditorOpen ? (
        <DepartmentEditorDialog
          catalog={pageCatalog}
          department={null}
          onClose={() => setDepartmentEditorOpen(false)}
          onSaved={(saved) => {
            setDepartments((prev) => {
              const next = prev.filter((item) => item.id !== saved.id);
              next.push(saved);
              return next.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
            });
            setForm((f) => ({ ...f, departmentId: saved.id }));
            setExistingDepartmentId(saved.id);
            setDepartmentEditorOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${
        danger
          ? "text-red-600 hover:bg-red-50"
          : "text-[#051A2D] hover:bg-[#051A2D]/[0.06]"
      }`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#5B6577]">
        {label}
      </span>
      {children}
    </label>
  );
}
