"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  employeeUpdatePayload,
  listEmployees,
  updateEmployee,
  type Employee,
} from "@/lib/employees";
import type { OrganizationDepartment } from "@/lib/org-catalog";

const MIN_QUERY = 2;
const MAX_RESULTS = 8;
const fieldClass =
  "w-full rounded-2xl border border-black/[0.06] bg-[#F3F5F7] px-3.5 py-2.5 text-sm font-medium text-[#0B1220] outline-none focus:bg-white focus:ring-2 focus:ring-[#051A2D]/30";

export default function AssignDepartmentEmployeesDialog({
  department,
  onClose,
  onSaved,
}: {
  department: OrganizationDepartment;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [matches, setMatches] = useState<Employee[]>([]);
  const [picked, setPicked] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (debouncedSearch.length < MIN_QUERY) {
      setMatches([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    void listEmployees(debouncedSearch)
      .then((rows) => {
        if (cancelled) return;
        setMatches(Array.isArray(rows) ? rows : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not search employees.");
        setMatches([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  const pickedIds = useMemo(() => new Set(picked.map((employee) => employee.id)), [picked]);

  const results = useMemo(
    () =>
      matches
        .filter(
          (employee) =>
            employee.departmentId !== department.id && !pickedIds.has(employee.id),
        )
        .slice(0, MAX_RESULTS),
    [department.id, matches, pickedIds],
  );

  function pick(employee: Employee) {
    setPicked((prev) => (prev.some((item) => item.id === employee.id) ? prev : [...prev, employee]));
    setSearch("");
    setDebouncedSearch("");
    setMatches([]);
    setError(null);
  }

  function removePicked(id: string) {
    setPicked((prev) => prev.filter((employee) => employee.id !== id));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (picked.length === 0) {
      setError("Search and choose at least one employee.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      for (const employee of picked) {
        await updateEmployee(employee.id, employeeUpdatePayload(employee, department.id));
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add employees.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close add employees dialog"
        className="absolute inset-0 bg-[#051A2D]/55"
        onClick={() => {
          if (!saving) onClose();
        }}
      />
      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-[#0B1220]">Add employees</h2>
            <p className="mt-1 text-sm font-medium text-[#8B95A5]">
              Search by name, username, or email, then add people to {department.name}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full px-3 py-1 text-sm font-bold text-[#8B95A5] hover:bg-[#F3F5F7] disabled:opacity-50"
          >
            Close
          </button>
        </div>

        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          {picked.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {picked.map((employee) => (
                <li
                  key={employee.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#051A2D]/[0.06] px-3 py-1.5 text-xs font-bold text-[#051A2D]"
                >
                  {employee.fullName}
                  <button
                    type="button"
                    onClick={() => removePicked(employee.id)}
                    disabled={saving}
                    className="text-[#8B95A5] hover:text-[#051A2D] disabled:opacity-50"
                    aria-label={`Remove ${employee.fullName}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#8B95A5]">
              Search
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Start typing a name or email…"
              className={fieldClass}
              disabled={saving}
              autoFocus
            />
          </label>

          {search.trim().length > 0 && search.trim().length < MIN_QUERY ? (
            <p className="text-sm font-medium text-[#8B95A5]">Type at least 2 characters.</p>
          ) : loading ? (
            <p className="text-sm font-medium text-[#8B95A5]">Searching…</p>
          ) : debouncedSearch.length >= MIN_QUERY && results.length === 0 ? (
            <p className="text-sm font-medium text-[#8B95A5]">No matching employees to add.</p>
          ) : results.length > 0 ? (
            <ul className="divide-y divide-black/[0.04] rounded-[20px] border border-black/[0.04]">
              {results.map((employee) => (
                <li key={employee.id}>
                  <button
                    type="button"
                    onClick={() => pick(employee)}
                    disabled={saving}
                    className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-[#F8FAFB] disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold text-[#0B1220]">{employee.fullName}</span>
                      <span className="mt-0.5 block text-xs font-medium text-[#8B95A5]">
                        {employee.email}
                        {employee.department ? ` · ${employee.department}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-bold text-[#051A2D]">Add</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

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
              className="rounded-full px-4 py-2.5 text-sm font-bold text-[#8B95A5] hover:bg-[#F3F5F7] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || picked.length === 0}
              className="rounded-full bg-[#051A2D] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0a3050] disabled:opacity-50"
            >
              {saving
                ? "Adding…"
                : picked.length > 1
                  ? `Add ${picked.length} employees`
                  : "Add to department"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
