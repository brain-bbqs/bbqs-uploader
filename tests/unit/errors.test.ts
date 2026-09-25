import { describe, expect, it } from "vitest";
import { ApiError, friendlyError } from "@brain-bbqs/ember-client";
import { UPLOADER_MESSAGES } from "../../src/lib/errors";

describe("friendlyError with this app's wording", () => {
  it.each([
    [401, "Authentication failed: please sign in again."],
    [403, "Permission denied: your account cannot edit this dandiset."],
    [404, "Not found: check the dandiset ID (and that a draft version exists)."],
  ])("says what to do about an HTTP %i in terms of dandisets", (status, expected) => {
    expect(friendlyError(new ApiError("GET /x failed", status), UPLOADER_MESSAGES)).toBe(expected);
  });

  it("passes through other ApiError statuses unchanged", () => {
    expect(friendlyError(new ApiError("POST /y failed with HTTP 500", 500), UPLOADER_MESSAGES)).toBe(
      "POST /y failed with HTTP 500",
    );
  });

  it("uses the message of a plain Error", () => {
    expect(friendlyError(new Error("plain failure"), UPLOADER_MESSAGES)).toBe("plain failure");
  });

  it("stringifies a non-Error throw", () => {
    expect(friendlyError("just a string", UPLOADER_MESSAGES)).toBe("just a string");
    expect(friendlyError(42, UPLOADER_MESSAGES)).toBe("42");
  });
});
