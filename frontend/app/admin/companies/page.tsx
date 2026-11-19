import { Suspense } from "react";
import CompanyDirectory from "@/components/admin/CompanyDirectory";

export default function AdminCompaniesPage() {
  return (
    <Suspense fallback={<div className="text-sm font-semibold text-[#5B6577]">Loading companies…</div>}>
      <CompanyDirectory />
    </Suspense>
  );
}
