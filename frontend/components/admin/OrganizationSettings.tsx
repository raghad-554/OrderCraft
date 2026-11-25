"use client";

import { FormEvent, useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import ScrollSelect from "@/components/ui/ScrollSelect";
import { ApiError } from "@/lib/api";
import { getSession, isAdmin, updateSessionOrganizationName } from "@/lib/auth";
import { setOrgCurrency } from "@/lib/money";
import {
  ORGANIZATION_CURRENCIES,
  getOrganizationSettings,
  updateOrganizationSettings,
  type OrganizationPaymentTerms,
  type OrganizationSettings as OrganizationSettingsData,
} from "@/lib/organizations";
import { PAYMENT_TERMS } from "@/lib/orders";
import { canEditPage } from "@/lib/permissions";

const fieldClass =
  "w-full rounded-2xl border border-black/[0.06] bg-[#d4dee9] px-3.5 py-2.5 text-sm font-medium text-[#0B1220] outline-none focus:bg-[#e4ebf2] focus:ring-2 focus:ring-[#051A2D]/30";

const profileInputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-[#0B1220] outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 disabled:cursor-not-allowed disabled:opacity-60";

function orgInitials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "ORG";
  const words = trimmed.split(/[\s_-]+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
  }
  const camel = trimmed.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])/g);
  if (camel && camel.length >= 2) {
    return `${camel[0][0] ?? ""}${camel[1][0] ?? ""}`.toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

type FormState = {
  name: string;
  slug: string;
  contactEmail: string;
  contactPhone: string;
  logoUrl: string;
  defaultCurrency: string;
  defaultTaxRate: string;
  defaultPaymentTerms: OrganizationPaymentTerms;
  approvalThreshold: string;
};

type ProfileDraft = Pick<FormState, "name" | "contactEmail" | "contactPhone">;

function emptyForm(): FormState {
  return {
    name: "",
    slug: "",
    contactEmail: "",
    contactPhone: "",
    logoUrl: "",
    defaultCurrency: "USD",
    defaultTaxRate: "0",
    defaultPaymentTerms: "Net30",
    approvalThreshold: "0",
  };
}

function fromSettings(settings: OrganizationSettingsData): FormState {
  return {
    name: settings.name ?? "",
    slug: settings.slug ?? "",
    contactEmail: settings.contactEmail ?? "",
    contactPhone: settings.contactPhone ?? "",
    logoUrl: settings.logoUrl ?? "",
    defaultCurrency: settings.defaultCurrency || "USD",
    defaultTaxRate: String(Number(settings.defaultTaxRate || 0)),
    defaultPaymentTerms: settings.defaultPaymentTerms || "Net30",
    approvalThreshold: String(Number(settings.approvalThreshold || 0)),
  };
}

function profileSnapshot(form: FormState): ProfileDraft {
  return {
    name: form.name,
    contactEmail: form.contactEmail,
    contactPhone: form.contactPhone,
  };
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-[#5B6577]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#0B1220]">{value || "—"}</p>
    </div>
  );
}

export default function OrganizationSettings() {
  const session = getSession();
  const admin = isAdmin(session?.user.role ?? "");
  const canEdit = admin && canEditPage(session?.permissions, "settings", admin);
  const sessionOrg = session?.organization;

  const [form, setForm] = useState<FormState>(() => ({
    ...emptyForm(),
    name: sessionOrg?.name ?? "",
    slug: sessionOrg?.slug ?? "",
  }));
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileBackup, setProfileBackup] = useState<ProfileDraft | null>(null);
  const [loadedCurrency, setLoadedCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getOrganizationSettings()
      .then((settings) => {
        if (!cancelled) {
          setForm(fromSettings(settings));
          setLoadedCurrency(settings.defaultCurrency || "USD");
          setOrgCurrency(settings.defaultCurrency);
        }
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

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function startEditProfile() {
    setProfileBackup(profileSnapshot(form));
    setEditingProfile(true);
    setSaved(false);
    setError(null);
  }

  function cancelEditProfile() {
    if (profileBackup) {
      setForm((prev) => ({ ...prev, ...profileBackup }));
    }
    setProfileBackup(null);
    setEditingProfile(false);
    setError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;

    const name = form.name.trim();
    if (!name) {
      setError("Organization name is required.");
      setSaved(false);
      return;
    }

    const taxRate = Number(form.defaultTaxRate);
    const approvalThreshold = Number(form.approvalThreshold);
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      setError("Default tax rate must be between 0 and 100.");
      setSaved(false);
      return;
    }
    if (!Number.isFinite(approvalThreshold) || approvalThreshold < 0) {
      setError("Approval threshold must be 0 or greater.");
      setSaved(false);
      return;
    }

    const logoUrl = form.logoUrl.trim();
    if (logoUrl) {
      try {
        const parsed = new URL(logoUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          setError("Logo URL must start with http:// or https://.");
          setSaved(false);
          return;
        }
      } catch {
        setError("Logo URL must be a valid link.");
        setSaved(false);
        return;
      }
    }

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const settings = await updateOrganizationSettings({
        name,
        contactEmail: form.contactEmail.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
        logoUrl: logoUrl || null,
        defaultCurrency: form.defaultCurrency,
        defaultTaxRate: Math.round(taxRate * 100) / 100,
        defaultPaymentTerms: form.defaultPaymentTerms,
        approvalThreshold: Math.round(approvalThreshold * 100) / 100,
      });
      setForm(fromSettings(settings));
      setLoadedCurrency(settings.defaultCurrency || "USD");
      updateSessionOrganizationName(settings.name);
      setOrgCurrency(settings.defaultCurrency);
      setProfileBackup(null);
      setEditingProfile(false);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  const displayName =
    form.name.trim() || sessionOrg?.name?.trim() || "Organization";
  const initials = orgInitials(displayName);

  return (
    <div className="animate-rise">
      <AdminPageHeader
        title="Settings"
        description="Organization profile, commercial defaults, and approval rules."
        action={
          canEdit ? (
            <div className="flex flex-wrap items-center gap-3">
              {saved ? (
                <p className="text-sm font-medium text-emerald-700">Changes saved.</p>
              ) : null}
              <button
                type="submit"
                form="organization-settings-form"
                disabled={loading || saving}
                className="shrink-0 rounded-full bg-[#051A2D] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0a3050] disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          ) : null
        }
      />

      <form
        id="organization-settings-form"
        onSubmit={(event) => void onSubmit(event)}
        className="space-y-5"
      >
        <section className="overflow-hidden rounded-[24px] border border-black/[0.04] bg-[#e4ebf2] shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/[0.04] bg-white/50 px-6 py-5">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-base font-semibold tracking-wide text-white">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-bold text-[#0B1220]">{displayName}</p>
              </div>
            </div>
            {canEdit && !editingProfile ? (
              <button
                type="button"
                disabled={loading}
                onClick={startEditProfile}
                className="shrink-0 rounded-full border border-black/[0.08] bg-white px-4 py-2 text-sm font-bold text-[#051A2D] transition hover:bg-[#d4dee9] disabled:opacity-50"
              >
                Edit info
              </button>
            ) : null}
          </div>

          <div className="px-6 py-6">
            {!editingProfile ? (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <InfoRow label="Contact email" value={form.contactEmail} />
                <InfoRow label="Contact phone" value={form.contactPhone} />
              </div>
            ) : (
              <>
                <div className="mb-5">
                  <h2 className="text-base font-bold text-[#0B1220]">Edit organization info</h2>
                  <p className="mt-1 text-sm font-semibold text-[#5B6577]">
                    Update company identity and contact details.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="block md:col-span-2">
                    <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#5B6577]">
                      Name *
                    </span>
                    <input
                      value={form.name}
                      disabled={loading || !canEdit}
                      onChange={(e) => patch("name", e.target.value)}
                      className={profileInputClass}
                      autoComplete="organization"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#5B6577]">
                      Contact email
                    </span>
                    <input
                      type="email"
                      value={form.contactEmail}
                      disabled={loading || !canEdit}
                      onChange={(e) => patch("contactEmail", e.target.value)}
                      className={profileInputClass}
                      autoComplete="email"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#5B6577]">
                      Contact phone
                    </span>
                    <input
                      value={form.contactPhone}
                      disabled={loading || !canEdit}
                      onChange={(e) => patch("contactPhone", e.target.value)}
                      className={profileInputClass}
                      autoComplete="tel"
                    />
                  </label>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-black/[0.04] pt-5">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={cancelEditProfile}
                    className="rounded-full px-4 py-2.5 text-sm font-bold text-[#5B6577] hover:bg-[#d4dee9] disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        <section className="rounded-[24px] border border-black/[0.04] bg-[#e4ebf2] p-6">
          <h2 className="text-base font-bold text-[#0B1220]">Commercial defaults</h2>
          <p className="mt-1 text-sm font-semibold text-[#5B6577]">
            Prefill new orders and invoices with these values.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#5B6577]">
                Currency
              </span>
              <ScrollSelect
                value={form.defaultCurrency}
                placeholder="Select currency"
                options={ORGANIZATION_CURRENCIES.map((code) => ({
                  value: code,
                  label: code,
                }))}
                onChange={(next) => patch("defaultCurrency", next)}
                className={fieldClass}
                disabled={loading || !canEdit}
                allowEmpty={false}
              />
              <p className="mt-1.5 text-xs font-medium text-[#5B6577]">
                Used for new products, orders, and invoices. Existing amounts are not
                converted.
              </p>
              {form.defaultCurrency !== loadedCurrency ? (
                <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium leading-relaxed text-amber-900">
                  Changing currency does not convert amounts. A price of 40{" "}
                  {loadedCurrency} will still be stored as 40 and shown as 40{" "}
                  {form.defaultCurrency}. Update product and order prices manually if
                  needed.
                </p>
              ) : null}
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#5B6577]">
                Default tax rate (%)
              </span>
              <input
                inputMode="decimal"
                value={form.defaultTaxRate}
                disabled={loading || !canEdit}
                onChange={(e) => patch("defaultTaxRate", e.target.value)}
                className={fieldClass}
                placeholder="0"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#5B6577]">
                Default payment terms
              </span>
              <ScrollSelect
                value={form.defaultPaymentTerms}
                placeholder="Select terms"
                options={PAYMENT_TERMS.map((term) => ({
                  value: term.value,
                  label: term.label,
                }))}
                onChange={(next) =>
                  patch("defaultPaymentTerms", next as OrganizationPaymentTerms)
                }
                className={fieldClass}
                disabled={loading || !canEdit}
                allowEmpty={false}
              />
            </label>
          </div>
        </section>

        <section className="rounded-[24px] border border-black/[0.04] bg-[#e4ebf2] p-6">
          <h2 className="text-base font-bold text-[#0B1220]">Approval rules</h2>
          <p className="mt-1 text-sm font-semibold text-[#5B6577]">
            Orders above this total, after discount and tax, can be approved only by an
            organization admin. 0 keeps the normal rule for every order.
          </p>
          <label className="mt-5 block max-w-xs">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#5B6577]">
              Approval threshold
            </span>
            <input
              inputMode="decimal"
              value={form.approvalThreshold}
              disabled={loading || !canEdit}
              onChange={(e) => patch("approvalThreshold", e.target.value)}
              className={fieldClass}
              placeholder="0"
            />
          </label>
        </section>

        {!admin ? (
          <p className="text-sm font-medium text-[#4B5563]">
            Only an organization admin can change these settings.
          </p>
        ) : null}
        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
      </form>
    </div>
  );
}
