"use client";

import { FormEvent, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  createOrganizationDepartment,
  updateOrganizationDepartment,
  type OrganizationDepartment,
} from "@/lib/org-catalog";
import {
  ACCESS_LEVELS,
  accessLabel,
  type PageAccessLevel,
  type PageCatalogItem,
  type PagePermissionItem,
} from "@/lib/permissions";

const fieldClass =
  "w-full rounded-2xl border border-black/[0.06] bg-[#d4dee9] px-3.5 py-2.5 text-sm font-medium text-[#0B1220] outline-none focus:bg-[#e4ebf2] focus:ring-2 focus:ring-[#051A2D]/30";

function draftFrom(
  catalog: PageCatalogItem[],
  existing?: PagePermissionItem[],
): PagePermissionItem[] {
  return catalog.map((page) => ({
    pageKey: page.key,
    accessLevel:
      existing?.find((item) => item.pageKey.toLowerCase() === page.key.toLowerCase())
        ?.accessLevel ?? "Hidden",
  }));
}

export default function DepartmentEditorDialog({
  catalog,
  department,
  onClose,
  onSaved,
}: {
  catalog: PageCatalogItem[];
  department: OrganizationDepartment | null;
  onClose: () => void;
  onSaved: (saved: OrganizationDepartment) => void;
}) {
  const [name, setName] = useState(department?.name ?? "");
  const [draft, setDraft] = useState<PagePermissionItem[]>(() =>
    draftFrom(catalog, department?.permissions),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(department?.name ?? "");
    setDraft(draftFrom(catalog, department?.permissions));
  }, [catalog, department]);

  function setLevel(pageKey: string, accessLevel: PageAccessLevel) {
    setDraft((prev) => {
      const next = prev.filter((item) => item.pageKey !== pageKey);
      next.push({ pageKey, accessLevel });
      return next;
    });
  }

  function levelFor(pageKey: string): PageAccessLevel {
    return draft.find((item) => item.pageKey === pageKey)?.accessLevel ?? "Hidden";
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Department name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: trimmed,
        isActive: department?.isActive ?? true,
        permissions: draft,
      };
      const saved = department
        ? await updateOrganizationDepartment(department.id, payload)
        : await createOrganizationDepartment(payload);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save department.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close department dialog"
        className="absolute inset-0 bg-[#051A2D]/55"
        onClick={() => {
          if (!saving) onClose();
        }}
      />
      <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] bg-[#e4ebf2] p-6 shadow-2xl sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-[#0B1220]">
              {department ? "Edit department" : "Add department"}
            </h2>
            <p className="mt-1 text-sm font-semibold text-[#5B6577]">
              People in this department get these page permissions by default. You can still
              change access for one person later.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full px-3 py-1 text-sm font-bold text-[#5B6577] hover:bg-[#d4dee9] disabled:opacity-50"
          >
            Close
          </button>
        </div>

        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#5B6577]">
              Department name *
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldClass}
              placeholder="Warehouse"
            />
          </label>

          <div className="space-y-3">
            {catalog.map((page) => {
              const level = levelFor(page.key);
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
                  </div>
                </div>
              );
            })}
          </div>

          {error ? (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
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
              {saving ? "Saving…" : department ? "Save department" : "Add department"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
