import { describe, it, expect } from "vitest";
import {
  checkCitationCurrency,
  type CitationMetadata,
} from "@/lib/citations/citation-validator";

describe("D-03: 현행성 검증 (stale citation 감지)", () => {
  describe("checkCitationCurrency", () => {
    it("핀 시행일과 현행 시행일이 동일하면 CURRENT", () => {
      const metadata: CitationMetadata = {
        citation_id: "CIT-001",
        law_name: "민법",
        article: "제397조",
        effective_date: "2026-01-16",
        official_source_id: "MST:001622",
        retrieved_at: "2026-09-16",
        text_hash: "abc123",
        verification_status: "verified",
      };

      const result = checkCitationCurrency(metadata, "2026-01-16");
      expect(result.current).toBe(true);
      expect(result.status).toBe("CURRENT");
    });

    it("핀 시행일과 현행 시행일이 다르면 STALE_CITATION (소촉법 사례)", () => {
      const metadata: CitationMetadata = {
        citation_id: "CIT-002",
        law_name: "소송촉진 등에 관한 특례법",
        article: "제3조",
        effective_date: "2024-07-04",
        official_source_id: "MST:002660",
        retrieved_at: "2026-09-16",
        text_hash: "def456",
        verification_status: "verified",
      };

      const result = checkCitationCurrency(metadata, "2026-06-02");
      expect(result.current).toBe(false);
      expect(result.status).toBe("STALE_CITATION");
      expect(result.stored_date).toBe("2024-07-04");
      expect(result.live_date).toBe("2026-06-02");
    });

    it("현행 시행일이 핀 시행일보다 이후이면 개정 가능성 → STALE", () => {
      const metadata: CitationMetadata = {
        citation_id: "CIT-003",
        law_name: "테스트법",
        article: "제1조",
        effective_date: "2024-01-01",
        official_source_id: "MST:999999",
        retrieved_at: "2026-09-16",
        text_hash: "ghi789",
        verification_status: "verified",
      };

      const result = checkCitationCurrency(metadata, "2025-06-01");
      expect(result.current).toBe(false);
      expect(result.status).toBe("STALE_CITATION");
    });

    it("동일 시행일이면 current=true", () => {
      const metadata: CitationMetadata = {
        citation_id: "CIT-004",
        law_name: "테스트법",
        article: "제2조",
        effective_date: "2025-06-01",
        official_source_id: "MST:888888",
        retrieved_at: "2026-09-16",
        text_hash: "jkl012",
        verification_status: "verified",
      };

      const result = checkCitationCurrency(metadata, "2025-06-01");
      expect(result.current).toBe(true);
      expect(result.status).toBe("CURRENT");
    });
  });
});
