import { Suspense } from "react";
import CompanyDirectory from "@/components/admin/CompanyDirectory";

export default function AdminCompaniesPage() {
  return (
    <Suspense fallback={<div className="text-sm font-medium text-[#8B95A5]">Loading companies…</div>}>
      <CompanyDirectory />
    </Suspense>
  );
}
