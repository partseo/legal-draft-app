import { describe, it, expect } from "vitest";
import { asciiExt, inputStorageKey, artifactStorageKey } from "@/lib/storage-key";

// Supabase Storage가 허용하는 키 문자 집합의 안전 부분집합 (한글 등 비ASCII 불가)
const SAFE = /^[A-Za-z0-9/_.-]+$/;
const CASE_ID = "03699efe-0139-4092-821f-0be77b24d472";

describe("asciiExt", () => {
  it("한글 파일명에서도 ASCII 확장자만 뽑는다", () => {
    expect(asciiExt("사건기록_임금체불_부당해고.md")).toBe(".md");
    expect(asciiExt("계약서.PDF")).toBe(".pdf");
  });
  it("확장자가 없으면 빈 문자열", () => {
    expect(asciiExt("붙여넣기메모")).toBe("");
  });
});

describe("inputStorageKey", () => {
  it("한글 파일명이어도 ASCII-safe 키를 만든다", () => {
    const key = inputStorageKey(CASE_ID, "사건기록_임금체불_부당해고.md");
    expect(SAFE.test(key)).toBe(true);
    expect(key.startsWith(`${CASE_ID}/input/`)).toBe(true);
    expect(key.endsWith(".md")).toBe(true);
  });
  it("호출마다 유일하다", () => {
    expect(inputStorageKey(CASE_ID, "a.md")).not.toBe(inputStorageKey(CASE_ID, "a.md"));
  });
});

describe("artifactStorageKey", () => {
  it("한글 산출물명이어도 ASCII-safe 키를 만든다", () => {
    const key = artifactStorageKey(CASE_ID, 2, "검증보고_소장.md");
    expect(SAFE.test(key)).toBe(true);
    expect(key.startsWith(`${CASE_ID}/artifacts/v2-`)).toBe(true);
    expect(key.endsWith(".md")).toBe(true);
  });
});
