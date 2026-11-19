"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ChangePasswordDialog from "@/components/admin/ChangePasswordDialog";
import {
  logoutSession,
  getSession,
  isPlatformAdminSession,
} from "@/lib/auth";

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    if (!isPlatformAdminSession(session)) {
      router.replace("/admin");
      return;
    }
    setName(session.user.fullName || session.user.username);
    setReady(true);
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#051A2D] text-sm font-medium text-white/80">
        Loading platform console...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#051A2D] p-2 sm:p-3 lg:p-4">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-6xl flex-col overflow-hidden rounded-[28px] bg-[#c5d2e0]">
        <header className="flex items-center justify-between border-b border-black/[0.04] px-6 py-4">
          <div>
            <p className="text-sm font-bold text-[#051A2D]">OrderCraft Platform</p>
            <p className="text-xs font-semibold text-[#5B6577]">Create organizations and enable modules</p>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-xs font-semibold text-[#051A2D]">{name}</p>
            <button
              type="button"
              onClick={() => setChangePasswordOpen(true)}
              className="rounded-full bg-[#e4ebf2] px-4 py-2 text-xs font-bold text-[#051A2D] ring-1 ring-black/[0.08]"
            >
              Change password
            </button>
            <button
              type="button"
              onClick={() => {
                void logoutSession().then(() => router.replace("/login"));
              }}
              className="rounded-full bg-[#051A2D] px-4 py-2 text-xs font-bold text-white"
            >
              Log out
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-auto px-6 py-6">{children}</div>
      </div>
      <ChangePasswordDialog
        open={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />
    </div>
  );
}
