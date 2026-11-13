"use client";

import { FormEvent, Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { saveSession } from "@/lib/auth";
import { inviteAcceptPath } from "@/lib/organizations";

const fieldClass =
  "mt-1.5 w-full rounded-2xl border border-white/25 bg-white/55 px-4 py-3 text-sm font-medium text-[#051A2D] outline-none placeholder:text-[#051A2D]/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-md transition focus:border-[#051A2D]/25 focus:bg-white/75 focus:ring-2 focus:ring-[#051A2D]/15";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = (searchParams.get("invite") || "").trim();
  const passwordRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const PasswordIcon = showPassword ? Eye : EyeOff;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const passwordInput = passwordRef.current;
    const plainPassword = passwordInput?.value ?? "";

    try {
      const response = await fetch(`${API_BASE}/api/Auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password: plainPassword,
        }),
      });

      if (passwordInput) passwordInput.value = "";

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || "Invalid username or password");
      }

      const data = await response.json();
      saveSession(data, remember);
      if (inviteToken) {
        router.push(inviteAcceptPath(inviteToken));
        return;
      }
      router.push(data.isPlatformAdmin || data.IsPlatformAdmin ? "/platform" : "/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell relative min-h-screen overflow-hidden">
      <div aria-hidden className="login-fluid" />
      <div aria-hidden className="login-fluid login-fluid--two" />
      <div aria-hidden className="login-fluid login-fluid--three" />
      <div aria-hidden className="login-brand-orb" />

      <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-[1440px] lg:grid-cols-2">
        <section className="relative flex min-h-[44vh] items-center px-10 py-14 sm:px-14 lg:min-h-screen lg:pl-16 lg:pr-8 xl:pl-24">
          <div
            aria-hidden
            className="absolute inset-0 lg:hidden"
            style={{
              background:
                "linear-gradient(145deg, #134066 0%, #051A2D 50%, #030F1A 100%)",
            }}
          />

          <div className="relative z-10 max-w-[26rem] text-white drop-shadow-sm">
            <div className="mb-10 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30">
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h10M4 17h14" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 10l4 2-4 2" />
                </svg>
              </span>
              <p className="text-lg font-bold tracking-tight">OrderCraft</p>
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
              Welcome to OrderCraft
            </h1>
            <p className="mt-4 text-base font-medium text-white/70">
              Sign in to manage procurement, companies, and invoices.
            </p>
          </div>
        </section>

        <section className="flex items-center justify-center px-6 py-12 sm:px-10 lg:px-16">
          <form
            onSubmit={handleSubmit}
            className="login-glass animate-rise w-full max-w-md space-y-5 rounded-[28px] p-6 sm:p-8"
            autoComplete="off"
          >
            <div>
              <h2 className="text-2xl font-bold text-[#051A2D]">Sign in</h2>
              <p className="mt-1 text-sm font-medium text-[#4B5563]">
                Use the username or email, and the password, for the organization you want to open.
              </p>
            </div>

            <label className="block text-sm font-semibold text-[#374151]">
              Username or email
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={fieldClass}
                required
              />
            </label>

            <label className="block text-sm font-semibold text-[#374151]">
              Password
              <span className="relative mt-1.5 block">
                <input
                  ref={passwordRef}
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  defaultValue=""
                  className={`${fieldClass} mt-0 pr-12`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3.5 text-[#6B7280] transition hover:text-[#051A2D]"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  <PasswordIcon className="h-5 w-5" />
                </button>
              </span>
            </label>

            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm font-medium text-[#4B5563]">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Remember me
              </label>
              <a href="#" className="text-sm font-semibold text-[#051A2D]">
                Forgot password?
              </a>
            </div>

            {error ? (
              <p className="rounded-2xl border border-red-200/80 bg-red-50/80 px-3 py-2 text-sm font-medium text-red-700 backdrop-blur-sm">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full border border-white/30 bg-[#051A2D]/92 px-5 py-3 text-sm font-bold text-white shadow-[0_8px_28px_rgba(5,26,45,0.28)] backdrop-blur-md transition hover:bg-[#0A3050] disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center text-sm text-[#8B95A5]">
          Loading…
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
