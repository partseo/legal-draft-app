import { describe, it, expect } from "vitest";
import { compareWithOfficialText } from "@/lib/citations/citation-validator";

describe("D-02: 공식 원문 대조 검증", () => {
  describe("compareWithOfficialText", () => {
    it("리서치 발췌문과 현행 재조회 원문이 동일하면 match=true", () => {
      const cited = "금전채무의 불이행에 대한 손해배상의 액은 법정이율에 의한다.";
      const official =
        "금전채무의 불이행에 대한 손해배상의 액은 법정이율에 의한다.";

      const result = compareWithOfficialText(cited, official);
      expect(result.match).toBe(true);
    });

    it("실질적 문언 차이를 감지한다 (민법 397조 사례)", () => {
      const cited =
        "금전채무의 불이행에 대한 손해배상의 액은 법정이율에 의한다.";
      const official =
        "금전채무불이행의 손해배상액은 법정이율에 의한다.";

      const result = compareWithOfficialText(cited, official);
      expect(result.match).toBe(false);
      expect(result.diff_type).toBeDefined();
    });

    it("공백·줄바꿈 차이만 있으면 whitespace_only로 분류한다", () => {
      const cited = "금전채무의 불이행에  대한 손해배상의 액은 법정이율에 의한다.";
      const official =
        "금전채무의 불이행에 대한 손해배상의 액은 법정이율에 의한다.";

      const result = compareWithOfficialText(cited, official);
      expect(result.diff_type).toBe("whitespace_only");
      expect(result.normalized_match).toBe(true);
    });

    it("조사 하나 차이도 substantive로 분류한다", () => {
      const cited = "금전채무의 불이행에 대한";
      const official = "금전채무불이행의";

      const result = compareWithOfficialText(cited, official);
      expect(result.diff_type).toBe("substantive");
    });
  });
});
