import type { ReactNode } from "react";

export default function AdminPageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[1.75rem] font-bold tracking-tight text-[#0B1220]">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm font-medium text-[#8B95A5]">{description}</p>
        ) : null}
      </div>
      {action}
    </header>
  );
}
