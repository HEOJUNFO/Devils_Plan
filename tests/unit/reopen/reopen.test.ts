import { describe, expect, it } from "vitest";
import { afterRefusedMake } from "../../../src/shared/reopen";

describe("afterRefusedMake", () => {
  it("tries a fresh code when a code picked at random was in use, while tries are left", () => {
    expect(afterRefusedMake("code-taken", false, 2)).toBe("another-code");
    expect(afterRefusedMake("code-taken", false, 1)).toBe("another-code");
  });

  it("says so once no tries are left", () => {
    expect(afterRefusedMake("code-taken", false, 0)).toBe("tell");
  });

  it("goes into the room that is there when a room opened again was opened by someone else first, and never under another code", () => {
    expect(afterRefusedMake("code-taken", true, 2)).toBe("join");
    expect(afterRefusedMake("code-taken", true, 0)).toBe("join");
  });

  it("says so for any other refusal, whichever room was asked for", () => {
    for (const reason of ["full", "bad-nick", "not-found", "too-many"]) {
      expect(afterRefusedMake(reason, false, 2)).toBe("tell");
      expect(afterRefusedMake(reason, true, 2)).toBe("tell");
    }
  });
});
