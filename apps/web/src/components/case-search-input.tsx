"use client";

import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useState, type FormEvent } from "react";

export function CaseSearchInput({
  defaultValue,
}: {
  defaultValue?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue ?? "");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed.length >= 2) {
      router.push(`/?q=${encodeURIComponent(trimmed)}`);
    } else if (trimmed.length === 0) {
      router.push("/");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-[260px] items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm">
      <Search className="size-4 text-neutral-500" />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="사건명 검색"
        className="w-full bg-transparent text-neutral-950 placeholder:text-neutral-500 outline-none"
        maxLength={100}
      />
    </form>
  );
}
