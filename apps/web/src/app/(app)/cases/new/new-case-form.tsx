"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Upload, X } from "lucide-react";
import { createCase, type CreateCaseState } from "../actions";

export function NewCaseForm({ members }: { members: { id: string; display_name: string }[] }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<CreateCaseState, FormData>(createCase, {});
  const [tab, setTab] = useState<"paste" | "upload">("paste");
  const [fileNames, setFileNames] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <form action={formAction} className="flex w-[720px] flex-col gap-6">
      <h1 className="text-[22px] font-semibold text-neutral-950">새 사건 등록</h1>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-neutral-950">사건명</span>
        <input
          name="title"
          placeholder="예: 2026_김민재 해고 무효"
          className="rounded-lg border border-neutral-200 bg-white px-3 py-[11px] text-sm outline-none focus:border-app-primary"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-neutral-950">담당 변호사</span>
        <select
          name="assignee"
          className="appearance-none rounded-lg border border-neutral-200 bg-white px-3 py-[11px] text-sm outline-none"
          defaultValue=""
        >
          <option value="">미지정</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.display_name}
            </option>
          ))}
        </select>
      </label>

      <hr className="border-neutral-200" />

      <div className="flex flex-col gap-3.5">
        <span className="text-base font-semibold text-neutral-950">입력 자료</span>
        <div className="flex border-b border-neutral-200">
          <button
            type="button"
            onClick={() => setTab("paste")}
            className={`px-4 py-2.5 text-sm ${
              tab === "paste"
                ? "-mb-px border-b-2 border-app-primary font-semibold text-app-primary"
                : "font-medium text-neutral-500"
            }`}
          >
            텍스트 붙여넣기
          </button>
          <button
            type="button"
            onClick={() => setTab("upload")}
            className={`px-4 py-2.5 text-sm ${
              tab === "upload"
                ? "-mb-px border-b-2 border-app-primary font-semibold text-app-primary"
                : "font-medium text-neutral-500"
            }`}
          >
            파일 업로드
          </button>
        </div>

        <textarea
          name="pasted"
          placeholder="상담메모·사건 경위 등을 붙여넣으세요"
          className={`h-[180px] resize-none rounded-lg border border-neutral-200 bg-white p-3 text-sm outline-none focus:border-app-primary ${
            tab === "paste" ? "" : "hidden"
          }`}
        />

        <div className={tab === "upload" ? "flex flex-col gap-3" : "hidden"}>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-300 bg-neutral-100 p-6"
          >
            <Upload className="size-6 text-neutral-500" />
            <span className="text-[13px] font-medium text-zinc-600">파일을 여기로 끌어다 놓거나 클릭해 업로드</span>
            <span className="text-xs text-neutral-500">.md .txt .pdf — 텍스트 레이어 있는 PDF만, 복수 가능</span>
          </button>
          <input
            ref={fileInput}
            type="file"
            name="files"
            multiple
            accept=".md,.txt,.pdf"
            className="hidden"
            onChange={(e) => setFileNames(Array.from(e.target.files ?? []).map((f) => f.name))}
          />
          {fileNames.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {fileNames.map((n) => (
                <span
                  key={n}
                  className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[13px] text-neutral-950"
                >
                  <FileText className="size-3.5 text-zinc-600" />
                  {n}
                  <button
                    type="button"
                    onClick={() => {
                      if (fileInput.current) fileInput.current.value = "";
                      setFileNames([]);
                    }}
                  >
                    <X className="size-3.5 text-neutral-500" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {state.error && <p className="text-sm text-st-block">{state.error}</p>}

      <div className="flex items-center gap-2.5 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-app-primary px-[18px] py-[11px] text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "등록 중…" : "사건 등록"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => router.back()}
          className="rounded-lg px-[18px] py-[11px] text-sm font-medium text-zinc-600 disabled:opacity-50"
        >
          취소
        </button>
      </div>
      <p className="text-xs text-neutral-500">등록 후 사건구성 단계를 실행하면 AI가 사건컨텍스트를 만듭니다.</p>
    </form>
  );
}
