import { Suspense } from "react";
import PurchaseOrderBoard from "@/components/admin/PurchaseOrderBoard";

export default function AdminPurchaseOrdersPage() {
  return (
    <Suspense fallback={<div className="text-sm font-semibold text-[#5B6577]">Loading orders…</div>}>
      <PurchaseOrderBoard />
    </Suspense>
  );
}
