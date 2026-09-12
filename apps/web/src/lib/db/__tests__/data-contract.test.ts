import { describe, it, expect } from "vitest";
import { Constants } from "@/lib/db/database.types";
import { listDocumentTypes } from "@/lib/agent/document-types";

const EXPECTED_ROUND_KINDS = [
  "소장",
  "준비서면",
  "내용증명",
  "가압류신청서",
  "가처분신청서",
  "강제집행신청서",
  "등기신청서_소유권이전",
  "등기신청서_근저당설정",
  "등기신청서_법인변경",
  "개인회생신청서",
  "파산면책신청서",
] as const;

const EXPECTED_AUTHOR_MODES = ["lawyer", "judicial_scrivener"] as const;

describe("P5.5-5A data contract", () => {
  describe("round_kind enum", () => {
    it("has exactly 11 values", () => {
      expect(Constants.public.Enums.round_kind).toHaveLength(11);
    });

    it("contains all registry document type IDs", () => {
      const dbKinds = new Set(Constants.public.Enums.round_kind);
      for (const id of EXPECTED_ROUND_KINDS) {
        expect(dbKinds.has(id)).toBe(true);
      }
    });

    it("matches registry IDs exactly (no extras)", () => {
      const registryIds = listDocumentTypes().map((t) => t.id);
      const dbKinds = [...Constants.public.Enums.round_kind];
      expect(new Set(dbKinds)).toEqual(new Set(registryIds));
    });
  });

  describe("author_mode enum", () => {
    it("exists with exactly 2 values", () => {
      const enums = Constants.public.Enums as Record<string, readonly string[]>;
      expect(enums.author_mode).toBeDefined();
      expect(enums.author_mode).toHaveLength(2);
    });

    it("contains lawyer and judicial_scrivener only", () => {
      const enums = Constants.public.Enums as Record<string, readonly string[]>;
      expect(new Set(enums.author_mode)).toEqual(new Set(EXPECTED_AUTHOR_MODES));
    });

    it("never contains paralegal", () => {
      const enums = Constants.public.Enums as Record<string, readonly string[]>;
      if (enums.author_mode) {
        expect(enums.author_mode).not.toContain("paralegal");
      }
    });
  });

  describe("registry ↔ DB consistency", () => {
    it("every registry type ID is a valid round_kind", () => {
      const dbKinds = new Set<string>(Constants.public.Enums.round_kind);
      for (const t of listDocumentTypes()) {
        expect(dbKinds.has(t.id)).toBe(true);
      }
    });

    it("every registry author mode is a valid author_mode enum value", () => {
      const enums = Constants.public.Enums as Record<string, readonly string[]>;
      const dbModes = new Set(enums.author_mode ?? []);
      for (const t of listDocumentTypes()) {
        for (const m of t.supportedAuthorModes) {
          expect(dbModes.has(m)).toBe(true);
        }
      }
    });

    it("sub-outputs are not round_kind values", () => {
      const subOutputIds = ["채권자목록", "재산목록", "수입지출목록", "변제계획안"];
      const dbKinds = new Set<string>(Constants.public.Enums.round_kind);
      for (const sub of subOutputIds) {
        expect(dbKinds.has(sub)).toBe(false);
      }
    });
  });
});
