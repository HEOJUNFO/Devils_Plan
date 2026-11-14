import { describe, expect, it } from "vitest";
import {
  browserOf,
  faultOf,
  faultText,
  parseFault,
  parseFaultNote,
  parseWaiting,
  sameFault,
  waitingWith,
  type Fault,
  type FaultConfig,
} from "../../../src/shared/fault";

/** A short sentence and few of everything, so the limits are reached with little. */
const CONFIG: FaultConfig = {
  messageLength: 40,
  frames: 2,
  each: 2,
  senderLimit: { burst: 2, windowSeconds: 60 },
  dayLimit: 3,
  keep: 2,
  ignore: ["Script error", "ResizeObserver loop"],
};

/** The address the page's script is served from, with a room's code in what is asked of the page. */
const SCRIPT = "https://play.example.com/assets/main-AbC1.js";
const PAGE = "https://play.example.com/?room=QWERT&lang=ko";

/** A fault as a page notes it. */
function fault(overrides: Partial<Fault> = {}): Fault {
  return { message: "Uncaught TypeError: x is not a function", frames: ["main-AbC1.js:1:2345"], where: "lobby", browser: "chrome", ...overrides };
}

describe("faultOf", () => {
  it("notes the sentence, where the browser says it was thrown, the screen and the browser", () => {
    const noted = faultOf({ message: "Uncaught TypeError: x is not a function", source: SCRIPT, line: 1, column: 2345 }, "lobby", "chrome", CONFIG);

    expect(noted).toEqual(fault());
  });

  it("keeps of an address the file's name and nothing else, so no room's code goes with a fault", () => {
    const noted = faultOf({ message: "boom", source: PAGE, line: 12, column: 3, stack: `Error: boom\n    at start (${PAGE}:12:3)\n    at ${SCRIPT}?v=QWERT:7:8` }, "room", "ios", CONFIG);

    expect(noted?.frames).toEqual(["page:12:3", "main-AbC1.js:7:8"]);
    expect(JSON.stringify(noted)).not.toContain("QWERT");
    expect(JSON.stringify(noted)).not.toContain("example.com");
  });

  it("takes an address and what is quoted out of the sentence: a room's socket has its code in it, and a text that is not JSON is quoted", () => {
    const long = { ...CONFIG, messageLength: 200 };
    const socket = faultOf({ message: "Failed to construct 'WebSocket': The URL 'wss://play.example.com/parties/game-room/QWERT?_pk=1' is invalid." }, "room", "chrome", long);
    const parsed = faultOf({ message: `Unexpected token 'h', "hello ann"... is not valid JSON` }, "room", "chrome", long);
    const safari = faultOf({ message: "JSON Parse error: Unexpected identifier `hello`" }, "room", "ios", long);

    expect(socket?.message).toBe("Failed to construct 'WebSocket': The URL '(address)' is invalid.");
    expect(parsed?.message).toBe(`Unexpected token 'h', "…"... is not valid JSON`);
    expect(safari?.message).toBe("JSON Parse error: Unexpected identifier `…`");
  });

  it("reads a stack as Chrome writes one and as Safari and Firefox write one, the nearest first", () => {
    const chrome = `TypeError: x\n    at draw (${SCRIPT}:3:40)\n    at async Promise.all (index 0)\n    at ${SCRIPT}:9:1`;
    const safari = `draw@${SCRIPT}:3:40\n@${SCRIPT}:9:1`;

    for (const stack of [chrome, safari]) {
      expect(faultOf({ message: "TypeError: x", stack }, "count-cubes", "safari", CONFIG)?.frames).toEqual(["main-AbC1.js:3:40", "main-AbC1.js:9:1"]);
    }
  });

  it("puts where the browser says the error was first, once, and keeps no more frames than are sent", () => {
    const stack = `Error\n    at a (${SCRIPT}:5:5)\n    at b (${SCRIPT}:1:1)\n    at c (${SCRIPT}:6:6)`;

    expect(faultOf({ message: "x", source: SCRIPT, line: 1, column: 1, stack }, "lobby", "chrome", CONFIG)?.frames).toEqual(["main-AbC1.js:1:1", "main-AbC1.js:5:5"]);
    expect(faultOf({ message: "x", source: SCRIPT, line: 5, column: 5, stack }, "lobby", "chrome", CONFIG)?.frames).toEqual(["main-AbC1.js:5:5", "main-AbC1.js:1:1"]);
  });

  it("cuts a long sentence and cleans it as a line shown to a reader is", () => {
    expect(faultOf({ message: `  bad\u0007 thing\n${"x".repeat(80)}` }, "lobby", "other", CONFIG)?.message).toBe(`bad thing ${"x".repeat(30)}`);
  });

  it("notes a fault with no place at all", () => {
    expect(faultOf({ message: "TypeError: gone" }, "lobby", "firefox", CONFIG)).toEqual(fault({ message: "TypeError: gone", frames: [], browser: "firefox" }));
  });

  it("notes nothing of an error with no sentence, of the sentences set to be passed over, or of a browser extension's script", () => {
    expect(faultOf({ message: "  " }, "lobby", "chrome", CONFIG)).toBeNull();
    expect(faultOf({ message: "Script error." }, "lobby", "chrome", CONFIG)).toBeNull();
    expect(faultOf({ message: "ResizeObserver loop limit exceeded" }, "lobby", "chrome", CONFIG)).toBeNull();
    expect(faultOf({ message: "boom", source: "chrome-extension://abcdef/content.js", line: 1, column: 1 }, "lobby", "chrome", CONFIG)).toBeNull();
    expect(faultOf({ message: "boom", stack: "inject@moz-extension://abcdef/content.js:1:1" }, "lobby", "firefox", CONFIG)).toBeNull();
    expect(faultOf({ message: "boom", stack: "inject@webkit-masked-url://hidden/:1:1" }, "lobby", "safari", CONFIG)).toBeNull();
  });
});

describe("browserOf", () => {
  it("names the browser coarsely from what it says of itself", () => {
    const agents: [string, string][] = [
      ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "ios"],
      ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1", "ios"],
      ["Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36", "samsung"],
      ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36", "android"],
      ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0", "edge"],
      ["Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0", "firefox"],
      ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", "chrome"],
      ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15", "safari"],
      ["curl/8.7.1", "other"],
    ];

    for (const [agent, browser] of agents) expect(browserOf(agent)).toBe(browser);
  });
});

describe("parseFault", () => {
  it("reads a fault as a page sends it, from the lobby, a room or a game", () => {
    for (const where of ["lobby", "room", "mystery-stock-market"]) expect(parseFault(fault({ where }), CONFIG)).toEqual(fault({ where }));
  });

  it("keeps only the fields of a fault", () => {
    expect(parseFault({ ...fault(), nick: "ann", token: "secret" }, CONFIG)).toEqual(fault());
  });

  it("cleans the sentence as a line shown to a reader is", () => {
    expect(parseFault(fault({ message: " a‮b " }), CONFIG)?.message).toBe("a b");
  });

  it("takes an address and what is quoted out of a sentence that came with them, as a page does before it sends", () => {
    expect(parseFault(fault({ message: 'at https://x.example/r/QWERT "ann"' }), CONFIG)?.message).toBe('at (address) "…"');
  });

  it("rejects a sentence that is empty, not text, or longer than a page sends", () => {
    for (const message of ["", "  ", 7, null, "x".repeat(41)]) expect(parseFault({ ...fault(), message }, CONFIG)).toBeNull();
  });

  it("rejects more frames than a page sends, and a frame that is not a file's name and a position", () => {
    const frame = "main.js:1:1";

    expect(parseFault(fault({ frames: [frame, frame, frame] }), CONFIG)).toBeNull();
    for (const bad of [`${PAGE}:1:2`, "main.js", "main.js:1", "a b.js:1:2", "", 7]) expect(parseFault({ ...fault(), frames: [bad] }, CONFIG)).toBeNull();
    expect(parseFault({ ...fault(), frames: "main.js:1:1" }, CONFIG)).toBeNull();
  });

  it("rejects a screen or a browser there is none of, and what is not a fault at all", () => {
    expect(parseFault(fault({ where: "somewhere" }), CONFIG)).toBeNull();
    expect(parseFault({ ...fault(), browser: "netscape" }, CONFIG)).toBeNull();
    for (const raw of [null, "fault", 7, []]) expect(parseFault(raw, CONFIG)).toBeNull();
  });
});

describe("faultText and sameFault", () => {
  it("reads as the sentence with the frames under it, a frame to a line", () => {
    expect(faultText(fault({ frames: ["a.js:1:2", "b.js:3:4"] }))).toBe("Uncaught TypeError: x is not a function\na.js:1:2\nb.js:3:4");
    expect(faultText(fault({ frames: [] }))).toBe("Uncaught TypeError: x is not a function");
  });

  it("takes the same sentence from the same place for one fault, whichever screen and browser it came from", () => {
    expect(sameFault(fault(), fault({ where: "room", browser: "ios" }))).toBe(true);
    expect(sameFault(fault(), fault({ message: "another" }))).toBe(false);
    expect(sameFault(fault(), fault({ frames: ["main-AbC1.js:1:9"] }))).toBe(false);
  });
});

describe("waitingWith and parseWaiting", () => {
  it("adds a fault to those waiting, with the build of its page", () => {
    expect(waitingWith([], fault(), "abc1234", CONFIG)).toEqual([{ fault: fault(), build: "abc1234" }]);
  });

  it("does not add a fault that waits already, unless it is of another build", () => {
    const waiting = waitingWith([], fault(), "abc1234", CONFIG);

    expect(waitingWith(waiting, fault({ where: "room" }), "abc1234", CONFIG)).toEqual(waiting);
    expect(waitingWith(waiting, fault(), "def5678", CONFIG)).toHaveLength(2);
  });

  it("adds no more than a page sends", () => {
    let waiting = waitingWith([], fault({ message: "one" }), "a", CONFIG);
    waiting = waitingWith(waiting, fault({ message: "two" }), "a", CONFIG);

    expect(waitingWith(waiting, fault({ message: "three" }), "a", CONFIG)).toEqual(waiting);
  });

  it("reads back what was written down", () => {
    const waiting = waitingWith(waitingWith([], fault({ message: "one" }), "a", CONFIG), fault({ message: "two" }), "b", CONFIG);

    expect(parseWaiting(JSON.stringify(waiting), CONFIG)).toEqual(waiting);
  });

  it("has none of what cannot be read, leaves out what is not a fault, and stops at as many as wait", () => {
    const one = { fault: fault({ message: "one" }), build: "a" };

    for (const raw of [null, "", "{", "7", JSON.stringify({ fault: fault(), build: "a" })]) expect(parseWaiting(raw, CONFIG)).toEqual([]);
    expect(parseWaiting(JSON.stringify([one, null, { fault: fault({ where: "x" }), build: "a" }, { fault: fault() }, "x"]), CONFIG)).toEqual([one]);
    expect(parseWaiting(JSON.stringify([one, one, one]), CONFIG)).toHaveLength(2);
  });
});

describe("parseFaultNote", () => {
  it("reads the note kept beside a fault", () => {
    expect(parseFaultNote(JSON.stringify({ where: "lobby", browser: "ios", n: 4 }))).toEqual({ where: "lobby", browser: "ios", n: 4 });
  });

  it("has nothing of what is not a note", () => {
    for (const kept of ["", "{", "null", JSON.stringify({ where: "lobby", browser: "ios" }), JSON.stringify({ where: "lobby", browser: "ios", n: 0 }), JSON.stringify({ where: 1, browser: "ios", n: 1 })]) {
      expect(parseFaultNote(kept)).toBeNull();
    }
  });
});
