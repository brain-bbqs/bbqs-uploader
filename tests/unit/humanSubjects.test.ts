import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HUMAN_SUBJECTS_PHRASE,
  containsHumanSubjects,
  existingIrbNumber,
  fetchDraftMetadata,
  saveIrbNumber,
} from "../../src/lib/humanSubjects";
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

describe("existingIrbNumber", () => {
  it("returns the first non-blank ethicsApproval identifier", () => {
    const irb = existingIrbNumber({
      ethicsApproval: [
        { schemaKey: "EthicsApproval", identifier: "   " },
        { schemaKey: "EthicsApproval", identifier: " STUDY001 " },
        { schemaKey: "EthicsApproval", identifier: "STUDY002" },
      ],
    });
    expect(irb).toBe("STUDY001");
  });

  it("returns an empty string when nothing is recorded", () => {
    expect(existingIrbNumber({ ethicsApproval: [] })).toBe("");
    expect(existingIrbNumber({})).toBe("");
    expect(existingIrbNumber(null)).toBe("");
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

describe("saveIrbNumber", () => {
  it("appends an EthicsApproval entry and PUTs the full metadata back", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const metadata = {
      name: "Incoming: Test Lab",
      description: HUMAN_SUBJECTS_PHRASE,
      keywords: ["kept"],
      ethicsApproval: [{ schemaKey: "EthicsApproval" as const, identifier: "OLD-1" }],
    };

    const updated = await saveIrbNumber(cfg, metadata, "  STUDY00001234  ");

    expect(updated.ethicsApproval).toEqual([
      { schemaKey: "EthicsApproval", identifier: "OLD-1" },
      { schemaKey: "EthicsApproval", identifier: "STUDY00001234" },
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api-dandi.emberarchive.org/api/dandisets/000123/versions/draft/");
    expect(init.method).toBe("PUT");
    const body = JSON.parse(init.body);
    expect(body.name).toBe("Incoming: Test Lab");
    expect(body.metadata.keywords).toEqual(["kept"]);
    expect(body.metadata.ethicsApproval).toEqual(updated.ethicsApproval);
  });

  it("does not call the API when the number is already recorded", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const metadata = { ethicsApproval: [{ schemaKey: "EthicsApproval" as const, identifier: "STUDY001" }] };

    const updated = await saveIrbNumber(cfg, metadata, " STUDY001 ");

    expect(updated).toBe(metadata);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
