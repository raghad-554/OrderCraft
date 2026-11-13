"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { clearSession } from "@/lib/auth";
import { changeOwnPassword } from "@/lib/employees";

const fieldClass =
  "w-full rounded-2xl border border-black/[0.06] bg-[#F3F5F7] px-3.5 py-2.5 text-sm font-medium text-[#0B1220] outline-none focus:bg-white focus:ring-2 focus:ring-[#051A2D]/30";

export default function ChangePasswordDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setDone(false);
    setSaving(false);
  }

  function close() {
    if (saving) return;
    reset();
    onClose();
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (newPassword.trim().length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password must be different from the current password.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await changeOwnPassword(currentPassword, newPassword);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change password.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-[#051A2D]/55"
        onClick={close}
      />
      <div className="relative z-10 w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl sm:p-7">
        <h2 className="text-xl font-bold text-[#0B1220]">Change password</h2>
        <p className="mt-1 text-sm font-medium text-[#8B95A5]">
          This password is only for the organization you are in now. Other organizations keep their own passwords.
        </p>
        {done ? (
          <div className="mt-5 space-y-4">
            <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              Password updated. Your session was ended for security — sign in again with the new
              password.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  clearSession();
                  router.replace("/login");
                }}
                className="rounded-full bg-[#051A2D] px-5 py-2.5 text-sm font-bold text-white"
              >
                Sign in again
              </button>
            </div>
          </div>
        ) : (
          <form noValidate autoComplete="off" onSubmit={(e) => void onSubmit(e)} className="mt-5 space-y-4">
            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </div>
            ) : null}
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#8B95A5]">
                Current password *
              </span>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={fieldClass}
                autoComplete="off"
                name="oc-current-password"
                data-lpignore="true"
                data-1p-ignore="true"
                readOnly
                onFocus={(e) => e.currentTarget.removeAttribute("readonly")}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#8B95A5]">
                New password *
              </span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={fieldClass}
                autoComplete="off"
                name="oc-new-password"
                data-lpignore="true"
                data-1p-ignore="true"
                readOnly
                onFocus={(e) => e.currentTarget.removeAttribute("readonly")}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#8B95A5]">
                Confirm new password *
              </span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={fieldClass}
                autoComplete="off"
                name="oc-confirm-password"
                data-lpignore="true"
                data-1p-ignore="true"
                readOnly
                onFocus={(e) => e.currentTarget.removeAttribute("readonly")}
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={close}
                disabled={saving}
                className="rounded-full px-4 py-2 text-sm font-bold text-[#8B95A5] hover:bg-[#F3F5F7]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-[#051A2D] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
