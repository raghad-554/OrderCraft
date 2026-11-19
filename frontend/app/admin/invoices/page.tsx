import { Suspense } from "react";
import InvoiceDirectory from "@/components/admin/InvoiceDirectory";

export default function InvoicesPage() {
  return (
    <Suspense fallback={<div className="text-sm font-semibold text-[#5B6577]">Loading invoices…</div>}>
      <InvoiceDirectory />
    </Suspense>
  );
}
