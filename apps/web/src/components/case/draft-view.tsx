import { Download, FileDown } from "lucide-react";

export type DraftVersion = { label: string; caption: string; current?: boolean };
export type DraftSection = { title: string; body: string };

export function DraftView({
  docTitle,
  sections,
  versions,
}: {
  docTitle: string;
  sections: DraftSection[];
  versions: DraftVersion[];
}) {
  return (
    <div className="flex gap-6">
      <div className="flex flex-1 flex-col gap-5 rounded-lg border border-neutral-200 bg-white p-8">
        <h2 className="text-center text-lg font-semibold tracking-[0.15em] text-neutral-950">{docTitle}</h2>
        {sections.map((s) => (
          <div key={s.title} className="flex flex-col gap-3">
            <h3 className="text-center text-base font-semibold tracking-[0.3em] text-neutral-950">{s.title}</h3>
            <p className="whitespace-pre-line text-sm leading-[1.7] text-neutral-950">{s.body}</p>
          </div>
        ))}
      </div>
      <div className="flex w-[360px] flex-col gap-4">
        <button className="flex items-center justify-center gap-2 rounded-lg bg-app-primary px-4 py-3 text-sm font-semibold text-white">
          <FileDown className="size-[18px]" />
          DOCX 다운로드
        </button>
        <div className="flex flex-col gap-1 rounded-lg border border-neutral-200 bg-white p-2">
          <span className="px-2 pb-1 pt-2 text-sm font-semibold text-neutral-950">버전</span>
          {versions.map((v) => (
            <div
              key={v.label}
              className={`flex items-center gap-2.5 rounded-md px-2 py-2.5 ${v.current ? "bg-app-tint" : ""}`}
            >
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1.5">
                  <span className={`text-sm font-semibold ${v.current ? "text-app-primary" : "text-neutral-950"}`}>
                    {v.label}
                  </span>
                  {v.current && (
                    <span className="rounded-full bg-app-primary px-2 py-0.5 text-[11px] font-semibold text-white">
                      현재
                    </span>
                  )}
                </span>
                <span className="text-xs text-neutral-500">{v.caption}</span>
              </span>
              <span className="flex-1" />
              <button
                className={`flex size-8 items-center justify-center rounded-md ${
                  v.current ? "border border-neutral-200 bg-white" : ""
                }`}
              >
                <Download className={`size-4 ${v.current ? "text-app-primary" : "text-neutral-500"}`} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
