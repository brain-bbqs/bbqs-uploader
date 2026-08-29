// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderIdentity } from "../../src/ui/connection";
import { apiFetch } from "../../src/lib/api";
import type { UploaderElements } from "../../src/ui/elements";
import type { UploaderConfig } from "../../src/lib/types";

vi.mock("../../src/lib/api");

const apiFetchMock = vi.mocked(apiFetch);

function makeEls(): { els: UploaderElements; username: HTMLSpanElement; avatar: HTMLSpanElement } {
  const username = document.createElement("span");
  const avatar = document.createElement("span");
  const els = { oauthUsername: username, oauthAvatar: avatar } as unknown as UploaderElements;
  return { els, username, avatar };
}

const cfg: UploaderConfig = {
  api: "https://api.example.org/api",
  web: "https://example.org",
  accessToken: "t",
  dandisetId: "000123",
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("renderIdentity", () => {
  it("does nothing (not even a request) without an access token", async () => {
    const { els } = makeEls();
    await renderIdentity(els, { ...cfg, accessToken: "" });
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("fills in the username and initials-based avatar from /users/me/", async () => {
    apiFetchMock.mockResolvedValue({ username: "jdoe", name: "Jane Doe" });
    const { els, username, avatar } = makeEls();

    await renderIdentity(els, cfg);

    expect(apiFetchMock).toHaveBeenCalledWith(cfg, "/users/me/");
    expect(username.textContent).toBe("jdoe");
    expect(avatar.textContent).toBe("JD");
  });

  it("leaves the header untouched when the identity lookup fails", async () => {
    apiFetchMock.mockRejectedValue(new Error("offline"));
    const { els, username, avatar } = makeEls();
    username.textContent = "previous";

    await renderIdentity(els, cfg);

    expect(username.textContent).toBe("previous");
    expect(avatar.textContent).toBe("");
  });

  it("leaves the header untouched when the response has no username", async () => {
    apiFetchMock.mockResolvedValue({});
    const { els, username } = makeEls();

    await renderIdentity(els, cfg);

    expect(username.textContent).toBe("");
  });

  it("falls back to the '??' avatar when the account has a username but no display name", async () => {
    apiFetchMock.mockResolvedValue({ username: "jdoe" });
    const { els, username, avatar } = makeEls();

    await renderIdentity(els, cfg);

    expect(username.textContent).toBe("jdoe");
    expect(avatar.textContent).toBe("??");
  });
});
