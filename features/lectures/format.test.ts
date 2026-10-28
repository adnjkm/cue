import { describe, expect, it } from "vitest";
import { isoDuration, spokenDuration } from "./format";

describe("isoDuration", () => {
  it.each([
    [0, "PT0M0S"],
    [45_000, "PT0M45S"],
    [2_000_000, "PT33M20S"],
    [2_292_999, "PT38M12S"],
    [3_720_000, "PT62M0S"],
  ])("writes %i ms as %s", (ms, iso) => {
    expect(isoDuration(ms)).toBe(iso);
  });
});

describe("spokenDuration", () => {
  it.each([
    [2_292_000, "38 minutes 12 seconds"],
    [3_000_000, "50 minutes"],
    [3_720_000, "1 hour 2 minutes"],
    [1_000, "1 second"],
    [0, "0 seconds"],
  ])("says %i ms as %s", (ms, said) => {
    expect(spokenDuration(ms)).toBe(said);
  });
});
