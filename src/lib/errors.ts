import type { FriendlyMessages } from "@brain-bbqs/ember-client";

/** This app's wording for the archive failures a person can act on, passed to `friendlyError`. */
export const UPLOADER_MESSAGES: Required<FriendlyMessages> = {
  401: "Authentication failed: please sign in again.",
  403: "Permission denied: your account cannot edit this dandiset.",
  404: "Not found: check the dandiset ID (and that a draft version exists).",
};
