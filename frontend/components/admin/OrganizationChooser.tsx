"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { applyOrganizationSession } from "@/lib/auth";
import {
  listMyOrganizations,
  switchOrganization,
  type OrganizationSummary,
} from "@/lib/organizations";
import { roleLabel } from "@/lib/employees";
import SwitchOrganizationDialog from "@/components/admin/SwitchOrganizationDialog";

export default function OrganizationChooser({
  fullName,
  organizations,
  onLogout,
}: {
  fullName: string;
  organizations: OrganizationSummary[];
  onLogout: () => void;
}) {
  const [pending, setPending] = useState<OrganizationSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(password: string) {
    if (!pending) return;
    setSaving(true);
    setError(null);
    try {
      const switched = await switchOrganization(pending.id, password);
      const mine = await listMyOrganizations().catch(() => null);
      applyOrganizationSession({
        token: switched.token,
        expiresAt: switched.expiresAt,
        organization: switched.organization,
        permissions: switched.permissions,
        user: switched.user,
        enabledPageKeys: switched.enabledPageKeys,
        organizations: mine ?? undefined,
      });
      window.location.assign("/admin");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not open that organization.");
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#051A2D] px-4 py-10 text-white">
      <div className="w-full max-w-md rounded-[28px] bg-white p-6 text-[#051A2D] shadow-2xl sm:p-8">
        <p className="text-xs font-bold uppercase tracking-wide text-[#8B95A5]">Choose organization</p>
        <h1 className="mt-2 text-2xl font-extrabold">Hi, {fullName}</h1>
        <p className="mt-2 text-sm font-medium text-[#8B95A5]">
          This password opened more than one organization. Choose which workspace to open, then confirm that
          organization&apos;s password. Data is never shared between them.
        </p>

        {error && !pending ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        ) : null}

        <ul className="mt-5 space-y-2">
          {organizations.map((org) => (
            <li key={org.id}>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setError(null);
                  setPending(org);
                }}
                className="flex w-full items-center justify-between rounded-2xl border border-black/[0.06] bg-[#F8FAFB] px-4 py-3 text-left transition hover:bg-[#F3F5F7] disabled:opacity-60"
              >
                <span>
                  <span className="block text-sm font-bold">{org.name}</span>
                  <span className="block text-xs font-medium text-[#8B95A5]">{roleLabel(org.role)}</span>
                </span>
                <span className="text-xs font-bold text-[#051A2D]">
                  Open
                </span>
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onLogout}
          className="mt-5 w-full rounded-full px-4 py-2 text-sm font-bold text-[#8B95A5] hover:bg-[#F3F5F7]"
        >
          Log out
        </button>
      </div>
      {pending ? (
        <SwitchOrganizationDialog
          organizationName={pending.name}
          saving={saving}
          error={error}
          onCancel={() => {
            if (saving) return;
            setPending(null);
            setError(null);
          }}
          onConfirm={(password) => void confirm(password)}
        />
      ) : null}
    </div>
  );
}
