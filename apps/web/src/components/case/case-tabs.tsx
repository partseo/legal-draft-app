import Link from "next/link";

export const CASE_TABS = ["개요", "입력자료", "사건컨텍스트", "리서치", "서면", "검증보고"] as const;
export type CaseTab = (typeof CASE_TABS)[number];

export function CaseTabBar({
  active,
  baseHref,
  disabled = [],
}: {
  active: CaseTab;
  baseHref: string;
  disabled?: CaseTab[];
}) {
  return (
    <div className="flex items-end gap-6 border-b border-neutral-200">
      {CASE_TABS.map((tab) => {
        const isActive = tab === active;
        const isDisabled = disabled.includes(tab);
        if (isDisabled) {
          return (
            <span key={tab} className="cursor-not-allowed px-0.5 pb-2.5 pt-2.5 text-sm font-medium text-zinc-300">
              {tab}
            </span>
          );
        }
        return (
          <Link
            key={tab}
            href={`${baseHref}?tab=${encodeURIComponent(tab)}`}
            className={`-mb-px px-0.5 pb-2.5 pt-2.5 text-sm ${
              isActive
                ? "border-b-2 border-app-primary font-semibold text-app-primary"
                : "font-medium text-neutral-500 hover:text-neutral-950"
            }`}
          >
            {tab}
          </Link>
        );
      })}
    </div>
  );
}
