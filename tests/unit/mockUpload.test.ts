import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateMockDroppedFiles,
  mockPhaseDurationMs,
  simulateProgress,
  MOCK_FILE_MAX_SIZE,
  MOCK_FILE_MIN_SIZE,
} from "../../src/lib/mockUpload";

describe("generateMockDroppedFiles", () => {
  it("returns exactly `count` entries", () => {
    const entries = generateMockDroppedFiles(25);
    expect(entries).toHaveLength(25);
  });

  it("returns nothing for a zero count", () => {
    const entries = generateMockDroppedFiles(0);
    expect(entries).toHaveLength(0);
  });

  it("keeps every fake file's reported size within [MOCK_FILE_MIN_SIZE, MOCK_FILE_MAX_SIZE]", () => {
    const entries = generateMockDroppedFiles(200);
    for (const entry of entries) {
      expect(entry.file.size).toBeGreaterThanOrEqual(MOCK_FILE_MIN_SIZE);
      expect(entry.file.size).toBeLessThanOrEqual(MOCK_FILE_MAX_SIZE);
    }
  });

  it("spreads sizes across the range rather than clustering near one end", () => {
    const entries = generateMockDroppedFiles(200);
    const midpoint = (MOCK_FILE_MIN_SIZE + MOCK_FILE_MAX_SIZE) / 2;
    const aboveMidpoint = entries.filter((e) => e.file.size > midpoint).length;
    // A uniform draw over 200 samples should land roughly half above the midpoint; a generous
    // band (20-80%) keeps this from being a flaky test while still catching a badly skewed draw.
    expect(aboveMidpoint).toBeGreaterThan(40);
    expect(aboveMidpoint).toBeLessThan(160);
  });

  it("gives every file a non-empty name with an extension", () => {
    const entries = generateMockDroppedFiles(50);
    for (const entry of entries) {
      expect(entry.file.name).toMatch(/^[\w-]+\.\w+$/);
    }
  });

  it("nests at least some files under a folder path", () => {
    const entries = generateMockDroppedFiles(50);
    expect(entries.some((e) => e.relativePath !== "")).toBe(true);
  });
});

describe("mockPhaseDurationMs", () => {
  it("never animates faster than the minimum, even for tiny files", () => {
    expect(mockPhaseDurationMs(1)).toBe(600);
    expect(mockPhaseDurationMs(1024 * 1024)).toBe(600);
  });

  it("caps the animation length so even a 100 GB fake file finishes in seconds", () => {
    expect(mockPhaseDurationMs(MOCK_FILE_MAX_SIZE)).toBe(3000);
  });

  it("grows with the logarithm of the size in between", () => {
    const small = mockPhaseDurationMs(64 * 1024 * 1024);
    const large = mockPhaseDurationMs(1024 * 1024 * 1024);
    expect(small).toBeGreaterThan(600);
    expect(large).toBeGreaterThan(small);
    expect(large).toBeLessThan(3000);
    // Doubling the size adds a fixed 200ms step (log2 scaling).
    expect(mockPhaseDurationMs(128 * 1024 * 1024) - small).toBeCloseTo(200, 5);
  });
});

describe("simulateProgress", () => {
  // Node has no requestAnimationFrame; a timer-based stand-in drives the ticks.
  function stubFrames(): void {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 1));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ticks monotonically up to exactly totalBytes, then resolves", async () => {
    stubFrames();
    const reported: number[] = [];

    await simulateProgress(1000, 30, new AbortController().signal, (b) => reported.push(b));

    expect(reported[reported.length - 1]).toBe(1000);
    expect(reported.every((b, i) => i === 0 || b >= reported[i - 1])).toBe(true);
  });

  it("rejects with an AbortError immediately when the signal is already aborted", async () => {
    stubFrames();
    const controller = new AbortController();
    controller.abort();
    const onProgress = vi.fn();

    const err = await simulateProgress(1000, 30, controller.signal, onProgress).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DOMException);
    expect((err as DOMException).name).toBe("AbortError");
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("stops mid-animation and rejects with an AbortError when cancelled", async () => {
    stubFrames();
    const controller = new AbortController();
    const reported: number[] = [];

    const promise = simulateProgress(1000, 60_000, controller.signal, (b) => reported.push(b));
    const settled = promise.catch((e: unknown) => e);
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();
    const ticksAtAbort = reported.length;
    await new Promise((r) => setTimeout(r, 10));

    const err = await settled;
    expect(err).toBeInstanceOf(DOMException);
    expect((err as DOMException).name).toBe("AbortError");
    // The animation genuinely stopped: no further ticks after the abort.
    expect(reported.length).toBe(ticksAtAbort);
    expect(reported[reported.length - 1] ?? 0).toBeLessThan(1000);
  });
});
