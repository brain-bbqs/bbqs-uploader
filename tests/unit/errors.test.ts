import { describe, expect, it } from "vitest";
import { ApiError, friendlyError } from "../../src/lib/errors";

describe("ApiError", () => {
  it("carries the HTTP status and a distinguishing name", () => {
    const err = new ApiError("boom", 404);
    expect(err.message).toBe("boom");
    expect(err.status).toBe(404);
    expect(err.name).toBe("ApiError");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("friendlyError", () => {
  it("translates a 401 into a sign-in prompt", () => {
    expect(friendlyError(new ApiError("GET /x failed", 401))).toBe(
      "Authentication failed: please sign in again.",
    );
  });

  it("translates a 403 into a permissions message", () => {
    expect(friendlyError(new ApiError("GET /x failed", 403))).toBe(
      "Permission denied: your account cannot edit this dandiset.",
    );
  });

  it("translates a 404 into a check-the-dandiset-id message", () => {
    expect(friendlyError(new ApiError("GET /x failed", 404))).toBe(
      "Not found: check the dandiset ID (and that a draft version exists).",
    );
  });

  it("passes through other ApiError statuses unchanged", () => {
    expect(friendlyError(new ApiError("POST /y failed with HTTP 500", 500))).toBe(
      "POST /y failed with HTTP 500",
    );
  });

  it("uses the message of a plain Error", () => {
    expect(friendlyError(new Error("plain failure"))).toBe("plain failure");
  });

  it("stringifies a non-Error throw", () => {
    expect(friendlyError("just a string")).toBe("just a string");
    expect(friendlyError(42)).toBe("42");
  });
});
