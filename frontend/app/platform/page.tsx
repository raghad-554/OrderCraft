"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  createPlatformOrganization,
  listPlatformOrganizations,
  listPlatformPages,
  updatePlatformOrganization,
  type PlatformOrganization,
  type PlatformPage,
} from "@/lib/platform";

const emptyCreate = {
  name: "",
  contactEmail: "",
  contactPhone: "",
  adminUsername: "",
  adminFullName: "",
  adminEmail: "",
  adminPassword: "",
};

export default function PlatformOrganizationsPage() {
  const [pages, setPages] = useState<PlatformPage[]>([]);
  const [orgs, setOrgs] = useState<PlatformOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [createKeys, setCreateKeys] = useState<string[]>([]);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editKeys, setEditKeys] = useState<string[]>([]);

  const defaultKeys = useMemo(() => pages.map((page) => page.key), [pages]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [pageRows, orgRows] = await Promise.all([
        listPlatformPages(),
        listPlatformOrganizations(),
      ]);
      setPages(pageRows);
      setOrgs(orgRows);
      setCreateKeys(pageRows.map((page) => page.key));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load organizations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function toggleKey(keys: string[], key: string) {
    return keys.includes(key) ? keys.filter((item) => item !== key) : [...keys, key];
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createPlatformOrganization({
        name: createForm.name.trim(),
        contactEmail: createForm.contactEmail.trim() || undefined,
        contactPhone: createForm.contactPhone.trim() || undefined,
        enabledPageKeys: createKeys.length ? createKeys : defaultKeys,
        adminUsername: createForm.adminUsername.trim(),
        adminFullName: createForm.adminFullName.trim(),
        adminEmail: createForm.adminEmail.trim(),
        adminPassword: createForm.adminPassword,
      });
      setCreateForm(emptyCreate);
      setCreateKeys(defaultKeys);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create organization.");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(org: PlatformOrganization) {
    setEditingId(org.id);
    setEditName(org.name);
    setEditEmail(org.contactEmail ?? "");
    setEditPhone(org.contactPhone ?? "");
    setEditActive(org.isActive);
    setEditKeys(org.enabledPageKeys?.length ? org.enabledPageKeys : defaultKeys);
  }

  async function onSaveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingId) return;
    setBusy(true);
    setError(null);
    try {
      await updatePlatformOrganization(editingId, {
        name: editName.trim(),
        contactEmail: editEmail.trim() || undefined,
        contactPhone: editPhone.trim() || undefined,
        isActive: editActive,
        enabledPageKeys: editKeys,
      });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update organization.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#051A2D]">Organizations</h1>
        <p className="mt-1 text-sm font-semibold text-[#5B6577]">
          Add a tenant, set its modules, and issue the first organization admin login.
        </p>
      </div>

      {error ? (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      ) : null}

      <form onSubmit={(e) => void onCreate(e)} className="space-y-4 rounded-[24px] bg-[#e4ebf2] p-5 shadow-sm">
        <h2 className="text-sm font-bold text-[#051A2D]">New organization</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-[#5B6577]">
            Organization name
            <input
              required
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              className="mt-1 w-full rounded-2xl bg-[#d4dee9] px-3 py-2.5 text-sm font-medium text-[#051A2D] outline-none"
            />
          </label>
          <label className="text-xs font-semibold text-[#5B6577]">
            Contact email
            <input
              type="email"
              value={createForm.contactEmail}
              onChange={(e) => setCreateForm({ ...createForm, contactEmail: e.target.value })}
              className="mt-1 w-full rounded-2xl bg-[#d4dee9] px-3 py-2.5 text-sm font-medium text-[#051A2D] outline-none"
            />
          </label>
          <label className="text-xs font-semibold text-[#5B6577]">
            Contact phone
            <input
              value={createForm.contactPhone}
              onChange={(e) => setCreateForm({ ...createForm, contactPhone: e.target.value })}
              className="mt-1 w-full rounded-2xl bg-[#d4dee9] px-3 py-2.5 text-sm font-medium text-[#051A2D] outline-none"
            />
          </label>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#5B6577]">Modules</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {pages.map((page) => (
              <label key={page.key} className="flex items-start gap-2 text-sm font-medium text-[#051A2D]">
                <input
                  type="checkbox"
                  checked={createKeys.includes(page.key)}
                  onChange={() => setCreateKeys(toggleKey(createKeys, page.key))}
                  className="mt-0.5"
                />
                <span>
                  {page.label}
                  <span className="block text-xs font-semibold text-[#5B6577]">{page.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-[#5B6577]">
            Admin username
            <input
              required
              value={createForm.adminUsername}
              onChange={(e) => setCreateForm({ ...createForm, adminUsername: e.target.value })}
              className="mt-1 w-full rounded-2xl bg-[#d4dee9] px-3 py-2.5 text-sm font-medium text-[#051A2D] outline-none"
            />
          </label>
          <label className="text-xs font-semibold text-[#5B6577]">
            Admin full name (four parts)
            <input
              required
              value={createForm.adminFullName}
              onChange={(e) => setCreateForm({ ...createForm, adminFullName: e.target.value })}
              placeholder="First Second Third Family"
              className="mt-1 w-full rounded-2xl bg-[#d4dee9] px-3 py-2.5 text-sm font-medium text-[#051A2D] outline-none"
            />
          </label>
          <label className="text-xs font-semibold text-[#5B6577]">
            Admin email
            <input
              required
              type="email"
              value={createForm.adminEmail}
              onChange={(e) => setCreateForm({ ...createForm, adminEmail: e.target.value })}
              className="mt-1 w-full rounded-2xl bg-[#d4dee9] px-3 py-2.5 text-sm font-medium text-[#051A2D] outline-none"
            />
          </label>
          <label className="text-xs font-semibold text-[#5B6577]">
            Admin password
            <input
              required
              type="password"
              minLength={6}
              value={createForm.adminPassword}
              onChange={(e) => setCreateForm({ ...createForm, adminPassword: e.target.value })}
              className="mt-1 w-full rounded-2xl bg-[#d4dee9] px-3 py-2.5 text-sm font-medium text-[#051A2D] outline-none"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-[#051A2D] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Create organization"}
        </button>
      </form>

      <div className="space-y-3">
        {loading ? <p className="text-sm text-[#5B6577]">Loading…</p> : null}
        {orgs.map((org) => (
          <div
            key={org.id}
            className="rounded-[24px] border border-transparent bg-[#e4ebf2] p-5 shadow-sm transition hover:border-[#051A2D]/20 hover:bg-[#d4dee9]"
          >
            {editingId === org.id ? (
              <form onSubmit={(e) => void onSaveEdit(e)} className="space-y-3">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-2xl bg-[#d4dee9] px-3 py-2.5 text-sm font-medium"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="Contact email"
                    className="rounded-2xl bg-[#d4dee9] px-3 py-2.5 text-sm font-medium"
                  />
                  <input
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="Contact phone"
                    className="rounded-2xl bg-[#d4dee9] px-3 py-2.5 text-sm font-medium"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={editActive}
                    onChange={(e) => setEditActive(e.target.checked)}
                  />
                  Active
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {pages.map((page) => (
                    <label key={page.key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={editKeys.includes(page.key)}
                        onChange={() => setEditKeys(toggleKey(editKeys, page.key))}
                      />
                      {page.label}
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-full bg-[#051A2D] px-4 py-2 text-xs font-bold text-white"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded-full px-4 py-2 text-xs font-bold text-[#5B6577]"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-bold text-[#051A2D]">{org.name}</p>
                  <p className="text-xs font-semibold text-[#5B6577]">
                    {org.slug} · {org.isActive ? "Active" : "Inactive"} · {org.memberCount} members
                  </p>
                  <p className="mt-2 text-xs text-[#5B6577]">
                    Modules: {org.enabledPageKeys.join(", ") || "default"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => startEdit(org)}
                  className="rounded-full bg-[#d4dee9] px-4 py-2 text-xs font-bold text-[#051A2D]"
                >
                  Edit
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
