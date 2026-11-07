"use client";

import { useCallback, useEffect, useState } from "react";
import AssignDepartmentEmployeesDialog from "@/components/admin/AssignDepartmentEmployeesDialog";
import DepartmentEditorDialog from "@/components/admin/DepartmentEditorDialog";
import ReassignDepartmentDialog from "@/components/admin/ReassignDepartmentDialog";
import { ApiError } from "@/lib/api";
import {
  deleteOrganizationDepartment,
  listOrganizationDepartments,
  updateOrganizationDepartment,
  type OrganizationDepartment,
} from "@/lib/org-catalog";
import { listPermissionCatalog, type PageCatalogItem } from "@/lib/permissions";

export default function OrgCatalogManager({
  onMembersChanged,
}: {
  onMembersChanged?: () => void;
}) {
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [catalog, setCatalog] = useState<PageCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<OrganizationDepartment | null>(null);
  const [reassigning, setReassigning] = useState<{
    department: OrganizationDepartment;
    intent: "deactivate" | "remove";
  } | null>(null);
  const [assigning, setAssigning] = useState<OrganizationDepartment | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [departmentRows, pages] = await Promise.all([
        listOrganizationDepartments(true),
        listPermissionCatalog(),
      ]);
      setDepartments(Array.isArray(departmentRows) ? departmentRows : []);
      setCatalog(Array.isArray(pages) ? pages : []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load departments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setEditorOpen(true);
  }

  function openEdit(department: OrganizationDepartment) {
    setEditing(department);
    setEditorOpen(true);
  }

  async function deactivateDepartment(department: OrganizationDepartment) {
    setBusy(true);
    setError(null);
    try {
      await updateOrganizationDepartment(department.id, {
        name: department.name,
        isActive: false,
        permissions: department.permissions ?? [],
      });
      setNotice(`Deactivated ${department.name}.`);
      await load();
      onMembersChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update department.");
    } finally {
      setBusy(false);
    }
  }

  async function onToggle(department: OrganizationDepartment) {
    if (department.isActive && department.memberCount > 0) {
      setError(null);
      setReassigning({ department, intent: "deactivate" });
      return;
    }
    if (!department.isActive) {
      setBusy(true);
      setError(null);
      try {
        await updateOrganizationDepartment(department.id, {
          name: department.name,
          isActive: true,
          permissions: department.permissions ?? [],
        });
        setNotice(`Reactivated ${department.name}.`);
        await load();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not update department.");
      } finally {
        setBusy(false);
      }
      return;
    }
    await deactivateDepartment(department);
  }

  async function removeDepartment(department: OrganizationDepartment) {
    setBusy(true);
    setError(null);
    try {
      await deleteOrganizationDepartment(department.id);
      setNotice(`Removed department ${department.name}.`);
      await load();
      onMembersChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove department.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(department: OrganizationDepartment) {
    if (department.memberCount > 0) {
      setError(null);
      setReassigning({ department, intent: "remove" });
      return;
    }
    if (!window.confirm(`Remove the ${department.name} department?`)) {
      return;
    }
    await removeDepartment(department);
  }

  return (
    <div className="mb-8 space-y-5">
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
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

      <section className="rounded-[24px] border border-black/[0.04] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#0B1220]">Departments</h2>
            <p className="mt-1 text-sm font-medium text-[#8B95A5]">
              Each department has default page access. New employees in that department receive
              those permissions automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-full bg-[#051A2D] px-4 py-2 text-sm font-bold text-white hover:bg-[#0a3050]"
          >
            Add department
          </button>
        </div>

        <ul className="mt-4 divide-y divide-black/[0.04]">
          {loading ? (
            <li className="py-6 text-sm font-medium text-[#8B95A5]">Loading departments…</li>
          ) : departments.length === 0 ? (
            <li className="py-6 text-sm font-medium text-[#8B95A5]">No departments yet.</li>
          ) : (
            departments.map((department) => (
              <li key={department.id} className="flex items-start justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold text-[#0B1220]">
                    {department.name}
                    {!department.isActive ? (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">
                        Inactive
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-[#8B95A5]">
                    {department.memberCount}{" "}
                    {department.memberCount === 1 ? "employee" : "employees"}
                    {" · "}
                    {(department.permissions ?? []).filter((p) => p.accessLevel !== "Hidden").length}{" "}
                    pages visible by default
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(department)}
                    className="rounded-full px-3 py-1.5 text-xs font-bold text-[#051A2D] hover:bg-[#051A2D]/[0.06]"
                  >
                    Pages
                  </button>
                  {department.isActive ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setAssigning(department)}
                      className="rounded-full px-3 py-1.5 text-xs font-bold text-[#051A2D] hover:bg-[#051A2D]/[0.06]"
                    >
                      Add employee
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onToggle(department)}
                    className="rounded-full px-3 py-1.5 text-xs font-bold text-[#051A2D] hover:bg-[#051A2D]/[0.06]"
                  >
                    {department.isActive ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onDelete(department)}
                    className="rounded-full px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>

      {editorOpen ? (
        <DepartmentEditorDialog
          catalog={catalog}
          department={editing}
          onClose={() => {
            setEditorOpen(false);
            setEditing(null);
          }}
          onSaved={async (saved) => {
            setEditorOpen(false);
            setEditing(null);
            setNotice(
              editing ? `Saved department ${saved.name}.` : `Added department ${saved.name}.`,
            );
            await load();
          }}
        />
      ) : null}

      {assigning ? (
        <AssignDepartmentEmployeesDialog
          department={assigning}
          onClose={() => setAssigning(null)}
          onSaved={async () => {
            const name = assigning.name;
            setAssigning(null);
            setNotice(`Added employees to ${name}.`);
            await load();
            onMembersChanged?.();
          }}
        />
      ) : null}

      {reassigning ? (
        <ReassignDepartmentDialog
          department={reassigning.department}
          departments={departments}
          intent={reassigning.intent}
          onClose={() => setReassigning(null)}
          onDone={async () => {
            const current = reassigning;
            setReassigning(null);
            if (current.intent === "remove") {
              await removeDepartment(current.department);
            } else {
              await deactivateDepartment(current.department);
            }
          }}
        />
      ) : null}
    </div>
  );
}
