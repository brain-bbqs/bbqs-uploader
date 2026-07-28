// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPart } from "../../src/lib/etag";
import type { HashWorkerRequest, HashWorkerResponse } from "../../src/lib/etag-worker";
import type { FilePart } from "../../src/lib/types";

// In jsdom, `self` is the window, so the worker script wires itself onto window.onmessage and
// posts its responses through window.postMessage — both interceptable from the test.

let posted: HashWorkerResponse[];

function send(msg: HashWorkerRequest): void {
  window.onmessage!({ data: msg } as MessageEvent<HashWorkerRequest>);
}

async function repliesFor(requestId: number, type: HashWorkerResponse["type"]): Promise<HashWorkerResponse> {
  await vi.waitFor(() => {
    expect(posted.some((m) => m.requestId === requestId && m.type === type)).toBe(true);
  });
  return posted.find((m) => m.requestId === requestId && m.type === type)!;
}

beforeEach(async () => {
  vi.resetModules();
  vi.restoreAllMocks();
  posted = [];
  vi.spyOn(window, "postMessage").mockImplementation((msg) => {
    posted.push(msg as HashWorkerResponse);
  });
  await import("../../src/workers/etag.worker");
});

// jsdom's Blob has no arrayBuffer(); Node's File implements the full interface hashPart needs.
import { File as NodeFile } from "node:buffer";
const file = new NodeFile([new Uint8Array(64).map((_, i) => i)], "data.bin") as unknown as File;
const part: FilePart = { number: 1, offset: 0, size: 64 };

describe("etag.worker", () => {
  it("hashes a part, streaming progress before the digest", async () => {
    send({ type: "hash-part", requestId: 1, file, part });

    const done = await repliesFor(1, "done");
    expect((done as { digest: Uint8Array }).digest).toEqual(await hashPart(file, part, () => {}));
    const progress = posted.filter((m) => m.type === "progress");
    expect(progress.length).toBeGreaterThan(0);
    expect((progress[progress.length - 1] as { bytesDone: number }).bytesDone).toBe(64);
  });

  it("acknowledges a cancel that arrives before the part is processed", async () => {
    send({ type: "cancel", requestId: 2 });
    send({ type: "hash-part", requestId: 2, file, part });

    await repliesFor(2, "cancelled");
    expect(posted.filter((m) => m.type === "done")).toHaveLength(0);
    expect(posted.filter((m) => m.type === "progress")).toHaveLength(0);
  });

  it("hashes a later request under a previously cancelled id normally", async () => {
    send({ type: "cancel", requestId: 3 });
    send({ type: "hash-part", requestId: 3, file, part });
    await repliesFor(3, "cancelled");

    // The cancel is consumed by the first request; the id is reusable afterwards.
    send({ type: "hash-part", requestId: 3, file, part });
    await repliesFor(3, "done");
  });

  it("reports an error message when hashing fails", async () => {
    // A part claiming more bytes than the file has triggers the changed-on-disk guard.
    send({ type: "hash-part", requestId: 4, file, part: { number: 1, offset: 0, size: 128 } });

    const error = await repliesFor(4, "error");
    expect((error as { message: string }).message).toMatch(/File changed on disk/);
  });
});
