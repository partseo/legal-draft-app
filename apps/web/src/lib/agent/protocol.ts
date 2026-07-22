import { z } from "zod";
import type { Enums } from "@/lib/db/database.types";
import { Constants } from "@/lib/db/database.types";

export type FileKind = Enums<"file_kind">;

const CheckpointSchema = z.union([
  z.object({
    type: z.literal("쟁점승인"),
    issues: z.array(z.object({ id: z.string().min(1), title: z.string().min(1), claim: z.string() })).min(1),
  }),
  z.object({ type: z.literal("질문"), question: z.string().min(1), context: z.string().optional() }),
]);
export type CheckpointPayload = z.infer<typeof CheckpointSchema>;

const RunCompleteSchema = z.object({
  files: z
    .array(
      z.object({
        path: z
          .string()
          .min(1)
          .refine((p) => !p.includes("..") && !p.startsWith("/"), "상대 경로만 허용"),
        kind: z.enum(Constants.public.Enums.file_kind),
        filename: z.string().min(1),
      }),
    )
    .min(1),
});
export type RunCompleteFile = z.infer<typeof RunCompleteSchema>["files"][number];

/** 마지막 ```tag ... ``` 펜스 블록의 내부 텍스트 (없으면 null) */
function lastFencedBlock(text: string, tag: string): string | null {
  const re = new RegExp("```" + tag + "[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n?```", "g");
  let last: string | null = null;
  for (const m of text.matchAll(re)) last = m[1];
  return last;
}

function parseJsonBlock<T>(text: string, tag: string, schema: z.ZodType<T>): T | null {
  const raw = lastFencedBlock(text, tag);
  if (raw === null) return null;
  try {
    return schema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function parseCheckpoint(text: string): CheckpointPayload | null {
  return parseJsonBlock(text, "checkpoint", CheckpointSchema);
}

export function parseRunComplete(text: string): { files: RunCompleteFile[] } | null {
  return parseJsonBlock(text, "run-complete", RunCompleteSchema);
}

/** senior-advice 블록 → 빈 줄 기준 문단 배열. 저장 금지 — 스트림 표시 전용. */
export function parseSeniorAdvice(text: string): string[] | null {
  const raw = lastFencedBlock(text, "senior-advice");
  if (raw === null) return null;
  const paras = raw
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.replace(/\s*\r?\n\s*/g, " ").trim())
    .filter((p) => p.length > 0);
  return paras.length > 0 ? paras : null;
}

export function stripSeniorAdvice(text: string): string {
  return text.replace(/```senior-advice[ \t]*\r?\n[\s\S]*?\r?\n?```\r?\n?/g, "");
}
