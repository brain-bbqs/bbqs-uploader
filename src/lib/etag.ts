import { createEtag } from "@brain-bbqs/ember-client";

// The package's part planning and per-part hashing, with this app's own error wording: these
// messages reach the file rows as-is. combineDigests has no wording of its own and is imported from
// the package directly.
export const { planParts, hashPart } = createEtag({
  emptyFile: "Empty files cannot be uploaded to DANDI.",
  fileChanged: "File changed on disk while hashing — please re-add it.",
});
