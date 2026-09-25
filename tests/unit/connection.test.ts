// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "@brain-bbqs/test-utils/vitest";
import type { ArchiveConfig } from "@brain-bbqs/ember-client";
import { renderIdentity } from "../../src/ui/connection";
import type { UploaderElements } from "../../src/ui/elements";

function makeEls(): { els: UploaderElements; username: HTMLSpanElement; avatar: HTMLSpanElement } {
  const username = document.createElement("span");
  const avatar = document.createElement("span");
  const els = { oauthUsername: username, oauthAvatar: avatar } as unknown as UploaderElements;
  return { els, username, avatar };
}

const cfg: ArchiveConfig = {
  api: "https://api.example.org/api",
  web: "https://example.org",
  accessToken: "t",
  dandisetId: "000123",
};

function stubMe(respond: () => Promise<unknown>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(respond);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("renderIdentity", () => {
  it("does nothing (not even a request) without an access token", async () => {
    const fetchMock = stubMe(() => Promise.resolve(jsonResponse({ username: "jdoe" })));
    const { els, username } = makeEls();
    await renderIdentity(els, { ...cfg, accessToken: "" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(username.textContent).toBe("");
  });

  it("fills in the username and initials-based avatar from /users/me/", async () => {
    const fetchMock = stubMe(() => Promise.resolve(jsonResponse({ username: "jdoe", name: "Jane Doe" })));
    const { els, username, avatar } = makeEls();

    await renderIdentity(els, cfg);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.org/api/users/me/");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer t");
    expect(username.textContent).toBe("jdoe");
    expect(avatar.textContent).toBe("JD");
  });

  it("leaves the header untouched when the identity lookup fails", async () => {
    stubMe(() => Promise.reject(new Error("offline")));
    const { els, username, avatar } = makeEls();
    username.textContent = "previous";

    await renderIdentity(els, cfg);

    expect(username.textContent).toBe("previous");
    expect(avatar.textContent).toBe("");
  });

  it("leaves the header untouched when the response has no username", async () => {
    stubMe(() => Promise.resolve(jsonResponse({})));
    const { els, username } = makeEls();

    await renderIdentity(els, cfg);

    expect(username.textContent).toBe("");
  });

  it("falls back to the '??' avatar when the account has a username but no display name", async () => {
    stubMe(() => Promise.resolve(jsonResponse({ username: "jdoe" })));
    const { els, username, avatar } = makeEls();

    await renderIdentity(els, cfg);

    expect(username.textContent).toBe("jdoe");
    expect(avatar.textContent).toBe("??");
  });
});
