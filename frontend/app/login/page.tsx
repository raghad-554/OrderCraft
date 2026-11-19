"use client";

import { FormEvent, Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { saveSession } from "@/lib/auth";
import { inviteAcceptPath } from "@/lib/organizations";

const fieldClass =
  "mt-1.5 w-full rounded-2xl border border-[#051A2D]/20 bg-[#d4dee9] px-4 py-3 text-base font-semibold text-[#051A2D] outline-none placeholder:text-[#051A2D]/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] transition focus:border-[#051A2D]/40 focus:bg-[#dde5ef] focus:ring-2 focus:ring-[#051A2D]/15";

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
        credentials: "include",
        body: JSON.stringify({
          username,
          password: plainPassword,
          rememberMe: remember,
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

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-12">
        <form
          onSubmit={handleSubmit}
          className="login-glass animate-rise w-full max-w-md space-y-5 rounded-[28px] p-6 sm:p-8"
          autoComplete="off"
        >
          <div className="text-center">
            <h3 className="text-2xl font-extrabold tracking-tight text-[#051A2D]">
              OrderCraft
            </h3>
            <p className="mt-1.5 text-[15px] font-semibold leading-snug text-[#5B6577]">
              Manage procurement, companies, and invoices.
            </p>
            <h3 className="mt-5 text-lg font-bold text-[#051A2D]">Sign in</h3>
          </div>

          <label className="block text-[15px] font-bold text-[#374151]">
            Username or email
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={fieldClass}
              required
            />
          </label>

          <label className="block text-[15px] font-bold text-[#374151]">
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
                className="absolute inset-y-0 right-0 flex items-center px-3.5 text-[#5B6577] transition hover:text-[#051A2D]"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                <PasswordIcon className="h-5 w-5" />
              </button>
            </span>
          </label>

          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-[15px] font-semibold text-[#5B6577]">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              Remember me
            </label>
            <a href="#" className="text-[15px] font-bold text-[#051A2D]">
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
            className="w-full rounded-full border border-[#051A2D] bg-[#051A2D] px-5 py-3 text-sm font-bold text-white shadow-[0_8px_28px_rgba(5,26,45,0.28)] transition hover:bg-[#0A3050] disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#051A2D] text-sm text-white/70">
          Loading…
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
