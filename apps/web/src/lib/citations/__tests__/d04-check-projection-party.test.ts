import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

const CHECK_PROJECTION_PATH = path.resolve(
  "D:\\projects\\litigation-writer\\templates\\check_projection.py",
);

function runCheckProjection(
  docType: string,
  context: Record<string, unknown>,
): { exitCode: number; stdout: string; stderr: string } {
  const tmpFile = path.join(
    os.tmpdir(),
    `test-ctx-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  fs.writeFileSync(tmpFile, JSON.stringify(context), "utf-8");

  try {
    const stdout = execFileSync("python", [CHECK_PROJECTION_PATH, docType, tmpFile], {
      encoding: "utf-8",
      timeout: 10000,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    return { exitCode: 0, stdout, stderr: "" };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      exitCode: e.status ?? 1,
      stdout: (e.stdout as string) ?? "",
      stderr: (e.stderr as string) ?? "",
    };
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
  }
}

function makeBaseContext(overrides: Record<string, unknown> = {}) {
  return {
    원고_성명: "홍길동",
    원고_주민번호: "000000-0000000",
    원고_주소: "서울특별시 강남구 테헤란로 123",
    원고_우편번호: "06234",
    원고_전화: "010-0000-0000",
    원고_이메일: "test@test.com",
    소송대리인: "법무사 김테스트",
    소송대리인_주소: "서울특별시 서초구 서초대로 456",
    피고_명칭: "이영수",
    피고_주소: "서울특별시 송파구 올림픽로 789",
    피고_우편번호: "05500",
    사건명: "대여금반환청구",
    작성일: "2026. 9. 16.",
    제출법원: "서울중앙지방법원",
    청구취지: ["피고는 원고에게 50,000,000원을 지급하라."],
    청구원인: [{ "번호": "1", "제목": "대여 경위", "문단": "원고는 피고에게 금원을 대여하였다." }],
    첨부서류: [{ "명칭": "갑 제1호증 금전소비대차계약서", "통수": "1" }],
    입증방법: [{ "호증": "갑 제1호증", "문서명": "금전소비대차계약서" }],
    확인필요목록: ["지연이자 이율 확인"],
    ...overrides,
  };
}

describe("D-04: check_projection 개인·법인 피고 분기", () => {
  it("피고_유형=개인 → 피고_대표자 없음 또는 null 허용", () => {
    const ctx = makeBaseContext({
      피고_대표자: null,
    });

    const result = runCheckProjection("소장", ctx);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("OK");
  });

  it("피고_유형=개인 → 피고_대표자 키 자체가 없어도 허용", () => {
    const ctx = makeBaseContext();
    delete (ctx as Record<string, unknown>)["피고_대표자"];

    const result = runCheckProjection("소장", ctx);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("OK");
  });

  it("피고_유형=법인 → 피고_대표자 필수", () => {
    const ctx = makeBaseContext({
      피고_명칭: "주식회사 테스트",
      피고_대표자: "대표이사 박대표",
    });

    const result = runCheckProjection("소장", ctx);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("OK");
  });

  it("피고_유형=법인인데 피고_대표자 없으면 FAIL", () => {
    const ctx = makeBaseContext({
      피고_명칭: "주식회사 테스트",
      피고_대표자: null,
    });

    const result = runCheckProjection("소장", ctx);

    expect(result.exitCode).not.toBe(0);
  });

  it("'해당 없음 (개인)' 같은 의미없는 문자열은 불필요 — 개인이면 필드 자체 불필요", () => {
    const ctxWithPlaceholder = makeBaseContext({
      피고_대표자: "해당 없음 (개인)",
    });

    const ctxWithoutField = makeBaseContext();
    delete (ctxWithoutField as Record<string, unknown>)["피고_대표자"];

    const resultWithout = runCheckProjection("소장", ctxWithoutField);

    expect(resultWithout.exitCode).toBe(0);
    expect(resultWithout.stdout).toContain("OK");
  });
});

describe("D-04 STEP1: 명시적 피고_유형 계약", () => {
  it("피고_유형=개인 명시 → 피고_대표자 null 허용", () => {
    const ctx = makeBaseContext({
      피고_유형: "개인",
      피고_대표자: null,
    });

    const result = runCheckProjection("소장", ctx);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("OK");
  });

  it("피고_유형=법인 명시 → 피고_대표자 필수", () => {
    const ctx = makeBaseContext({
      피고_명칭: "삼성전자",
      피고_유형: "법인",
      피고_대표자: "대표이사 한종희",
    });

    const result = runCheckProjection("소장", ctx);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("OK");
  });

  it("피고_유형=법인 명시 + 피고_대표자 없음 → FAIL", () => {
    const ctx = makeBaseContext({
      피고_명칭: "삼성전자",
      피고_유형: "법인",
    });
    delete (ctx as Record<string, unknown>)["피고_대표자"];

    const result = runCheckProjection("소장", ctx);

    expect(result.exitCode).not.toBe(0);
  });

  it("피고_유형 미지정 + 법인 마커 없는 명칭 → HUMAN_REVIEW_REQUIRED 경고", () => {
    const ctx = makeBaseContext({
      피고_명칭: "삼성전자",
    });
    delete (ctx as Record<string, unknown>)["피고_대표자"];
    delete (ctx as Record<string, unknown>)["피고_유형"];

    const result = runCheckProjection("소장", ctx);

    expect(result.stdout).toContain("HUMAN_REVIEW_REQUIRED");
  });

  it("피고_유형 미지정 + 법인 마커 있음 → 기존 호환 (법인 추정 + 경고)", () => {
    const ctx = makeBaseContext({
      피고_명칭: "주식회사 테스트",
      피고_대표자: "대표이사 박대표",
    });
    delete (ctx as Record<string, unknown>)["피고_유형"];

    const result = runCheckProjection("소장", ctx);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("OK");
  });

  it("피고_유형=개인 명시 시 법인 마커 명칭도 개인으로 처리", () => {
    const ctx = makeBaseContext({
      피고_명칭: "주식회사이영수",
      피고_유형: "개인",
    });
    delete (ctx as Record<string, unknown>)["피고_대표자"];

    const result = runCheckProjection("소장", ctx);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("OK");
  });
});
