import { describe, expect, it } from "vitest";
import { doubted, heard, look, opened, sent, type Liveness, type LivenessConfig } from "../../../src/shared/liveness";
import shipped from "../../../src/shared/room-config.json";

/** The numbers as shipped. */
const CONFIG: LivenessConfig = shipped;
/** An arbitrary moment the tests call the opening of the connection, in ms. */
const OPEN = 1_000_000;
const PING_MS = CONFIG.pingSeconds * 1000;
const ASK_MS = CONFIG.askAfterSeconds * 1000;
const DEAD_MS = CONFIG.deadAfterSeconds * 1000;

/** Looks at `state` at `now`, sending the ping if one is asked for, and returns the state after. */
function after(state: Liveness, now: number): Liveness {
  return look(state, now, CONFIG).state;
}

describe("a quiet connection", () => {
  it("is left alone until its first ping is due", () => {
    const state = opened(OPEN);

    expect(look(state, OPEN + PING_MS - 1, CONFIG)).toEqual({ state, ping: false, dead: false });
  });

  it("is pinged when a ping is due, and again a full wait after that", () => {
    const first = look(opened(OPEN), OPEN + PING_MS, CONFIG);

    expect(first.ping).toBe(true);
    expect(first.dead).toBe(false);
    // the ping just sent is not sent again at the next look
    expect(look(first.state, OPEN + PING_MS + 1000, CONFIG).ping).toBe(false);
    expect(look(heard(first.state), OPEN + 2 * PING_MS, CONFIG).ping).toBe(true);
  });

  it("lives for as long as its pings are answered", () => {
    let state = opened(OPEN);
    for (let n = 1; n <= 50; n++) {
      const looked = look(state, OPEN + n * PING_MS, CONFIG);
      expect(looked).toMatchObject({ ping: true, dead: false });
      state = heard(looked.state);
    }
  });

  it("is taken for dead when the ping after the last it may miss comes due", () => {
    let state = opened(OPEN);
    // as many pings as may go unanswered, none of them answered
    for (let n = 1; n <= CONFIG.missedPings; n++) {
      const looked = look(state, OPEN + n * PING_MS, CONFIG);
      expect(looked).toMatchObject({ ping: true, dead: false });
      state = looked.state;
    }

    expect(look(state, OPEN + (CONFIG.missedPings + 1) * PING_MS - 1, CONFIG).dead).toBe(false);
    expect(look(state, OPEN + (CONFIG.missedPings + 1) * PING_MS, CONFIG)).toMatchObject({ ping: false, dead: true });
  });

  it("starts counting anew when anything at all is heard", () => {
    let state = opened(OPEN);
    for (let n = 1; n <= CONFIG.missedPings; n++) state = after(state, OPEN + n * PING_MS);

    state = heard(state);

    expect(look(state, OPEN + (CONFIG.missedPings + 1) * PING_MS, CONFIG)).toMatchObject({ ping: true, dead: false });
  });
});

describe("a connection something was sent on", () => {
  it("is asked with a ping when nothing has come back for a while", () => {
    const state = sent(opened(OPEN), OPEN + 100);

    expect(look(state, OPEN + 100 + ASK_MS - 1, CONFIG).ping).toBe(false);
    expect(look(state, OPEN + 100 + ASK_MS, CONFIG)).toMatchObject({ ping: true, dead: false });
  });

  it("is dead when that ping is not answered in time, and not a moment sooner", () => {
    const asked = after(sent(opened(OPEN), OPEN), OPEN + ASK_MS);

    expect(look(asked, OPEN + ASK_MS + DEAD_MS - 1, CONFIG)).toMatchObject({ ping: false, dead: false });
    expect(look(asked, OPEN + ASK_MS + DEAD_MS, CONFIG)).toMatchObject({ ping: false, dead: true });
  });

  it("is asked once, however often it is looked at while the answer is awaited", () => {
    const asked = after(sent(opened(OPEN), OPEN), OPEN + ASK_MS);

    for (let ms = 500; ms < DEAD_MS; ms += 500) expect(look(asked, OPEN + ASK_MS + ms, CONFIG).ping).toBe(false);
  });

  it("waits from the first thing sent, not the last: pressing again and again does not put the question off", () => {
    let state = sent(opened(OPEN), OPEN);
    state = sent(state, OPEN + ASK_MS - 500);

    expect(look(state, OPEN + ASK_MS, CONFIG).ping).toBe(true);
  });

  it("is in doubt no longer once the room is heard from", () => {
    const answered = heard(sent(opened(OPEN), OPEN));

    expect(look(answered, OPEN + ASK_MS, CONFIG)).toMatchObject({ ping: false, dead: false });
    // and what is sent after that is waited for from when it went
    const again = sent(answered, OPEN + 10_000);
    expect(look(again, OPEN + 10_000 + ASK_MS - 1, CONFIG).ping).toBe(false);
    expect(look(again, OPEN + 10_000 + ASK_MS, CONFIG).ping).toBe(true);
  });

  it("lives when the ping that asked is answered", () => {
    const answered = heard(after(sent(opened(OPEN), OPEN), OPEN + ASK_MS));

    expect(look(answered, OPEN + ASK_MS + DEAD_MS, CONFIG)).toMatchObject({ ping: false, dead: false });
  });

  it("is not taken for dead by a page whose clock stood still, before a ping has asked", () => {
    // a tab in the background looks once a minute: long past both waits at its first look
    const state = sent(opened(OPEN), OPEN);

    const late = look(state, OPEN + 60_000, CONFIG);

    expect(late).toMatchObject({ ping: true, dead: false });
    // the answer comes before the next look, a minute on
    expect(look(heard(late.state), OPEN + 120_000, CONFIG).dead).toBe(false);
  });
});

describe("a connection the page has reason to doubt", () => {
  it("is asked at the next look, and is dead if no answer comes in time", () => {
    const state = doubted(opened(OPEN), OPEN + 5000, CONFIG);

    const asked = look(state, OPEN + 5000, CONFIG);

    expect(asked).toMatchObject({ ping: true, dead: false });
    expect(look(asked.state, OPEN + 5000 + DEAD_MS, CONFIG).dead).toBe(true);
  });

  it("is not asked a second time while the first question is open", () => {
    const asked = after(doubted(opened(OPEN), OPEN + 5000, CONFIG), OPEN + 5000);

    const again = doubted(asked, OPEN + 6000, CONFIG);

    expect(again).toEqual(asked);
    // the first question's time is the one that counts
    expect(look(again, OPEN + 5000 + DEAD_MS, CONFIG).dead).toBe(true);
  });

  it("lives when the answer comes", () => {
    const answered = heard(after(doubted(opened(OPEN), OPEN + 5000, CONFIG), OPEN + 5000));

    expect(look(answered, OPEN + 5000 + DEAD_MS, CONFIG)).toMatchObject({ ping: false, dead: false });
  });
});

describe("the numbers as shipped", () => {
  it("find a dead connection within ten seconds of a press, and never ask sooner than a slow answer takes", () => {
    expect(CONFIG.askAfterSeconds + CONFIG.deadAfterSeconds).toBeLessThanOrEqual(10);
    expect(CONFIG.askAfterSeconds).toBeGreaterThanOrEqual(2);
    expect(CONFIG.deadAfterSeconds).toBeGreaterThanOrEqual(2);
  });

  it("let a page miss a ping before its connection is given up", () => {
    expect(CONFIG.missedPings).toBeGreaterThanOrEqual(1);
  });
});
