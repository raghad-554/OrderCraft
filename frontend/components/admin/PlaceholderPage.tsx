import AdminPageHeader from "@/components/admin/AdminPageHeader";

export default function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <AdminPageHeader title={title} description={description} />
      <div className="rounded-[24px] bg-[#e4ebf2] px-6 py-12 text-sm font-semibold text-[#5B6577] shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
        {title} content will appear here.
      </div>
    </div>
  );
}
