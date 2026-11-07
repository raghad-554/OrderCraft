"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE } from "@/lib/api";
import { saveSession } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const passwordRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      router.push(data.isPlatformAdmin || data.IsPlatformAdmin ? "/platform" : "/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-white">
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
            className="animate-rise w-full max-w-md space-y-5"
            autoComplete="off"
          >
            <div>
              <h2 className="text-2xl font-bold text-[#051A2D]">Sign in</h2>
              <p className="mt-1 text-sm font-medium text-[#8B95A5]">
                Use the username or email, and the password, for the organization you want to open.
              </p>
            </div>

            <label className="block text-sm font-semibold text-[#8B95A5]">
              Username or email
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1.5 w-full rounded-2xl bg-[#F3F5F7] px-4 py-3 text-sm font-medium text-[#051A2D] outline-none ring-1 ring-transparent focus:ring-[#051A2D]/20"
                required
              />
            </label>

            <label className="block text-sm font-semibold text-[#8B95A5]">
              Password
              <input
                ref={passwordRef}
                type="password"
                name="password"
                autoComplete="current-password"
                defaultValue=""
                className="mt-1.5 w-full rounded-2xl bg-[#F3F5F7] px-4 py-3 text-sm font-medium text-[#051A2D] outline-none ring-1 ring-transparent focus:ring-[#051A2D]/20"
                required
              />
            </label>

            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm font-medium text-[#8B95A5]">
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
              <p className="text-sm font-medium text-red-600">{error}</p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#051A2D] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#0A3050] disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
