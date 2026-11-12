import { describe, expect, it } from "vitest";
import { CALLS, CALL_MARK, louder, titleFor } from "../../../src/shared/calling";

describe("louder", () => {
  it("takes the first call there is", () => {
    for (const call of CALLS) expect(louder(null, call)).toBe(call);
  });

  it("keeps a turn in the title when a line of chat comes after it", () => {
    expect(louder("turn", "said")).toBe("turn");
  });

  it("gives way to a call that asks more of the player", () => {
    expect(louder("said", "came")).toBe("came");
    expect(louder("came", "started")).toBe("started");
    expect(louder("started", "host")).toBe("host");
    expect(louder("host", "turn")).toBe("turn");
  });

  it("keeps the same call when it comes again", () => {
    for (const call of CALLS) expect(louder(call, call)).toBe(call);
  });
});

describe("titleFor", () => {
  it("is the page's own title with nothing to call for", () => {
    expect(titleFor(null, "러시안 룰렛 · ABCDE")).toBe("러시안 룰렛 · ABCDE");
  });

  it("puts what calls first, where a title cut short still shows it", () => {
    const title = titleFor("내 차례", "러시안 룰렛 · ABCDE");

    expect(title).toBe(`${CALL_MARK} 내 차례 · 러시안 룰렛 · ABCDE`);
    expect(title.indexOf("내 차례")).toBeLessThan(title.indexOf("러시안"));
  });
});
