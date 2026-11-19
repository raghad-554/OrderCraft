import { Suspense } from "react";
import AuditLogBoard from "@/components/admin/AuditLogBoard";

export default function AuditLogPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-[24px] border border-black/[0.04] bg-[#e4ebf2] px-5 py-12 text-center text-sm text-[#5B6577]">
          Loading audit log…
        </div>
      }
    >
      <AuditLogBoard />
    </Suspense>
  );
}
