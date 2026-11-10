import { describe, expect, it } from "vitest";
import shipped from "../../../src/shared/games/count-rectangles/config.json";
import { afterBuzz, typeAnswer } from "../../../src/shared/games/count-rectangles/typing";

/** As many digits as the largest answer the rules take. */
const MOST = `${shipped.maxSaid}`.length;

describe("typing an answer", () => {
  it("reads digits in the order they were pressed, however many come at once", () => {
    expect(typeAnswer("", ["Digit1", "Digit0"], MOST)).toEqual({ typed: "10", said: null });
    expect(typeAnswer("", ["Digit0", "Digit1"], MOST)).toEqual({ typed: "1", said: null });
    expect(typeAnswer("", ["Digit2", "Digit1"], MOST)).toEqual({ typed: "21", said: null });
  });

  it("takes the digits of the number pad for the same digits", () => {
    expect(typeAnswer("", ["Numpad1", "Numpad2"], MOST).typed).toBe("12");
  });

  it("adds to what is already typed", () => {
    expect(typeAnswer("1", ["Digit0"], MOST).typed).toBe("10");
  });

  it("lets a nought typed first give way to the digit after it", () => {
    expect(typeAnswer("0", ["Digit7"], MOST).typed).toBe("7");
    expect(typeAnswer("", ["Digit0", "Digit0"], MOST).typed).toBe("0");
  });

  it("takes no more digits than the largest answer has", () => {
    expect(typeAnswer("", ["Digit1", "Digit2", "Digit3"], MOST).typed).toBe("12");
  });

  it("takes the last digit off at Backspace, and does nothing with none left", () => {
    expect(typeAnswer("12", ["Backspace"], MOST).typed).toBe("1");
    expect(typeAnswer("", ["Backspace"], MOST).typed).toBe("");
    expect(typeAnswer("", ["Digit4", "Backspace", "Digit5"], MOST).typed).toBe("5");
  });

  it("says the number as it stands when Enter is pressed", () => {
    expect(typeAnswer("", ["Digit1", "Digit0", "Enter"], MOST)).toEqual({ typed: "10", said: 10 });
    expect(typeAnswer("7", ["NumpadEnter"], MOST)).toEqual({ typed: "7", said: 7 });
    expect(typeAnswer("", ["Digit0", "Enter"], MOST)).toEqual({ typed: "0", said: 0 });
  });

  it("says nothing when nothing is typed", () => {
    expect(typeAnswer("", ["Enter"], MOST)).toEqual({ typed: "", said: null });
    expect(typeAnswer("3", ["Backspace", "Enter"], MOST)).toEqual({ typed: "", said: null });
  });

  it("leaves out what was pressed after Enter", () => {
    expect(typeAnswer("", ["Digit4", "Enter", "Digit9"], MOST)).toEqual({ typed: "4", said: 4 });
  });

  it("pays no attention to any other key", () => {
    expect(typeAnswer("4", ["KeyM", "Space", "ArrowLeft", "Minus"], MOST)).toEqual({ typed: "4", said: null });
  });
});

describe("a buzz and the start of an answer in the same frame", () => {
  it("gives the keys pressed after the buzz, in their order", () => {
    expect(afterBuzz(["Space", "Digit1", "Digit0"])).toEqual(["Digit1", "Digit0"]);
    expect(afterBuzz(["KeyM", "Enter", "Digit4"])).toEqual(["Digit4"]);
    expect(afterBuzz(["NumpadEnter"])).toEqual([]);
  });

  it("says when nothing pressed is a buzz", () => {
    expect(afterBuzz(["Digit1", "KeyH"])).toBeNull();
    expect(afterBuzz([])).toBeNull();
  });
});
