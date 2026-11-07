"use client";

import { FormEvent, useState } from "react";

const fieldClass =
  "w-full rounded-2xl border border-black/[0.06] bg-[#F3F5F7] px-3.5 py-2.5 text-sm font-medium text-[#0B1220] outline-none focus:bg-white focus:ring-2 focus:ring-[#051A2D]/30";

export default function SwitchOrganizationDialog({
  organizationName,
  saving,
  error,
  onCancel,
  onConfirm,
}: {
  organizationName: string;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (password: string) => void;
}) {
  const [password, setPassword] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!password.trim()) return;
    onConfirm(password);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-[#051A2D]/55"
        onClick={() => {
          if (!saving) onCancel();
        }}
      />
      <div className="relative z-10 w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl sm:p-7">
        <h2 className="text-xl font-bold text-[#0B1220]">Open {organizationName}</h2>
        <p className="mt-1 text-sm font-medium text-[#8B95A5]">
          Enter the password for this organization. It is not shared with your other organizations.
        </p>
        <form noValidate autoComplete="off" onSubmit={submit} className="mt-5 space-y-4">
          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </div>
          ) : null}
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#8B95A5]">
              Organization password *
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldClass}
              autoComplete="off"
              name="oc-org-password"
              data-lpignore="true"
              data-1p-ignore="true"
              readOnly
              onFocus={(e) => e.currentTarget.removeAttribute("readonly")}
            />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="rounded-full px-4 py-2 text-sm font-bold text-[#8B95A5] hover:bg-[#F3F5F7]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !password.trim()}
              className="rounded-full bg-[#051A2D] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {saving ? "Opening…" : "Open organization"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
