import { hashPart } from "../lib/etag";
import type { HashWorkerRequest, HashWorkerResponse } from "../lib/etag-worker";

// Cast rather than reference the "webworker" lib, which conflicts with the app's "DOM" lib
// in a single tsconfig (both declare an incompatible global `self`).
const ctx = self as unknown as {
  postMessage(message: HashWorkerResponse, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<HashWorkerRequest>) => void) | null;
};

// Request ids whose "cancel" arrived while the part was still being hashed. The hash loop yields
// to the event loop on every 16MB chunk read, so a cancel message posted mid-part gets processed
// between chunks and the loop below notices it on the next chunk boundary.
const cancelledIds = new Set<number>();

class HashCancelled extends Error {}

ctx.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === "cancel") {
    cancelledIds.add(msg.requestId);
    return;
  }
  const { requestId, file, part } = msg;
  try {
    const digest = await hashPart(file, part, (bytesDone) => {
      if (cancelledIds.has(requestId)) throw new HashCancelled();
      ctx.postMessage({ type: "progress", requestId, bytesDone });
    });
    ctx.postMessage({ type: "done", requestId, digest }, [digest.buffer as ArrayBuffer]);
  } catch (err) {
    if (err instanceof HashCancelled) {
      cancelledIds.delete(requestId);
      ctx.postMessage({ type: "cancelled", requestId });
      return;
    }
    ctx.postMessage({ type: "error", requestId, message: err instanceof Error ? err.message : String(err) });
  }
};
