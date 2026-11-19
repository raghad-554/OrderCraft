"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import ScrollSelect from "@/components/ui/ScrollSelect";
import { ApiError } from "@/lib/api";
import {
  employeeUpdatePayload,
  listEmployees,
  updateEmployee,
  type Employee,
} from "@/lib/employees";
import type { OrganizationDepartment } from "@/lib/org-catalog";

const fieldClass =
  "w-full rounded-2xl border border-black/[0.06] bg-[#d4dee9] px-3.5 py-2.5 text-sm font-medium text-[#0B1220] outline-none focus:bg-[#e4ebf2] focus:ring-2 focus:ring-[#051A2D]/30";

export default function ReassignDepartmentDialog({
  department,
  departments,
  intent,
  onClose,
  onDone,
}: {
  department: OrganizationDepartment;
  departments: OrganizationDepartment[];
  intent: "deactivate" | "remove";
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const destinations = useMemo(
    () => departments.filter((item) => item.id !== department.id && item.isActive),
    [department.id, departments],
  );
  const defaultTarget = destinations[0]?.id ?? "";

  const [members, setMembers] = useState<Employee[]>([]);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [moveAllTo, setMoveAllTo] = useState(defaultTarget);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listEmployees()
      .then((rows) => {
        if (cancelled) return;
        const assigned = (Array.isArray(rows) ? rows : []).filter(
          (employee) => employee.departmentId === department.id,
        );
        setMembers(assigned);
        const initial: Record<string, string> = {};
        for (const employee of assigned) {
          initial[employee.id] = defaultTarget;
        }
        setTargets(initial);
        setMoveAllTo(defaultTarget);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load employees.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [defaultTarget, department.id]);

  function applyMoveAll(departmentId: string) {
    setMoveAllTo(departmentId);
    setTargets((prev) => {
      const next = { ...prev };
      for (const employee of members) {
        next[employee.id] = departmentId;
      }
      return next;
    });
  }

  async function reassignAll(getTargetId: (employee: Employee) => string) {
    if (members.length === 0) {
      await onDone();
      return;
    }
    if (destinations.length === 0) {
      setError("Add or activate another department first.");
      return;
    }
    const missing = members.find((employee) => !getTargetId(employee));
    if (missing) {
      setError("Choose a department for every employee.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      for (const employee of members) {
        await updateEmployee(employee.id, employeeUpdatePayload(employee, getTargetId(employee)));
      }
      await onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not move employees.");
    } finally {
      setSaving(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await reassignAll((employee) => targets[employee.id]);
  }

  async function onMoveAll() {
    if (!moveAllTo) {
      setError("Choose a department for everyone.");
      return;
    }
    applyMoveAll(moveAllTo);
    await reassignAll(() => moveAllTo);
  }

  const actionLabel = intent === "remove" ? "Move and remove" : "Move and deactivate";
  const moveAllLabel =
    intent === "remove" ? "Move all and remove" : "Move all and deactivate";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close reassign dialog"
        className="absolute inset-0 bg-[#051A2D]/55"
        onClick={() => {
          if (!saving) onClose();
        }}
      />
      <div className="relative z-10 max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[28px] bg-[#e4ebf2] p-6 shadow-2xl sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-[#0B1220]">Move employees</h2>
            <p className="mt-1 text-sm font-semibold text-[#5B6577]">
              Reassign people in {department.name} before you {intent} it. Their page access will
              follow the new department defaults.
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
          {destinations.length > 0 && members.length > 0 ? (
            <div className="rounded-[20px] border border-black/[0.04] bg-[#e8eef4] p-4">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#5B6577]">
                  Move all to
                </span>
                <ScrollSelect
                  value={moveAllTo}
                  placeholder="Select department"
                  options={destinations.map((item) => ({
                    value: item.id,
                    label: item.name,
                  }))}
                  onChange={applyMoveAll}
                  className={fieldClass}
                  disabled={saving}
                  allowEmpty={false}
                />
              </label>
              <button
                type="button"
                onClick={() => void onMoveAll()}
                disabled={saving || loading || !moveAllTo}
                className="mt-3 w-full rounded-full bg-[#051A2D] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0a3050] disabled:opacity-50"
              >
                {saving ? "Moving…" : moveAllLabel}
              </button>
            </div>
          ) : null}

          {loading ? (
            <p className="py-6 text-sm font-semibold text-[#5B6577]">Loading employees…</p>
          ) : members.length === 0 ? (
            <p className="py-6 text-sm font-semibold text-[#5B6577]">
              No employees are assigned to this department now.
            </p>
          ) : destinations.length === 0 ? (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              Add or activate another department first, then move these employees.
            </p>
          ) : (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#5B6577]">
                Or choose a department for each person
              </p>
              <ul className="divide-y divide-black/[0.04] rounded-[20px] border border-black/[0.04]">
                {members.map((employee) => (
                  <li
                    key={employee.id}
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[#0B1220]">{employee.fullName}</p>
                      <p className="mt-0.5 text-xs font-semibold text-[#5B6577]">{employee.email}</p>
                    </div>
                    <div className="sm:max-w-[220px] sm:flex-1">
                      <ScrollSelect
                        value={targets[employee.id] ?? ""}
                        placeholder="Select department"
                        options={destinations.map((item) => ({
                          value: item.id,
                          label: item.name,
                        }))}
                        onChange={(next) =>
                          setTargets((prev) => ({ ...prev, [employee.id]: next }))
                        }
                        className={fieldClass}
                        disabled={saving}
                        allowEmpty={false}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

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
              disabled={saving || loading || destinations.length === 0}
              className="rounded-full bg-[#051A2D] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0a3050] disabled:opacity-50"
            >
              {saving ? "Moving…" : actionLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
