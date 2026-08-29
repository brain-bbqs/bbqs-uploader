// @vitest-environment jsdom
// Boots src/main.ts signed in (seeded settings, no callback) and drives the REAL upload path —
// mock mode stays off. The hash pool and per-file uploads are replaced with controllable fakes,
// so batches can be walked through every outcome (done/replaced/error/cancelled), the transfer
// report's assembly and failure handling, the post-warm-up ETA, planParts failures (Error and
// non-Error), and a mid-batch Reset with its late hash/upload stragglers.
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi, type MockInstance } from "vitest";
import { bootMain, el, fakeFolderFile, pickFolder } from "./helpers/mainHarness";
import { STORAGE_KEY } from "../../src/lib/settings";
import { ensureFreshToken, handleRedirectCallback } from "../../src/lib/oauth";
import { listIncomingDandisets } from "../../src/lib/dandisets";
import { fetchDraftMetadata } from "../../src/lib/humanSubjects";
import { renderIdentity } from "../../src/ui/connection";
import { listRemoteFiles } from "../../src/lib/remote-listing";
import { createHashPool } from "../../src/lib/etag-worker";
import { uploadFile, type UploadOutcome } from "../../src/ui/processFile";
import { uploadTransferReport, type TransferReport } from "../../src/lib/transfer-report";
import type { OAuthTokenSet } from "../../src/lib/types";

vi.mock("../../src/lib/oauth");
vi.mock("../../src/lib/dandisets");
vi.mock("../../src/ui/connection");
vi.mock("../../src/lib/etag-worker");
vi.mock("../../src/lib/humanSubjects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/humanSubjects")>()),
  fetchDraftMetadata: vi.fn(),
}));
vi.mock("../../src/lib/remote-listing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/remote-listing")>()),
  listRemoteFiles: vi.fn(),
}));
vi.mock("../../src/ui/processFile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/ui/processFile")>()),
  uploadFile: vi.fn(),
}));
vi.mock("../../src/lib/transfer-report", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/transfer-report")>()),
  uploadTransferReport: vi.fn(),
}));
vi.mock("../../src/lib/etag", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/etag")>();
  return {
    ...actual,
    // A 13-byte file stands in for a non-Error part-planning failure; everything else is real.
    planParts: vi.fn((fileSize: number) => {
      if (fileSize === 13) throw "cannot plan parts for the unlucky file";
      return actual.planParts(fileSize);
    }),
  };
});

const SEEDED_TOKENS: OAuthTokenSet = {
  accessToken: "seeded-access",
  refreshToken: "seeded-refresh",
  expiresAt: Number.MAX_SAFE_INTEGER,
};

/** One pending fake hash job the test resolves/rejects by hand. */
interface FakeHashCall {
  file: File;
  onProgress: (fraction: number) => void;
  resolve: (etag: string) => void;
}

const hashCalls: FakeHashCall[] = [];
const uploadProgressByName = new Map<string, (bytesDone: number) => void>();
let fakeNow = 10_000;
let warnSpy: MockInstance;

function hashCallFor(name: string): FakeHashCall {
  const call = hashCalls.find((c) => c.file.name === name);
  if (!call) throw new Error(`no hash call for ${name}`);
  return call;
}

async function flushFrame(): Promise<void> {
  await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  await new Promise((r) => setTimeout(r, 0));
}

beforeAll(async () => {
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("network disabled in test"))),
  );
  vi.spyOn(performance, "now").mockImplementation(() => fakeNow);
  // Two queue lanes keep the mid-batch Reset scenario deterministic.
  Object.defineProperty(navigator, "hardwareConcurrency", { value: 2, configurable: true });
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ dandisetId: "000123", oauth: SEEDED_TOKENS }));

  vi.mocked(handleRedirectCallback).mockResolvedValue(null);
  vi.mocked(ensureFreshToken).mockImplementation((tokens) => Promise.resolve(tokens));
  vi.mocked(renderIdentity).mockResolvedValue(undefined);
  vi.mocked(listIncomingDandisets).mockResolvedValue([
    { identifier: "000123", title: "Incoming: Real set", embargoed: true },
  ]);
  vi.mocked(fetchDraftMetadata).mockResolvedValue({});
  vi.mocked(listRemoteFiles).mockResolvedValue(new Map());
  vi.mocked(uploadTransferReport).mockResolvedValue(undefined);

  vi.mocked(createHashPool).mockReturnValue({
    hash: (file, _parts, onProgress, signal) =>
      new Promise<string>((resolve, reject) => {
        hashCalls.push({ file, onProgress, resolve });
        // r3.bin simulates a worker whose settle outlives the abort: Reset's abort is ignored
        // and the job later resolves against an already-forgotten file.
        if (file.name !== "r3.bin") {
          signal?.addEventListener("abort", () => reject(new DOMException("Upload cancelled.", "AbortError")), {
            once: true,
          });
        }
      }),
  });

  vi.mocked(uploadFile).mockImplementation(
    async (_row, file, _path, _cfg, activeUploads, _job, onUploadProgress): Promise<UploadOutcome> => {
      if (onUploadProgress) uploadProgressByName.set(file.name, onUploadProgress);
      switch (file.name) {
        case "ok1.bin":
        case "eta.bin":
          onUploadProgress?.(file.size);
          return "done";
        case "ok2.bin":
          onUploadProgress?.(file.size);
          return "replaced";
        case "can1.bin":
          onUploadProgress?.(40); // partial transfer before the (simulated) cancel
          return "cancelled";
        case "can0.bin":
          return "cancelled";
        case "r1.bin": {
          // Parks with a registered AbortController so Reset has an active upload to abort.
          const controller = new AbortController();
          activeUploads.add(controller);
          return new Promise<UploadOutcome>((resolve) => {
            controller.signal.addEventListener(
              "abort",
              () => {
                activeUploads.delete(controller);
                resolve("cancelled");
              },
              { once: true },
            );
          });
        }
        default:
          return "error";
      }
    },
  );

  await bootMain();
  await vi.waitFor(() => {
    expect(el("dandiset-single").hidden).toBe(false);
  });
});

describe("a real (non-mock) upload batch", () => {
  it("checks the archive when files are staged and reports the empty dataset", async () => {
    pickFolder([
      fakeFolderFile("ok1.bin", "base/ok1.bin", 64),
      fakeFolderFile("ok2.bin", "base/ok2.bin", 32),
      fakeFolderFile("bad1.bin", "base/bad1.bin", 16),
      fakeFolderFile("bad2.bin", "base/bad2.bin", 8),
      fakeFolderFile("can1.bin", "base/can1.bin", 100),
      fakeFolderFile("can0.bin", "base/can0.bin", 50),
      fakeFolderFile("empty.bin", "base/empty.bin", 0),
      fakeFolderFile("unlucky.bin", "base/unlucky.bin", 13),
    ]);
    await vi.waitFor(() => {
      expect(el("remote-banner-title").textContent).toBe("Nothing uploaded yet");
    });
    expect(listRemoteFiles).toHaveBeenCalled();
    expect(el("remote-banner-body").textContent).toBe("This dataset is currently empty.");
  });

  it("tallies every outcome across the batch", async () => {
    el("upload-all-btn").click();
    // Six plannable files reach the pool; empty.bin (planParts throws an Error) and
    // unlucky.bin (planParts throws a string) reject up front instead.
    await vi.waitFor(() => {
      expect(hashCalls).toHaveLength(6);
    });
    for (const call of hashCalls) call.resolve(`etag-${call.file.name}`);

    await vi.waitFor(() => {
      expect(el("progress-footer-left").textContent).toBe("1 done, 4 errors, 2 cancelled");
    });
    expect(el("progress-footer-mid").textContent).toBe("1 replaced");
    expect(el("progress-hash-files").textContent).toContain("6");
  });

  it("uploads a transfer report describing the whole batch", async () => {
    await vi.waitFor(() => {
      expect(uploadTransferReport).toHaveBeenCalledTimes(1);
    });
    const report = vi.mocked(uploadTransferReport).mock.calls[0][1] as TransferReport;
    expect(report.dandisetId).toBe("000123");
    expect(report.schemaVersion).toBe("1.0.0");
    expect(report.summary).toMatchObject({ totalBytes: 283, filesTotal: 8, filesDone: 2, filesErrored: 4 });
    expect(report.files).toHaveLength(8);

    const byName = new Map(report.files.map((f) => [f.path.split("/").pop(), f]));
    expect(byName.get("ok1.bin")).toMatchObject({ status: "done", sizeBytes: 64 });
    // The frozen clock makes every recorded duration 0, so rates settle to 0 MBps.
    expect(byName.get("ok1.bin")!.checksum).toMatchObject({ MBps: 0 });
    expect(byName.get("ok1.bin")!.upload).toMatchObject({ MBps: 0 });
    expect(byName.get("ok2.bin")!.status).toBe("replaced");
    // A cancel with partial transfer still records its achieved rate; one without stays null.
    expect(byName.get("can1.bin")!.upload).toMatchObject({ MBps: 0 });
    expect(byName.get("can0.bin")!.upload).toBeNull();
    expect(byName.get("empty.bin")).toMatchObject({ status: "error", checksum: null });
    expect(byName.get("unlucky.bin")!.status).toBe("error");
  });

  it("shows a concrete ETA once the hash phase has warmed up past its estimating window", async () => {
    vi.mocked(uploadTransferReport).mockRejectedValueOnce(new Error("report refused"));
    pickFolder([fakeFolderFile("eta.bin", "base2/eta.bin", 1000)]);
    await vi.waitFor(() => {
      expect(el("upload-all-btn").textContent).toContain("Upload 1 file (");
    });
    el("upload-all-btn").click();
    await vi.waitFor(() => {
      expect(hashCalls.some((c) => c.file.name === "eta.bin")).toBe(true);
    });

    // Walk the clock well past the 30s warm-up while feeding steady progress; the ETA chip must
    // leave "estimating…"/"—" for a real time-left figure while the scan is still running.
    const call = hashCallFor("eta.bin");
    for (const [minutes, fraction] of [
      [40, 0.1],
      [41, 0.3],
      [42, 0.5],
      [43, 0.7],
    ] as const) {
      fakeNow = minutes * 1000 + 10_000;
      call.onProgress(fraction);
      await flushFrame();
    }
    const eta = el("progress-hash-eta").textContent!;
    expect(["—", "estimating…", "done", ""]).not.toContain(eta);

    call.resolve("etag-eta.bin");
    await vi.waitFor(() => {
      expect(el("progress-footer-left").textContent).toBe("2 done, 4 errors, 2 cancelled");
    });
  });

  it("only warns when the transfer report upload fails", async () => {
    await vi.waitFor(() => {
      expect(uploadTransferReport).toHaveBeenCalledTimes(2);
    });
    await vi.waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith("Failed to upload transfer report:", expect.any(Error));
    });
    // The second report covers the whole session so far: 8 earlier files + eta.bin.
    const report = vi.mocked(uploadTransferReport).mock.calls[1][1] as TransferReport;
    expect(report.files).toHaveLength(9);
  });

  it("Reset mid-batch abandons the queue and ignores every straggler", async () => {
    pickFolder([
      fakeFolderFile("r1.bin", "base3/r1.bin", 10),
      fakeFolderFile("r2.bin", "base3/r2.bin", 20),
      fakeFolderFile("r3.bin", "base3/r3.bin", 30),
    ]);
    await vi.waitFor(() => {
      expect(el("upload-all-btn").textContent).toContain("Upload 3 files (");
    });
    el("upload-all-btn").click();
    await vi.waitFor(() => {
      expect(hashCalls.filter((c) => ["r1.bin", "r2.bin", "r3.bin"].includes(c.file.name))).toHaveLength(3);
    });
    // Lane 1 finishes r1's scan and parks inside its (abortable) upload; lane 2 waits on r2.
    hashCallFor("r1.bin").resolve("etag-r1.bin");
    await vi.waitFor(() => {
      expect(uploadProgressByName.has("r1.bin")).toBe(true);
    });

    el("reset-all-btn").click();

    // Everything visible is gone immediately…
    expect(document.querySelectorAll("#file-list .file-item")).toHaveLength(0);
    expect(el("progress-summary").hidden).toBe(true);
    expect(el("files-card").hidden).toBe(true);

    // …and the stragglers land harmlessly: a late scan tick, a late upload tick, and a hash
    // settling for a file the reset already forgot (its abort was deliberately ignored).
    hashCallFor("r2.bin").onProgress(0.5);
    uploadProgressByName.get("r1.bin")!(5);
    hashCallFor("r3.bin").resolve("etag-r3.bin");
    await new Promise((r) => setTimeout(r, 25));

    expect(document.querySelectorAll("#file-list .file-item")).toHaveLength(0);
    // The reset batch produced no additional transfer report (its stats were wiped).
    expect(uploadTransferReport).toHaveBeenCalledTimes(2);
  });

  it("labels a folder pick that has no folder name at all", async () => {
    pickFolder([new File(["x"], "loose.bin")]);
    await vi.waitFor(() => {
      expect(el("folder-summary").hidden).toBe(false);
    });
    expect(el("folder-summary-name").textContent).toBe("Selected folder");
  });
});
