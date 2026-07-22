import { describe, it, expect } from "vitest";
import { parseCheckpoint, parseRunComplete, parseSeniorAdvice, stripSeniorAdvice } from "@/lib/agent/protocol";

const CP_ISSUES = [
  "쟁점 후보를 정리했습니다. 승인해 주세요.",
  "```checkpoint",
  '{"type":"쟁점승인","issues":[{"id":"쟁점1","title":"서면통지 위반","claim":"해고 무효"}]}',
  "```",
].join("\n");

const CP_QUESTION = ["```checkpoint", '{"type":"질문","question":"피고 대표자 성명을 알려주세요."}', "```"].join("\n");

const RC = [
  "사건컨텍스트를 작성했습니다.",
  "```run-complete",
  '{"files":[{"path":"사건컨텍스트.json","kind":"사건컨텍스트","filename":"사건컨텍스트.json"}]}',
  "```",
].join("\n");

const ADVICE = [
  "검증을 마쳤습니다.",
  "```senior-advice",
  "증거 보강: 갑2 로그의 원본성 확보가 우선이다.",
  "",
  "조정 국면: 임금 부분 선급 합의 여지를 살펴라.",
  "```",
  "```run-complete",
  '{"files":[{"path":"검증보고_소장.md","kind":"검증보고","filename":"검증보고_소장.md"}]}',
  "```",
].join("\n");

describe("parseCheckpoint", () => {
  it("쟁점승인 payload를 파싱한다", () => {
    const p = parseCheckpoint(CP_ISSUES);
    expect(p).toEqual({ type: "쟁점승인", issues: [{ id: "쟁점1", title: "서면통지 위반", claim: "해고 무효" }] });
  });

  it("질문 payload를 파싱한다", () => {
    expect(parseCheckpoint(CP_QUESTION)).toEqual({ type: "질문", question: "피고 대표자 성명을 알려주세요." });
  });

  it("블록이 없으면 null", () => {
    expect(parseCheckpoint("그냥 텍스트")).toBeNull();
  });

  it("JSON이 깨졌으면 null", () => {
    expect(parseCheckpoint("```checkpoint\n{broken\n```")).toBeNull();
  });

  it("issues가 비면 null (스키마 위반)", () => {
    expect(parseCheckpoint('```checkpoint\n{"type":"쟁점승인","issues":[]}\n```')).toBeNull();
  });
});

describe("parseRunComplete", () => {
  it("파일 목록을 파싱한다", () => {
    expect(parseRunComplete(RC)?.files[0]).toEqual({
      path: "사건컨텍스트.json",
      kind: "사건컨텍스트",
      filename: "사건컨텍스트.json",
    });
  });

  it("kind가 enum 밖이면 null", () => {
    expect(parseRunComplete('```run-complete\n{"files":[{"path":"a","kind":"엉뚱","filename":"a"}]}\n```')).toBeNull();
  });

  it("경로 탈출(../)은 null", () => {
    expect(
      parseRunComplete('```run-complete\n{"files":[{"path":"../etc/passwd","kind":"서면","filename":"x"}]}\n```'),
    ).toBeNull();
  });
});

describe("senior-advice", () => {
  it("문단 배열로 파싱한다", () => {
    expect(parseSeniorAdvice(ADVICE)).toEqual([
      "증거 보강: 갑2 로그의 원본성 확보가 우선이다.",
      "조정 국면: 임금 부분 선급 합의 여지를 살펴라.",
    ]);
  });

  it("stripSeniorAdvice는 블록만 제거하고 나머지를 보존한다", () => {
    const s = stripSeniorAdvice(ADVICE);
    expect(s).not.toContain("senior-advice");
    expect(s).not.toContain("증거 보강");
    expect(s).toContain("run-complete");
  });

  it("블록 없으면 null / 원문 그대로", () => {
    expect(parseSeniorAdvice(RC)).toBeNull();
    expect(stripSeniorAdvice(RC)).toBe(RC);
  });
});
