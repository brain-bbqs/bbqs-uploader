import { combineDigests } from "./etag";
import type { FilePart } from "./types";

export type HashWorkerRequest =
  | { type: "hash-part"; requestId: number; file: File; part: FilePart }
  | { type: "cancel"; requestId: number };

export type HashWorkerResponse =
  | { type: "progress"; requestId: number; bytesDone: number }
  | { type: "done"; requestId: number; digest: Uint8Array }
  | { type: "error"; requestId: number; message: string }
  | { type: "cancelled"; requestId: number };

export interface HashPool {
  hash(file: File, parts: FilePart[], onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<string>;
  terminate(): void;
}

/** A file being hashed: its claimed/finished part bookkeeping plus the promise's settle hooks. */
interface HashJobState {
  file: File;
  parts: FilePart[];
  partDigests: Uint8Array;
  nextPart: number;
  partsDone: number;
  bytesDone: number;
  onProgress: (fraction: number) => void;
  settled: boolean;
  resolve: (etag: string) => void;
  reject: (err: unknown) => void;
  removeAbortListener: () => void;
}

interface InFlightPart {
  job: HashJobState;
  part: FilePart;
  worker: Worker;
  /** Bytes already credited to the job from this part's progress messages. */
  lastBytes: number;
}

function spawn(onResponse: (worker: Worker, msg: HashWorkerResponse) => void): Worker {
  const worker = new Worker(new URL("../workers/etag.worker.ts", import.meta.url), { type: "module" });
  worker.addEventListener("message", (e: MessageEvent<HashWorkerResponse>) => onResponse(worker, e.data));
  return worker;
}

/**
 * A fixed-size pool of stateless part-hashing workers shared by every file being hashed. Parts
 * are independent (the etag is md5-of-part-md5s), so a single large file's parts fan out across
 * the whole pool instead of serializing on one worker. The queue is drained round-robin across
 * active files, so a newly added file gets its first part serviced as soon as any worker frees
 * up rather than waiting behind another file's remaining parts. Worker count is bounded by the
 * pool size in all cases; workers are spawned lazily and reused indefinitely.
 */
export function createHashPool(size: number): HashPool {
  const workers: Worker[] = [];
  const idle: Worker[] = [];
  const inFlight = new Map<number, InFlightPart>();
  // Unsettled jobs, in insertion order; claimNext cycles over this list starting at rrIndex.
  const jobs: HashJobState[] = [];
  let rrIndex = 0;
  let nextRequestId = 0;

  function claimNext(): { job: HashJobState; part: FilePart } | null {
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[(rrIndex + i) % jobs.length];
      if (job.nextPart < job.parts.length) {
        rrIndex = ((rrIndex + i) % jobs.length) + 1;
        return { job, part: job.parts[job.nextPart++] };
      }
    }
    return null;
  }

  function takeWorker(): Worker | null {
    const existing = idle.pop();
    if (existing) return existing;
    if (workers.length < size) {
      const worker = spawn(onResponse);
      workers.push(worker);
      return worker;
    }
    return null;
  }

  /** Hands queued parts to idle (or newly spawned) workers until one of the two runs out. */
  function pump(): void {
    for (;;) {
      if (!jobs.some((job) => job.nextPart < job.parts.length)) return;
      const worker = takeWorker();
      if (!worker) return;
      const { job, part } = claimNext()!;
      const requestId = nextRequestId++;
      inFlight.set(requestId, { job, part, worker, lastBytes: 0 });
      worker.postMessage({ type: "hash-part", requestId, file: job.file, part } satisfies HashWorkerRequest);
    }
  }

  function settle(job: HashJobState, error: unknown | null): void {
    job.settled = true;
    // Drop the job's unclaimed parts and its round-robin slot.
    job.nextPart = job.parts.length;
    const index = jobs.indexOf(job);
    if (index !== -1) jobs.splice(index, 1);
    job.removeAbortListener();
    if (error === null) job.resolve(combineDigests(job.partDigests, job.parts.length));
    else job.reject(error);
    // Interrupt the job's other in-flight parts so their workers free up promptly; each worker
    // acks with "cancelled" (or a harmless late "done") and rejoins the idle set via onResponse.
    for (const [requestId, entry] of inFlight) {
      if (entry.job === job) {
        entry.worker.postMessage({ type: "cancel", requestId } satisfies HashWorkerRequest);
      }
    }
  }

  function onResponse(worker: Worker, msg: HashWorkerResponse): void {
    const entry = inFlight.get(msg.requestId);
    if (!entry) return;
    const { job, part } = entry;
    if (msg.type === "progress") {
      if (job.settled) return;
      job.bytesDone += msg.bytesDone - entry.lastBytes;
      entry.lastBytes = msg.bytesDone;
      job.onProgress(job.bytesDone / job.file.size);
      return;
    }
    inFlight.delete(msg.requestId);
    if (!job.settled) {
      if (msg.type === "done") {
        job.partDigests.set(msg.digest, (part.number - 1) * 16);
        job.bytesDone += part.size - entry.lastBytes;
        job.onProgress(job.bytesDone / job.file.size);
        job.partsDone++;
        if (job.partsDone === job.parts.length) settle(job, null);
      } else if (msg.type === "error") {
        settle(job, new Error(msg.message));
      }
      // "cancelled" for an unsettled job cannot happen (cancels are only sent on settle).
    }
    idle.push(worker);
    pump();
  }

  return {
    hash(file, parts, onProgress, signal) {
      return new Promise<string>((resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException("Upload cancelled.", "AbortError"));
          return;
        }
        const job: HashJobState = {
          file,
          parts,
          partDigests: new Uint8Array(parts.length * 16),
          nextPart: 0,
          partsDone: 0,
          bytesDone: 0,
          onProgress,
          settled: false,
          resolve,
          reject,
          removeAbortListener: () => {},
        };
        if (signal) {
          const onAbort = () => settle(job, new DOMException("Upload cancelled.", "AbortError"));
          job.removeAbortListener = () => signal.removeEventListener("abort", onAbort);
          signal.addEventListener("abort", onAbort, { once: true });
        }
        jobs.push(job);
        pump();
      });
    },
    terminate() {
      for (const worker of workers) worker.terminate();
      workers.length = 0;
      idle.length = 0;
      inFlight.clear();
      jobs.length = 0;
    },
  };
}
