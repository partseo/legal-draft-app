"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Scale, FolderOpen, Settings } from "lucide-react";
import { AvatarBadge } from "@/components/avatar-badge";

const NAV = [
  { href: "/", label: "사건", icon: FolderOpen, match: (p: string) => p === "/" || p.startsWith("/cases") },
  { href: "/settings", label: "설정", icon: Settings, match: (p: string) => p.startsWith("/settings") },
];

export function AppSidebar({ userName, userRole }: { userName: string; userRole: string }) {
  const pathname = usePathname();
  return (
    <aside className="flex w-60 shrink-0 flex-col gap-1.5 border-r border-neutral-200 bg-white px-4 py-5">
      <div className="flex items-center gap-2 p-2">
        <Scale className="size-[22px] text-app-primary" />
        <span className="text-[15px] font-semibold text-neutral-950">송무서면 생성기</span>
      </div>
      <nav className="flex flex-col gap-1 pt-4">
        {NAV.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm ${
                active ? "bg-app-tint font-semibold text-app-primary" : "font-medium text-zinc-600 hover:bg-neutral-100"
              }`}
            >
              <Icon className="size-[18px]" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="flex-1" />
      <div className="flex items-center gap-2.5 px-2 py-2.5">
        <AvatarBadge name={userName} size={32} />
        <div className="flex flex-col">
          <span className="text-[13px] font-medium text-neutral-950">{userName}</span>
          <span className="text-[11px] text-neutral-500">{userRole}</span>
        </div>
      </div>
    </aside>
  );
}
