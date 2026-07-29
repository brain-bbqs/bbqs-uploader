import { afterEach, describe, expect, it, vi } from "vitest";
import { HUMAN_SUBJECTS_PHRASE, containsHumanSubjects, fetchDraftMetadata } from "../../src/lib/humanSubjects";
import type { UploaderConfig } from "../../src/lib/types";

const cfg: UploaderConfig = {
  api: "https://api-dandi.emberarchive.org/api",
  web: "https://dandi.emberarchive.org",
  accessToken: "token-1",
  dandisetId: "000123",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("containsHumanSubjects", () => {
  it("detects the marker phrase anywhere in the description", () => {
    const detected = containsHumanSubjects({ description: `Note: this dataset ${HUMAN_SUBJECTS_PHRASE}, beware.` });
    expect(detected).toBe(true);
  });

  it("is false for ordinary descriptions, missing descriptions, and null metadata", () => {
    expect(containsHumanSubjects({ description: "Mouse ephys recordings" })).toBe(false);
    expect(containsHumanSubjects({})).toBe(false);
    expect(containsHumanSubjects(null)).toBe(false);
  });

  it("is case-sensitive, so prose mentioning human subjects doesn't trip it", () => {
    expect(containsHumanSubjects({ description: "This dataset contains human subjects data." })).toBe(false);
  });
});

describe("fetchDraftMetadata", () => {
  it("requests the selected dandiset's draft version metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: "Incoming: Test Lab", description: "..." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const metadata = await fetchDraftMetadata(cfg);

    expect(metadata).toEqual({ name: "Incoming: Test Lab", description: "..." });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api-dandi.emberarchive.org/api/dandisets/000123/versions/draft/");
    expect(init.headers.Authorization).toBe("Bearer token-1");
  });
});
