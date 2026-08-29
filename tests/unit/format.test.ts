import { describe, expect, it } from "vitest";
import { bytesPerSecToMBps, friendlyEta, humanSize, initialsFrom } from "../../src/lib/format";

describe("bytesPerSecToMBps", () => {
  it("converts using decimal (1 MB = 1,000,000 B) megabytes", () => {
    expect(bytesPerSecToMBps(1_000_000)).toBe(1);
    expect(bytesPerSecToMBps(12_500_000)).toBe(12.5);
    expect(bytesPerSecToMBps(0)).toBe(0);
  });

  it("rounds to two decimal places", () => {
    expect(bytesPerSecToMBps(1_234_567)).toBe(1.23);
  });
});

describe("humanSize", () => {
  it("formats bytes with the right unit", () => {
    expect(humanSize(500)).toBe("500 B");
    expect(humanSize(1536)).toBe("1.5 KB");
    expect(humanSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("friendlyEta", () => {
  it("keeps very short estimates vague", () => {
    expect(friendlyEta(0)).toBe("a few seconds");
    expect(friendlyEta(9)).toBe("a few seconds");
  });

  it("rounds sub-minute estimates to 5 seconds", () => {
    expect(friendlyEta(12)).toBe("~10 seconds");
    expect(friendlyEta(42)).toBe("~40 seconds");
  });

  it("promotes near-minute and sub-hour estimates to minutes", () => {
    expect(friendlyEta(58)).toBe("~1 minute");
    expect(friendlyEta(170)).toBe("~3 minutes");
    expect(friendlyEta(59.4 * 60)).toBe("~59 minutes");
  });

  it("formats hour-scale estimates as hours and minutes", () => {
    expect(friendlyEta(59.5 * 60)).toBe("~1 hour");
    expect(friendlyEta(3650)).toBe("~1 hour 1 minute");
    expect(friendlyEta(3900)).toBe("~1 hour 5 minutes");
    expect(friendlyEta(2 * 3600)).toBe("~2 hours");
  });

  it("caps very large estimates instead of displaying an unbounded hour count", () => {
    expect(friendlyEta(12 * 3600)).toBe("> 12 hours");
    expect(friendlyEta(30 * 3600)).toBe("> 12 hours");
    expect(friendlyEta(11 * 3600)).toBe("~11 hours");
  });

  it("falls back to a placeholder for non-finite or negative input", () => {
    expect(friendlyEta(NaN)).toBe("—");
    expect(friendlyEta(Infinity)).toBe("—");
    expect(friendlyEta(-5)).toBe("—");
  });
});

describe("initialsFrom", () => {
  it("takes the first letter of the first and last word, matching the main archive's convention", () => {
    expect(initialsFrom("Cody Baker")).toBe("CB");
    expect(initialsFrom("Cody C Baker")).toBe("CB");
    expect(initialsFrom("  cody   baker  ")).toBe("CB");
  });

  it("falls back to '??' for an empty or single-word name", () => {
    expect(initialsFrom("")).toBe("??");
    expect(initialsFrom("cbaker")).toBe("??");
  });
});
