"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace("/login");
      return;
    }

    router.replace(session.isPlatformAdmin ? "/platform" : "/admin");
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#d4dee9] text-sm font-medium text-[#051A2D]">
      Redirecting...
    </main>
  );
}
