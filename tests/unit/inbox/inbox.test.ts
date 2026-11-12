import { describe, expect, it } from "vitest";
import { inboxKey, sameKey } from "../../../src/server/inbox";

describe("inboxKey", () => {
  it("is the key the Worker was given", () => {
    expect(inboxKey({ FEEDBACK_KEY: "a long text of my own" })).toBe("a long text of my own");
  });

  it("is none where no key is set, or an empty one", () => {
    expect(inboxKey({})).toBeNull();
    expect(inboxKey({ FEEDBACK_KEY: "" })).toBeNull();
  });
});

describe("sameKey", () => {
  it("takes the key itself", async () => {
    expect(await sameKey("열쇠 one two", "열쇠 one two")).toBe(true);
  });

  it("takes nothing else: a part of it, more than it, another case, or nothing", async () => {
    const kept = "Open-Sesame-42";

    for (const given of ["Open-Sesame-4", "Open-Sesame-42 ", "open-sesame-42", "", "x"]) expect(await sameKey(given, kept)).toBe(false);
  });
});
