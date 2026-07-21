import { describe, it, expect } from "vitest";
import { formatRelative } from "@/lib/time";

const NOW = new Date("2026-07-21T12:00:00Z");

describe("formatRelative", () => {
  it.each([
    ["2026-07-21T11:59:40Z", "방금"],
    ["2026-07-21T11:48:00Z", "12분 전"],
    ["2026-07-21T09:00:00Z", "3시간 전"],
    ["2026-07-20T10:00:00Z", "어제"],
    ["2026-07-18T10:00:00Z", "3일 전"],
    ["2026-07-01T10:00:00Z", "2026-07-01"],
  ])("%s → %s", (iso, expected) => {
    expect(formatRelative(iso, NOW)).toBe(expected);
  });
});
