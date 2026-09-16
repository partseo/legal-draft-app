import { describe, it, expect } from "vitest";
import {
  extractLawReferences,
  validateClaimCitationLinks,
  hasInternalPins,
  type CitationMetadata,
} from "@/lib/citations/citation-validator";

describe("D-01: 청구취지 citation metadata 연결", () => {
  const sampleMetadata: CitationMetadata[] = [
    {
      citation_id: "CIT-001",
      law_name: "소송촉진 등에 관한 특례법",
      article: "제3조",
      effective_date: "2026-06-02",
      official_source_id: "MST:002660",
      retrieved_at: "2026-09-16",
      text_hash: "abc123",
      verification_status: "verified",
    },
    {
      citation_id: "CIT-002",
      law_name: "민법",
      article: "제397조",
      effective_date: "2026-01-16",
      official_source_id: "MST:001622",
      retrieved_at: "2026-09-16",
      text_hash: "def456",
      verification_status: "verified",
    },
  ];

  describe("extractLawReferences", () => {
    it("청구취지 텍스트에서 법령 인용을 추출한다", () => {
      const text =
        "소송촉진 등에 관한 특례법이 정한 이율에 의한 금원을 지급하라";
      const refs = extractLawReferences(text);
      expect(refs.length).toBeGreaterThan(0);
    });

    it("민법 제397조 인용을 추출한다", () => {
      const text = "민법 제397조에 따른 지연손해금";
      const refs = extractLawReferences(text);
      expect(refs).toContain("민법 제397조");
    });
  });

  describe("validateClaimCitationLinks", () => {
    it("청구취지에 법령 인용이 있으면 citation metadata와 연결되어야 한다", () => {
      const claims = [
        "피고는 원고에게 50,000,000원 및 이에 대하여 2025. 7. 1.부터 이 사건 소장부본 송달일까지는 민법 제397조가 정한 연 5%의, 그 다음날부터 다 갚는 날까지는 소송촉진 등에 관한 특례법 제3조가 정한 이율에 의한 금원을 지급하라.",
      ];

      const result = validateClaimCitationLinks(claims, sampleMetadata);

      expect(result.valid).toBe(true);
      expect(result.unlinked_references).toHaveLength(0);
      expect(result.linked_count).toBeGreaterThanOrEqual(2);
    });

    it("citation metadata가 없으면 FAIL", () => {
      const claims = [
        "소송촉진 등에 관한 특례법 제3조가 정한 이율에 의한 금원을 지급하라.",
      ];

      const result = validateClaimCitationLinks(claims, []);

      expect(result.valid).toBe(false);
      expect(result.unlinked_references.length).toBeGreaterThan(0);
    });

    it("법령명을 '법률이 정한 이율'로 일반화해 검증을 피하면 FAIL", () => {
      const claims = ["법률이 정한 이율에 의한 금원을 지급하라."];
      const claimsWithSpecific = [
        "소송촉진 등에 관한 특례법 제3조가 정한 이율에 의한 금원을 지급하라.",
      ];

      const resultGeneral = validateClaimCitationLinks(claims, []);
      const resultSpecific = validateClaimCitationLinks(
        claimsWithSpecific,
        [],
      );

      expect(resultSpecific.valid).toBe(false);
    });
  });

  describe("hasInternalPins", () => {
    it("법원 제출용 청구취지 본문에 내부 개발용 pin을 노출하지 않음", () => {
      const courtText =
        "피고는 원고에게 50,000,000원 및 이에 대하여 소송촉진 등에 관한 특례법이 정한 이율에 의한 금원을 지급하라.";
      expect(hasInternalPins(courtText)).toBe(false);
    });

    it("내부 핀 형식을 감지한다", () => {
      const textWithPin =
        "소송촉진 등에 관한 특례법 [출처: MST:002660] 이율";
      expect(hasInternalPins(textWithPin)).toBe(true);
    });

    it("MST: 패턴을 감지한다", () => {
      const textWithMST = "소촉법 제3조 MST:002660 참조";
      expect(hasInternalPins(textWithMST)).toBe(true);
    });
  });
});
