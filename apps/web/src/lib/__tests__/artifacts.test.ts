import { describe, it, expect } from "vitest";
import { contextJsonToView, mdToSections, renderContextToSections, parseVerifyReport } from "@/lib/artifacts";

const CONTEXT = {
  사건: { 사건명: "해고무효확인의 소", 제출법원: "인천지방법원", 수임범위: "1심", 심급: "1심" },
  당사자: {
    원고: [{ 성명: "김민재", 주소: "서울 강서구", 전화: "010-0000-0000" }],
    피고: [{ 명칭: "동해물류 주식회사", 주소: "인천 서구", 대표자: "박상호" }],
    소송대리인: { 표시: "법무법인 화현 담당변호사 이수진" },
  },
  사실관계: [{ 일자: "2025.11.14.", 사실: "구두 해고 통보", 근거: "상담메모.md §2" }],
  쟁점: [{ id: "쟁점1", 제목: "서면통지 위반", 우리주장: "해고 무효", 상대주장: null, 법리ref: null }],
  증거: [{ 표시: "갑1", 증거명: "근로계약서", 입증취지: "고용관계" }],
  청구: [{ 유형: "확인", 청구취지문안: "해고는 무효임을 확인한다.", 금액: null }],
  확인필요: ["지연이자 이율"],
};

describe("contextJsonToView", () => {
  it("당사자·사실관계·쟁점·청구·확인필요를 매핑한다", () => {
    const v = contextJsonToView(CONTEXT);
    expect(v.parties).toEqual([
      { role: "원고", name: "김민재", address: "서울 강서구", contact: "010-0000-0000" },
      { role: "피고", name: "동해물류 주식회사", address: "인천 서구", contact: undefined },
    ]);
    expect(v.facts).toEqual([{ date: "2025.11.14.", content: "구두 해고 통보", evidence: "상담메모.md §2" }]);
    expect(v.issues).toEqual([{ id: "쟁점1", title: "서면통지 위반", claim: "해고 무효", approved: true }]);
    expect(v.claimSummary).toContain("해고는 무효임을 확인한다.");
    expect(v.needsReview).toEqual(["지연이자 이율"]);
  });

  it("형식이 어긋나도 던지지 않고 빈 배열로", () => {
    const v = contextJsonToView({ 이상한: 1 });
    expect(v.parties).toEqual([]);
    expect(v.facts).toEqual([]);
  });
});

describe("mdToSections", () => {
  it("## 제목으로 분할, 서두는 개요", () => {
    const md = "머리말\n\n## 쟁점1 서면통지\n\n내용1\n\n## 쟁점2 임금\n\n내용2";
    const s = mdToSections(md);
    expect(s.map((x) => x.title)).toEqual(["개요", "쟁점1 서면통지", "쟁점2 임금"]);
    expect(s[1].body).toBe("내용1");
  });
});

describe("renderContextToSections", () => {
  it("청구취지·청구원인을 섹션으로", () => {
    const s = renderContextToSections({
      청구취지: ["1항", "2항"],
      청구원인: [{ 번호: "1", 제목: "당사자의 지위", 문단: ["가", "나"] }],
    });
    expect(s[0]).toEqual({ title: "청구 취지", body: "1항\n2항" });
    expect(s[1]).toEqual({ title: "1. 당사자의 지위", body: "가\n\n나" });
  });
});

describe("parseVerifyReport", () => {
  const MD = [
    "# 검증보고",
    "| 인용 | 출처 핀 | (a)존재 | (b)내용일치 | (c)현행성 | (d)생사 | 판정 | 사유 |",
    "|---|---|---|---|---|---|---|---|",
    "| 근로기준법 제27조 | MST:265959 | ✅ | ✅ | ✅ | - | ✅ | 원문 축자 일치 |",
    "| 대법원 2009다12345 | 판례ID:999 | ✅ | ❌ | - | ✅ | ❌ | 판시 불일치 |",
    "",
    "**FAIL — 제출 금지**",
  ].join("\n");

  it("표준 8열 표와 FAIL을 파싱한다", () => {
    const { rows, fail } = parseVerifyReport(MD);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      citation: "근로기준법 제27조",
      pin: "MST:265959",
      kind: "법령",
      state: "pass",
      note: "원문 축자 일치",
    });
    expect(rows[0].checks.map((c) => c.mark)).toEqual(["✅", "✅", "✅", "-"]);
    expect(rows[0].checks.map((c) => c.label)).toEqual(["존재", "내용일치", "현행성", "생사"]);
    expect(rows[1]).toMatchObject({ citation: "대법원 2009다12345", kind: "판례", state: "fail", note: "판시 불일치" });
    expect(fail).toBe(true);
  });

  it("번호 열이 붙은 9열 표(실측 산출 형식)도 헤더 이름으로 파싱한다", () => {
    // 에이전트가 스킬 규정(8열)에 # 번호 열을 추가해 산출한 실제 형식
    const md = [
      "| # | 인용 | 출처 핀(서면) | (a)존재 | (b)내용일치 | (c)현행성 | (d)생사 | 판정 | 사유 |",
      "|---|---|---|---|---|---|---|---|---|",
      "| 1 | 근로기준법 제27조 ①②(③) | MST:265959, 시행 2025-10-23 [현행] | ✅ | ✅ | ✅ 현행 MST 일치(search_law: 265959) | - | ✅ | `get_law_text(265959, 제27조)` 원문 축자 일치. |",
      "| 2 | 대법원 2021. 2. 25. 선고 2017다226605 판결 | 판례ID:214235 | ✅ | ✅ | - | ✅ | ✅ | 재조회 결과 법원·선고일·사건번호 정확 일치. |",
    ].join("\n");
    const { rows, fail } = parseVerifyReport(md);
    expect(rows).toHaveLength(2); // 헤더·구분선은 데이터 행으로 나오지 않는다
    expect(rows[0]).toMatchObject({ citation: "근로기준법 제27조 ①②(③)", kind: "법령", state: "pass" });
    expect(rows[0].pin).toContain("MST:265959");
    expect(rows[0].checks[2]).toMatchObject({ label: "현행성", mark: "✅", detail: "✅ 현행 MST 일치(search_law: 265959)" });
    expect(rows[1]).toMatchObject({ kind: "판례", state: "pass", pin: "판례ID:214235" });
    expect(rows[1].note).toContain("정확 일치");
    expect(fail).toBe(false);
  });

  it("⚠️ 판정은 warn — 실패로 세지 않는다", () => {
    const md = [
      "| 인용 | 출처 핀 | (a)존재 | (b)내용일치 | (c)현행성 | (d)생사 | 판정 | 사유 |",
      "|---|---|---|---|---|---|---|---|",
      "| 민법 제750조 | MST:1 | ✅ | ✅ | ⚠️ 개정 가능성 | - | ⚠️ | 변호사 확인 필요 |",
    ].join("\n");
    const { rows } = parseVerifyReport(md);
    expect(rows[0].state).toBe("warn");
    expect(rows[0].checks[2].mark).toBe("⚠");
  });

  it("표가 없어도 FAIL 판정은 동작, ❌ 행이 있으면 FAIL 문자열 없이도 fail", () => {
    expect(parseVerifyReport("아무 표 없음 **PASS**").fail).toBe(false);
    expect(parseVerifyReport("… FAIL …").fail).toBe(true);
    const md = [
      "| 인용 | 출처 핀 | (a)존재 | (b)내용일치 | (c)현행성 | (d)생사 | 판정 | 사유 |",
      "|---|---|---|---|---|---|---|---|",
      "| 민법 제9999조 | MST:1 | ❌ | - | - | - | ❌ | 조문 부존재 |",
    ].join("\n");
    expect(parseVerifyReport(md).fail).toBe(true);
  });
});
