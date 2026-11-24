import { describe, expect, it } from "vitest";
import { QUICK_WORDS, isQuickWord, normalizeChat, paceChat, type ChatConfig, type ChatPace } from "../../../src/shared/chat";

/** Short lines and a small allowance, so both limits are reached in a few steps; the allowance of the long window is out of the way unless a test sets it. */
function chatConfig(overrides: Partial<ChatConfig> = {}): ChatConfig {
  return { maxLength: 10, burst: 3, windowSeconds: 5, sustained: { burst: 100, windowSeconds: 60 }, ...overrides };
}

/** A pace of `count` lines since `since`, counted alike in the short window and the long. */
function paceOf(count: number, since: number): ChatPace {
  return { short: { count, since }, long: { count, since } };
}

/** An arbitrary moment the tests call "now", in ms. */
const NOW = 1_000_000;

describe("normalizeChat", () => {
  it("passes an ordinary line on as it is", () => {
    expect(normalizeChat("안녕하세요", chatConfig())).toBe("안녕하세요");
  });

  it("makes several lines one", () => {
    expect(normalizeChat("a\nb\r\nc", chatConfig())).toBe("a b c");
  });

  it("cuts a line to the longest allowed", () => {
    const config = chatConfig();

    expect(normalizeChat("가".repeat(config.maxLength + 5), config)).toBe("가".repeat(config.maxLength));
  });

  it("says nothing for a line with nothing in it", () => {
    expect(normalizeChat("   \n\t ", chatConfig())).toBeNull();
    expect(normalizeChat("", chatConfig())).toBeNull();
  });

  it("takes out characters that are not for showing", () => {
    expect(normalizeChat(`a${String.fromCodePoint(0x0000)}${String.fromCodePoint(0x202e)}b`, chatConfig())).toBe("a b");
  });
});

describe("paceChat", () => {
  it("lets a player who has said nothing speak", () => {
    const result = paceChat(undefined, NOW, chatConfig());

    expect(result).toEqual({ ok: true, pace: paceOf(1, NOW) });
  });

  it("lets a player say as many lines in a window as the allowance", () => {
    const config = chatConfig();
    let pace: ChatPace | undefined;
    const allowed: boolean[] = [];

    for (let n = 0; n < config.burst; n++) {
      const result = paceChat(pace, NOW + n, config);
      allowed.push(result.ok);
      pace = result.pace;
    }

    expect(allowed).toEqual(Array.from({ length: config.burst }, () => true));
    expect(pace).toEqual(paceOf(config.burst, NOW));
  });

  it("refuses the line after the allowance within the same window", () => {
    const config = chatConfig();
    const full = paceOf(config.burst, NOW);

    const result = paceChat(full, NOW + config.windowSeconds * 1000 - 1, config);

    expect(result).toEqual({ ok: false, pace: full });
  });

  it("does not count a refused line against the player", () => {
    const config = chatConfig();
    const full = paceOf(config.burst, NOW);

    const refused = paceChat(full, NOW + 1, config);
    const later = paceChat(refused.pace, NOW + config.windowSeconds * 1000, config);

    expect(later.ok).toBe(true);
  });

  it("starts a new window once the old one is over", () => {
    const config = chatConfig();
    const full = paceOf(config.burst, NOW);
    const after = NOW + config.windowSeconds * 1000;

    const result = paceChat(full, after, config);

    expect(result).toEqual({ ok: true, pace: { short: { count: 1, since: after }, long: { count: config.burst + 1, since: NOW } } });
  });

  it("starts over when the clock has gone backwards", () => {
    const config = chatConfig();
    const full = paceOf(config.burst, NOW);

    const result = paceChat(full, NOW - 1000, config);

    expect(result).toEqual({ ok: true, pace: paceOf(1, NOW - 1000) });
  });

  it("refuses a player who keeps to the allowance window after window once the longer allowance is spent, until the long window is over", () => {
    const config = chatConfig({ sustained: { burst: 7, windowSeconds: 60 } });
    let pace: ChatPace | undefined;
    const allowed: boolean[] = [];

    // three lines at the start of each short window: nine asked in the first three windows
    for (let n = 0; n < 9; n++) {
      const result = paceChat(pace, NOW + Math.floor(n / 3) * config.windowSeconds * 1000 + (n % 3), config);
      allowed.push(result.ok);
      pace = result.pace;
    }

    expect(allowed).toEqual([true, true, true, true, true, true, true, false, false]);
    expect(paceChat(pace, NOW + 60_000 - 1, config).ok).toBe(false);
    expect(paceChat(pace, NOW + 60_000, config)).toEqual({ ok: true, pace: paceOf(1, NOW + 60_000) });
  });

  it("counts a line refused for the short window against the long one neither", () => {
    const config = chatConfig({ sustained: { burst: 4, windowSeconds: 60 } });
    const full = paceOf(config.burst, NOW);

    const refused = paceChat(full, NOW + 1, config);

    expect(refused).toEqual({ ok: false, pace: full });
  });
});

describe("isQuickWord", () => {
  it("knows each of the words that take one press", () => {
    for (const word of QUICK_WORDS) expect(isQuickWord(word), word).toBe(true);
  });

  it("knows nothing else: another word, one in other letters, what is not a word", () => {
    const [first] = QUICK_WORDS;

    for (const other of ["", "hi there", first.toUpperCase(), ` ${first}`, 0, null, undefined, [first], { word: first }]) {
      expect(isQuickWord(other), JSON.stringify(other)).toBe(false);
    }
  });

  it("has no word twice", () => {
    expect(new Set(QUICK_WORDS).size).toBe(QUICK_WORDS.length);
  });
});
