import { describe, expect, it } from "vitest";
import { BUILD, outOfDate } from "../../../src/shared/build";

describe("BUILD", () => {
  it("is dev where no build put a commit in", () => {
    expect(BUILD).toBe("dev");
  });
});

describe("outOfDate", () => {
  it("is so for a page of another build than the server's", () => {
    expect(outOfDate("aaaaaaa", "bbbbbbb", null)).toBe(true);
  });

  it("is not so for a page of the server's own build", () => {
    expect(outOfDate("aaaaaaa", "aaaaaaa", null)).toBe(false);
  });

  it("is not so when the server does not say which build it is", () => {
    for (const servers of [undefined, null, "", 7, { build: "bbbbbbb" }]) {
      expect(outOfDate("aaaaaaa", servers, null)).toBe(false);
    }
  });

  it("is not so again for a page that was loaded again from this build and came back the same", () => {
    expect(outOfDate("aaaaaaa", "bbbbbbb", "aaaaaaa")).toBe(false);
  });

  it("is so for a page loaded again from an older build, when the server has moved on once more", () => {
    expect(outOfDate("bbbbbbb", "ccccccc", "aaaaaaa")).toBe(true);
  });
});
