"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { acceptInvitation } from "@/lib/organizations";

function InviteAcceptInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = (searchParams.get("token") || "").trim();
  const session = getSession();

  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsAccount, setNeedsAccount] = useState(false);

  const loginHref = useMemo(
    () => (token ? `/login?invite=${encodeURIComponent(token)}` : "/login"),
    [token],
  );

  async function tryAccept(payload?: {
    username?: string;
    fullName?: string;
    password?: string;
  }) {
    if (!token) {
      setError("Missing invitation token.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await acceptInvitation({
        token,
        username: payload?.username,
        fullName: payload?.fullName,
        password: payload?.password,
      });
      setInfo("Invitation accepted. You can open the admin workspace.");
      window.setTimeout(() => router.push("/admin"), 800);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not accept invitation.";
      if (message.toLowerCase().includes("create an account")) {
        setNeedsAccount(true);
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    if (!session?.token) return;
    void tryAccept();
    // Intentionally run once when a logged-in session + token are present.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, session?.token]);

  async function onRegister(event: FormEvent) {
    event.preventDefault();
    await tryAccept({
      username: username.trim(),
      fullName: fullName.trim(),
      password,
    });
  }

  return (
    <main className="min-h-screen bg-[#d4dee9] px-4 py-16">
      <div className="mx-auto w-full max-w-lg rounded-[28px] border border-black/[0.04] bg-[#e4ebf2] p-8 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-[#5B6577]">
          OrderCraft
        </p>
        <h1 className="mt-2 text-2xl font-bold text-[#0B1220]">
          Accept invitation
        </h1>
        <p className="mt-2 text-sm text-[#4B5563]">
          Join the organization using your invite link.
        </p>

        {!token ? (
          <p className="mt-6 text-sm font-medium text-red-700">
            This invite link is incomplete.
          </p>
        ) : null}

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        ) : null}

        {info ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            {info}
          </div>
        ) : null}

        {token && !session?.token && !needsAccount ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm text-[#4B5563]">
              Already have an account with the invited email? Sign in first, then
              we will complete the invite.
            </p>
            <Link
              href={loginHref}
              className="inline-flex rounded-full bg-[#051A2D] px-5 py-2.5 text-sm font-bold text-white"
            >
              Sign in to accept
            </Link>
            <button
              type="button"
              onClick={() => setNeedsAccount(true)}
              className="ml-2 inline-flex rounded-full border border-black/[0.08] px-5 py-2.5 text-sm font-bold text-[#051A2D]"
            >
              Create account
            </button>
          </div>
        ) : null}

        {token && needsAccount ? (
          <form onSubmit={(e) => void onRegister(e)} className="mt-6 space-y-3">
            <p className="text-sm text-[#4B5563]">
              Create your account for the invited email, then join the organization.
            </p>
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#5B6577]">
                Username
              </span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-2xl border border-black/[0.06] bg-[#d4dee9] px-3.5 py-2.5 text-sm"
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#5B6577]">
                Full name
              </span>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-2xl border border-black/[0.06] bg-[#d4dee9] px-3.5 py-2.5 text-sm"
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#5B6577]">
                Password
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl border border-black/[0.06] bg-[#d4dee9] px-3.5 py-2.5 text-sm"
                minLength={6}
                required
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-[#051A2D] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy ? "Joining…" : "Create account and join"}
            </button>
          </form>
        ) : null}

        {token && session?.token ? (
          <p className="mt-6 text-sm text-[#5B6577]">
            {busy ? "Accepting invitation…" : "Signed in — accepting invitation…"}
          </p>
        ) : null}
      </div>
    </main>
  );
}

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#d4dee9] px-4 py-16 text-center text-sm text-[#5B6577]">
          Loading invite…
        </main>
      }
    >
      <InviteAcceptInner />
    </Suspense>
  );
}
