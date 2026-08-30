import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHashPool } from "../../src/lib/etag-worker";
import type { HashWorkerRequest, HashWorkerResponse } from "../../src/lib/etag-worker";
import { hashPart, combineDigests } from "../../src/lib/etag";
import type { CachedDigests, ChecksumCache } from "../../src/lib/checksum-cache";
import type { FilePart } from "../../src/lib/types";

/**
 * Stands in for the real hashing Worker: it queues hash-part requests until the test drives them
 * to completion (with real digests via hashPart, so results are checkable against the sequential
 * oracle), acks cancels immediately, and can be told to fail a part instead.
 */
class FakeWorker {
  static instances: FakeWorker[] = [];
  private listener: ((e: { data: HashWorkerResponse }) => void) | null = null;
  pending = new Map<number, { file: File; part: FilePart }>();

  constructor() {
    FakeWorker.instances.push(this);
  }

  addEventListener(_type: string, cb: (e: { data: HashWorkerResponse }) => void): void {
    this.listener = cb;
  }

  postMessage(msg: HashWorkerRequest): void {
    if (msg.type === "cancel") {
      this.pending.delete(msg.requestId);
      this.emit({ type: "cancelled", requestId: msg.requestId });
    } else {
      this.pending.set(msg.requestId, { file: msg.file, part: msg.part });
    }
  }

  private emit(data: HashWorkerResponse): void {
    this.listener?.({ data });
  }

  /** Injects an arbitrary response, standing in for late or out-of-order worker messages. */
  emitRaw(data: HashWorkerResponse): void {
    this.emit(data);
  }

  /** The requestId of the oldest pending part, for hand-crafting responses to it. */
  oldestRequestId(): number {
    const next = this.pending.keys().next();
    if (next.done) throw new Error("no pending part");
    return next.value;
  }

  /** Hashes the oldest pending part for real and reports progress + done. */
  async completeNext(): Promise<boolean> {
    const next = this.pending.entries().next();
    if (next.done) return false;
    const [requestId, { file, part }] = next.value;
    this.pending.delete(requestId);
    const digest = await hashPart(file, part, (bytesDone) => this.emit({ type: "progress", requestId, bytesDone }));
    this.emit({ type: "done", requestId, digest });
    return true;
  }

  failNext(message: string): void {
    const next = this.pending.keys().next();
    if (next.done) throw new Error("no pending part to fail");
    this.pending.delete(next.value);
    this.emit({ type: "error", requestId: next.value, message });
  }

  static pendingCount(): number {
    return FakeWorker.instances.reduce((n, w) => n + w.pending.size, 0);
  }
}

/** Keeps completing parts across all workers (the pool re-pumps on each completion) until idle. */
async function drain(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0)); // let any cache lookups start their jobs
  for (;;) {
    let progressed = false;
    for (const worker of FakeWorker.instances) {
      while (await worker.completeNext()) progressed = true;
    }
    if (!progressed) return;
  }
}

function makeFile(size: number): File {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = (i * 7) % 256;
  return new File([bytes], "data.bin");
}

function makeParts(sizes: number[]): FilePart[] {
  let offset = 0;
  return sizes.map((size, i) => {
    const part = { number: i + 1, offset, size };
    offset += size;
    return part;
  });
}

/** Sequential reference: the etag and per-part digests the pool must reproduce. */
async function oracle(file: File, parts: FilePart[]): Promise<{ etag: string; digests: Uint8Array }> {
  const digests = new Uint8Array(parts.length * 16);
  for (const part of parts) {
    digests.set(await hashPart(file, part, () => {}), (part.number - 1) * 16);
  }
  return { etag: combineDigests(digests, parts.length), digests };
}

function fakeCache(get: (key: string, parts: FilePart[]) => Promise<CachedDigests | null>): ChecksumCache {
  return {
    get: vi.fn(get),
    putPart: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    discard: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  };
}

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createHashPool", () => {
  it("hashes a multi-part file across workers and matches the sequential oracle", async () => {
    const file = makeFile(300);
    const parts = makeParts([100, 100, 100]);
    const pool = createHashPool(2);
    const fractions: number[] = [];

    const promise = pool.hash(file, parts, (f) => fractions.push(f));
    await drain();

    expect(await promise).toBe((await oracle(file, parts)).etag);
    expect(FakeWorker.instances).toHaveLength(2);
    expect(fractions[fractions.length - 1]).toBe(1);
    expect(fractions.every((f, i) => i === 0 || f >= fractions[i - 1])).toBe(true);
  });

  it("never spawns more workers than the pool size, even with multiple files queued", async () => {
    const fileA = makeFile(200);
    const fileB = makeFile(120);
    const partsA = makeParts([100, 100]);
    const partsB = makeParts([60, 60]);
    const pool = createHashPool(1);

    const a = pool.hash(fileA, partsA, () => {});
    const b = pool.hash(fileB, partsB, () => {});
    await drain();

    expect(FakeWorker.instances).toHaveLength(1);
    expect(await a).toBe((await oracle(fileA, partsA)).etag);
    expect(await b).toBe((await oracle(fileB, partsB)).etag);
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const pool = createHashPool(1);
    const controller = new AbortController();
    controller.abort();

    await expect(pool.hash(makeFile(10), makeParts([10]), () => {}, controller.signal)).rejects.toThrow(/cancelled/i);
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it("cancels in-flight parts when the signal fires mid-hash", async () => {
    const file = makeFile(200);
    const parts = makeParts([100, 100]);
    const pool = createHashPool(2);
    const controller = new AbortController();

    const promise = pool.hash(file, parts, () => {}, controller.signal);
    const settled = promise.catch((e: unknown) => e);
    expect(FakeWorker.pendingCount()).toBe(2);
    controller.abort();

    const err = await settled;
    expect(err).toBeInstanceOf(DOMException);
    expect((err as DOMException).name).toBe("AbortError");
    expect(FakeWorker.pendingCount()).toBe(0);
  });

  it("rejects the whole file when a worker reports an error, freeing its other parts", async () => {
    const file = makeFile(200);
    const parts = makeParts([100, 100]);
    const pool = createHashPool(2);

    const promise = pool.hash(file, parts, () => {});
    const settled = promise.catch((e: unknown) => e);
    FakeWorker.instances[0].failNext("worker exploded");

    expect(await settled).toEqual(new Error("worker exploded"));
    expect(FakeWorker.pendingCount()).toBe(0);
  });

  it("hashes only the missing parts on a partial cache hit and writes them back", async () => {
    const file = makeFile(200);
    const parts = makeParts([100, 100]);
    const { etag, digests } = await oracle(file, parts);
    const cached: CachedDigests = { digests: digests.slice(), present: [true, false] };
    cached.digests.fill(0, 16); // only part 1 is genuinely cached
    const cache = fakeCache(() => Promise.resolve(cached));
    const pool = createHashPool(2, cache);

    const promise = pool.hash(file, parts, () => {}, undefined, "key-1");
    await new Promise((r) => setTimeout(r, 0));
    expect(FakeWorker.pendingCount()).toBe(1); // just the miss, not the cached part
    await drain();

    expect(await promise).toBe(etag);
    expect(cache.putPart).toHaveBeenCalledTimes(1);
    expect(vi.mocked(cache.putPart).mock.calls[0][2]).toBe(2);
    expect(cache.flush).toHaveBeenCalledWith("key-1");
  });

  it("re-hashes one verification part on a full cache hit before trusting it", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // deterministically verify part 1
    const file = makeFile(200);
    const parts = makeParts([100, 100]);
    const { etag, digests } = await oracle(file, parts);
    const cache = fakeCache(() => Promise.resolve({ digests: digests.slice(), present: [true, true] }));
    const pool = createHashPool(2, cache);

    const promise = pool.hash(file, parts, () => {}, undefined, "key-1");
    await new Promise((r) => setTimeout(r, 0));
    expect(FakeWorker.pendingCount()).toBe(1); // the probe part only
    await drain();

    expect(await promise).toBe(etag);
    expect(cache.discard).not.toHaveBeenCalled();
  });

  it("discards a stale record (same identity, different content) and re-hashes everything", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const file = makeFile(200);
    const parts = makeParts([100, 100]);
    const { etag } = await oracle(file, parts);
    // A full hit whose digests don't match the file's actual content anymore.
    const stale: CachedDigests = { digests: new Uint8Array(32).fill(0xab), present: [true, true] };
    const cache = fakeCache(() => Promise.resolve(stale));
    const pool = createHashPool(2, cache);

    const promise = pool.hash(file, parts, () => {}, undefined, "key-1");
    await drain();

    expect(await promise).toBe(etag);
    expect(cache.discard).toHaveBeenCalledWith("key-1");
    expect(cache.putPart).toHaveBeenCalledTimes(2); // fresh digests for both parts
  });

  it("settles immediately after a failed verification on a single-part file", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const file = makeFile(100);
    const parts = makeParts([100]);
    const { etag } = await oracle(file, parts);
    const cache = fakeCache(() => Promise.resolve({ digests: new Uint8Array(16).fill(0xab), present: [true] }));
    const pool = createHashPool(1, cache);

    const promise = pool.hash(file, parts, () => {}, undefined, "key-1");
    await drain();

    expect(await promise).toBe(etag);
    expect(cache.discard).toHaveBeenCalledWith("key-1");
  });

  it("treats a failing cache lookup as a plain miss", async () => {
    const file = makeFile(100);
    const parts = makeParts([100]);
    const cache = fakeCache(() => Promise.reject(new Error("idb unavailable")));
    const pool = createHashPool(1, cache);

    const promise = pool.hash(file, parts, () => {}, undefined, "key-1");
    await drain();

    expect(await promise).toBe((await oracle(file, parts)).etag);
  });

  it("rejects a job aborted while its cache lookup is still in flight, queueing nothing", async () => {
    let resolveLookup!: (cached: CachedDigests | null) => void;
    const cache = fakeCache(() => new Promise((resolve) => (resolveLookup = resolve)));
    const pool = createHashPool(1, cache);
    const controller = new AbortController();

    const promise = pool.hash(makeFile(100), makeParts([100]), () => {}, controller.signal, "key-1");
    const settled = promise.catch((e: unknown) => e);
    controller.abort(); // settles before startJob ever ran
    resolveLookup(null); // the late lookup result must be ignored

    const err = await settled;
    expect(err).toBeInstanceOf(DOMException);
    expect((err as DOMException).name).toBe("AbortError");
    await new Promise((r) => setTimeout(r, 0));
    expect(FakeWorker.pendingCount()).toBe(0);
    expect(FakeWorker.instances).toHaveLength(0); // no part was ever handed to a worker
  });

  it("leaves another job's in-flight parts alone when one job is cancelled", async () => {
    const fileA = makeFile(100);
    const partsA = makeParts([100]);
    const pool = createHashPool(2);
    const controller = new AbortController();

    const a = pool.hash(fileA, partsA, () => {});
    const b = pool.hash(makeFile(50), makeParts([50]), () => {}, controller.signal);
    const bSettled = b.catch((e: unknown) => e);
    expect(FakeWorker.pendingCount()).toBe(2);
    controller.abort(); // B's cancel sweep walks A's in-flight entry and must skip it

    expect(((await bSettled) as DOMException).name).toBe("AbortError");
    expect(FakeWorker.pendingCount()).toBe(1); // A's part is still pending
    await drain();
    expect(await a).toBe((await oracle(fileA, partsA)).etag);
  });

  it("skips fully claimed jobs when cycling the round-robin queue", async () => {
    const fileA = makeFile(100);
    const fileB = makeFile(200);
    const partsA = makeParts([100]);
    const partsB = makeParts([100, 100]);
    const pool = createHashPool(3);

    // A's lone part is claimed first; handing out B's two parts then has to cycle past A.
    const a = pool.hash(fileA, partsA, () => {});
    const b = pool.hash(fileB, partsB, () => {});
    expect(FakeWorker.pendingCount()).toBe(3);
    await drain();

    expect(await a).toBe((await oracle(fileA, partsA)).etag);
    expect(await b).toBe((await oracle(fileB, partsB)).etag);
  });

  it("ignores worker messages for requests it no longer tracks", async () => {
    const file = makeFile(100);
    const parts = makeParts([100]);
    const pool = createHashPool(1);

    const promise = pool.hash(file, parts, () => {});
    const worker = FakeWorker.instances[0];
    // A response under an id the pool never issued (e.g. from a worker restarted mid-part).
    worker.emitRaw({ type: "progress", requestId: 999, bytesDone: 10 });
    worker.emitRaw({ type: "done", requestId: 999, digest: new Uint8Array(16) });
    await drain();

    expect(await promise).toBe((await oracle(file, parts)).etag);
  });

  it("ignores an unsolicited 'cancelled' for a live request without settling the job", async () => {
    const file = makeFile(100);
    const parts = makeParts([100]);
    const pool = createHashPool(1);

    const promise = pool.hash(file, parts, () => {});
    const worker = FakeWorker.instances[0];
    const requestId = worker.oldestRequestId();
    worker.emitRaw({ type: "cancelled", requestId });
    // The pool dropped its tracking entry, so the eventual real completion is ignored too and
    // the job simply never settles; nothing crashes and no wrong result is produced.
    await drain();

    const outcome = await Promise.race([promise.then(() => "settled"), Promise.resolve("pending")]);
    expect(outcome).toBe("pending");
  });

  it("drops progress that lands after the job settled but before the worker acked the cancel", async () => {
    // A worker whose cancel acks never arrive, so the in-flight entry outlives the settle.
    class QuietCancelWorker extends FakeWorker {
      postMessage(msg: HashWorkerRequest): void {
        if (msg.type === "cancel") return;
        super.postMessage(msg);
      }
    }
    vi.stubGlobal("Worker", QuietCancelWorker);
    const pool = createHashPool(1);
    const controller = new AbortController();
    const fractions: number[] = [];

    const promise = pool.hash(makeFile(100), makeParts([100]), (f) => fractions.push(f), controller.signal);
    const settled = promise.catch((e: unknown) => e);
    const worker = FakeWorker.instances[0];
    const requestId = worker.oldestRequestId();
    controller.abort();
    worker.emitRaw({ type: "progress", requestId, bytesDone: 50 });

    expect(((await settled) as DOMException).name).toBe("AbortError");
    expect(fractions).toEqual([]); // the late progress never reached the caller
  });

  it("treats a verification digest of the wrong length as a stale record", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const file = makeFile(100);
    const parts = makeParts([100]);
    const cache = fakeCache(() => Promise.resolve({ digests: new Uint8Array(16).fill(0xab), present: [true] }));
    const pool = createHashPool(1, cache);

    const promise = pool.hash(file, parts, () => {}, undefined, "key-1");
    await new Promise((r) => setTimeout(r, 0));
    const worker = FakeWorker.instances[0];
    const requestId = worker.oldestRequestId();
    worker.pending.delete(requestId);
    // A digest that isn't even 16 bytes can never match the cached expectation.
    worker.emitRaw({ type: "done", requestId, digest: new Uint8Array(15) });

    expect(typeof (await promise)).toBe("string");
    expect(cache.discard).toHaveBeenCalledWith("key-1");
  });
});
