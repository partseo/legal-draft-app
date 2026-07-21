"use client";

import { useActionState } from "react";
import { ChevronDown, UserPlus } from "lucide-react";
import { inviteMember, type InviteState } from "./actions";

export function InviteForm() {
  const [state, formAction, pending] = useActionState<InviteState, FormData>(inviteMember, {});
  return (
    <form action={formAction} className="flex items-center gap-2">
      {state.error && <span className="text-xs text-st-block">{state.error}</span>}
      {state.ok && <span className="text-xs text-st-done">{state.ok}</span>}
      <input
        name="email"
        type="email"
        placeholder="이메일 주소"
        className="w-[220px] rounded-md border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-app-primary"
      />
      <span className="flex items-center gap-1.5 rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-950">
        멤버 <ChevronDown className="size-3.5 text-neutral-500" />
      </span>
      <button
        type="submit"
        disabled={pending}
        className="flex items-center gap-1.5 rounded-md bg-app-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        <UserPlus className="size-[15px]" />
        {pending ? "보내는 중…" : "초대 보내기"}
      </button>
    </form>
  );
}
