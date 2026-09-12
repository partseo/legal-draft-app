import { describe, it, expect } from "vitest";
import {
  listDocumentTypes,
  getDocumentType,
  getSelectableDocumentTypes,
  getDocumentLabel,
  DEFAULT_ROUND_KIND,
} from "@/lib/agent/document-types";
import { Constants } from "@/lib/db/database.types";

// P5.5-5C — Document Type Selection Tests
// These tests verify the minimal wiring needed to connect the 11 registered
// document types to the UI selector and case/round creation flow.

describe("P5.5-5C: Document Type Selection", () => {
  // ─── 1. Selectable types ───────────────────────────────────────────

  describe("getSelectableDocumentTypes()", () => {
    it("returns exactly 11 top-level document types", () => {
      const types = getSelectableDocumentTypes();
      expect(types).toHaveLength(11);
    });

    it("returns objects with id and label", () => {
      const types = getSelectableDocumentTypes();
      for (const t of types) {
        expect(t).toHaveProperty("id");
        expect(t).toHaveProperty("label");
        expect(t.id).toBeTruthy();
        expect(t.label).toBeTruthy();
      }
    });

    it("includes all 11 registry IDs", () => {
      const ids = getSelectableDocumentTypes().map((t) => t.id);
      const registryIds = listDocumentTypes().map((t) => t.id);
      expect(ids).toEqual(registryIds);
    });

    it("matches DB round_kind enum exactly", () => {
      const selectableIds = new Set(getSelectableDocumentTypes().map((t) => t.id));
      const dbKinds = new Set<string>(Constants.public.Enums.round_kind);
      expect(selectableIds).toEqual(dbKinds);
    });

    it("does NOT filter by existingWebSupport", () => {
      const types = getSelectableDocumentTypes();
      const nonWebTypes = types.filter((t) => {
        const full = getDocumentType(t.id);
        return full && !full.existingWebSupport;
      });
      expect(nonWebTypes.length).toBeGreaterThan(0);
    });
  });

  // ─── 2. Document label resolution ──────────────────────────────────

  describe("getDocumentLabel()", () => {
    it("returns label for 소장", () => {
      expect(getDocumentLabel("소장")).toBe("소장");
    });

    it("returns label for 준비서면", () => {
      expect(getDocumentLabel("준비서면")).toBe("준비서면");
    });

    it("returns label for 등기신청서_소유권이전 (parenthetical)", () => {
      expect(getDocumentLabel("등기신청서_소유권이전")).toBe("등기신청서 (소유권이전)");
    });

    it("returns label for every registered type", () => {
      for (const t of listDocumentTypes()) {
        const label = getDocumentLabel(t.id);
        expect(label).toBe(t.label);
      }
    });

    it("returns undefined for unknown type", () => {
      expect(getDocumentLabel("존재하지않는유형")).toBeUndefined();
    });

    it("returns undefined for sub-output types", () => {
      expect(getDocumentLabel("채권자목록")).toBeUndefined();
      expect(getDocumentLabel("재산목록")).toBeUndefined();
    });
  });

  // ─── 3. Default round kind ─────────────────────────────────────────

  describe("DEFAULT_ROUND_KIND", () => {
    it("is 소장 (backward compatibility)", () => {
      expect(DEFAULT_ROUND_KIND).toBe("소장");
    });

    it("is a valid document type", () => {
      expect(getDocumentType(DEFAULT_ROUND_KIND)).toBeDefined();
    });

    it("is a valid DB round_kind", () => {
      const dbKinds = new Set<string>(Constants.public.Enums.round_kind);
      expect(dbKinds.has(DEFAULT_ROUND_KIND)).toBe(true);
    });
  });

  // ─── 4. Draft title resolution (replaces hardcoded ternary) ────────

  describe("draft title from Registry label", () => {
    it("소장 → 소장 초안", () => {
      expect(`${getDocumentLabel("소장")} 초안`).toBe("소장 초안");
    });

    it("준비서면 → 준비서면 초안", () => {
      expect(`${getDocumentLabel("준비서면")} 초안`).toBe("준비서면 초안");
    });

    it("내용증명 → 내용증명 초안", () => {
      expect(`${getDocumentLabel("내용증명")} 초안`).toBe("내용증명 초안");
    });

    it("가압류신청서 → 가압류신청서 초안", () => {
      expect(`${getDocumentLabel("가압류신청서")} 초안`).toBe("가압류신청서 초안");
    });

    it("등기신청서_소유권이전 → 등기신청서 (소유권이전) 초안", () => {
      expect(`${getDocumentLabel("등기신청서_소유권이전")} 초안`).toBe("등기신청서 (소유권이전) 초안");
    });

    it("개인회생신청서 → 개인회생신청서 초안", () => {
      expect(`${getDocumentLabel("개인회생신청서")} 초안`).toBe("개인회생신청서 초안");
    });

    it("파산면책신청서 → 파산면책신청서 초안", () => {
      expect(`${getDocumentLabel("파산면책신청서")} 초안`).toBe("파산면책신청서 초안");
    });

    it("all 11 types produce valid draft titles", () => {
      for (const t of listDocumentTypes()) {
        const title = `${getDocumentLabel(t.id)} 초안`;
        expect(title).not.toContain("undefined");
        expect(title.endsWith(" 초안")).toBe(true);
      }
    });
  });

  // ─── 5. Registry alignment ─────────────────────────────────────────

  describe("registry alignment", () => {
    it("getSelectableDocumentTypes uses listDocumentTypes (not a separate array)", () => {
      const selectable = getSelectableDocumentTypes();
      const registry = listDocumentTypes();
      expect(selectable.length).toBe(registry.length);
      for (let i = 0; i < selectable.length; i++) {
        expect(selectable[i].id).toBe(registry[i].id);
        expect(selectable[i].label).toBe(registry[i].label);
      }
    });

    it("getDocumentLabel is consistent with getDocumentType", () => {
      for (const t of listDocumentTypes()) {
        expect(getDocumentLabel(t.id)).toBe(getDocumentType(t.id)?.label);
      }
    });
  });
});
