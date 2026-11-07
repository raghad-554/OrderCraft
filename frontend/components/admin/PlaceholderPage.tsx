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
      <div className="rounded-[24px] bg-white px-6 py-12 text-sm font-medium text-[#8B95A5] shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
        {title} content will appear here.
      </div>
    </div>
  );
}
