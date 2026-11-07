"use client";

import { FormEvent, useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { ApiError } from "@/lib/api";
import { getSession, isAdmin } from "@/lib/auth";
import {
  getOrganizationSettings,
  updateOrganizationSettings,
} from "@/lib/organizations";
import { canEditPage } from "@/lib/permissions";

const fieldClass =
  "w-full max-w-xs rounded-2xl border border-black/[0.06] bg-[#F3F5F7] px-3.5 py-2.5 text-sm font-medium text-[#0B1220] outline-none focus:bg-white focus:ring-2 focus:ring-[#051A2D]/30";

export default function OrganizationSettings() {
  const session = getSession();
  const admin = isAdmin(session?.user.role ?? "");
  const canEdit = admin && canEditPage(session?.permissions, "settings", admin);

  const [amount, setAmount] = useState("0");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getOrganizationSettings()
      .then((settings) => {
        if (!cancelled) setAmount(String(Number(settings.approvalThreshold || 0)));
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not load settings.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 0) {
      setError("Approval threshold must be 0 or greater.");
      setSaved(false);
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const settings = await updateOrganizationSettings(Math.round(value * 100) / 100);
      setAmount(String(Number(settings.approvalThreshold || 0)));
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-rise">
      <AdminPageHeader
        title="Settings"
        description="Set the purchase order total that requires an organization admin to approve."
      />

      <form
        onSubmit={(event) => void onSubmit(event)}
        className="max-w-xl rounded-[24px] border border-black/[0.04] bg-white p-6"
      >
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#8B95A5]">
            Approval threshold
          </span>
          <input
            inputMode="decimal"
            value={amount}
            disabled={loading || !canEdit}
            onChange={(event) => {
              setAmount(event.target.value);
              setSaved(false);
            }}
            className={fieldClass}
            placeholder="0"
          />
        </label>
        <p className="mt-3 text-sm font-medium text-[#8B95A5]">
          Orders above this total, after discount and tax, can be approved only by an
          organization admin. 0 keeps the normal rule for every order.
        </p>
        {!admin ? (
          <p className="mt-3 text-sm font-medium text-[#4B5563]">
            Only an organization admin can change this threshold.
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm font-medium text-red-600">{error}</p>
        ) : null}
        {saved ? (
          <p className="mt-3 text-sm font-medium text-emerald-700">Threshold saved.</p>
        ) : null}
        {canEdit ? (
          <button
            type="submit"
            disabled={loading || saving}
            className="mt-5 rounded-full bg-[#051A2D] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0a3050] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save threshold"}
          </button>
        ) : null}
      </form>
    </div>
  );
}
