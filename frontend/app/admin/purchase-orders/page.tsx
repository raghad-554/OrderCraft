import { Suspense } from "react";
import PurchaseOrderBoard from "@/components/admin/PurchaseOrderBoard";

export default function AdminPurchaseOrdersPage() {
  return (
    <Suspense fallback={<div className="text-sm font-medium text-[#8B95A5]">Loading orders…</div>}>
      <PurchaseOrderBoard />
    </Suspense>
  );
}
