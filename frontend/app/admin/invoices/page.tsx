import { Suspense } from "react";
import InvoiceDirectory from "@/components/admin/InvoiceDirectory";

export default function InvoicesPage() {
  return (
    <Suspense fallback={<div className="text-sm font-medium text-[#8B95A5]">Loading invoices…</div>}>
      <InvoiceDirectory />
    </Suspense>
  );
}
