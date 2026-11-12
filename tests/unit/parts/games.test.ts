import { describe, expect, it } from "vitest";
import { GAME_IDS, type GameId } from "../../../src/shared/games";
import { CHANCE_WORDS, type Candidate, type Presence, type StartRequest } from "../../../src/shared/hosting";
import { HOSTS } from "../../../src/shared/hosts";
import { partOf, withPart, type Part } from "../../../src/shared/parts";

/**
 * A page that reads parts has the game right only if every game a room can
 * send comes out of its parts as it went in. Every game here is played to
 * its end by its clock, bots in every place but one, and at every step the
 * person's view is made from the view before it and the part between them,
 * both as JSON carries them.
 */

/** The time the fixtures start at, in ms since the epoch. */
const T0 = 1_800_000_000_000;
/** The token of the one person at the table; the other places are bots'. */
const PERSON = "token-of-player-0";
/** The room's limit on a turn, in seconds, so that a game with turns goes on without the person. */
const TURN_SECONDS = 30;
/** More steps of the clock than any game here takes. */
const MOST_STEPS = 3000;
/** How long after a step's moment its view is taken, in ms: clocks have moved too, as they have when a room sends it. */
const LATER_MS = 700;

const lobby: Candidate[] = [{ token: PERSON, nick: "p0", slot: 0 }];
const here: Presence = { seated: new Set([PERSON]), connected: new Set([PERSON]) };
/** Numbers for a game to draw its secrets from: the same every run. */
const chance = Array.from({ length: CHANCE_WORDS }, (_, n) => Math.imul(n + 1, 2654435761) >>> 0);

function request(): StartRequest {
  return { by: PERSON, bots: true, allowBots: true, seed: 7, chance, now: T0, turnSeconds: TURN_SECONDS };
}

/** What a room would send the person of `game` at each step of it, as JSON carries it. */
function sentOf(game: GameId): unknown[] {
  const host = HOSTS[game];
  const result = host.start(null, lobby, request(), here);
  if (!result.ok) throw new Error(`${game}: fixture start refused: ${result.reason}`);
  let session: unknown = host.attend(result.session, here, T0);
  const carried = (at: number): unknown => JSON.parse(JSON.stringify({ type: "game", room: "ABCDE", game, ...host.view(session, PERSON, here, at) }));
  const sent = [carried(T0)];
  for (let step = 0; step < MOST_STEPS && host.running(session); step++) {
    const due = host.deadline(session);
    // a game that waits for the person without a clock goes no further by itself
    if (due === null || !Number.isFinite(due)) break;
    const next: unknown = host.tick(session, here, due);
    if (next === session) throw new Error(`${game}: nothing came of the clock at the moment the game asked for it`);
    session = next;
    sent.push(carried(due + LATER_MS));
  }
  return sent;
}

describe.each(GAME_IDS)("the parts of a game of %s", (game) => {
  const sent = sentOf(game);

  it("is played far enough to have something to tell apart", () => {
    expect(sent.length).toBeGreaterThan(2);
  });

  it("comes out of its parts as it went in, at every step", () => {
    let has = sent[0];

    for (const next of sent.slice(1)) {
      const part = partOf(has, next);
      has = part === null ? has : withPart(has, JSON.parse(JSON.stringify(part)) as Part);
      expect(has).toEqual(next);
    }
  });

  it("has parts that are shorter in all than the game sent whole each time", () => {
    const whole = sent.slice(1).reduce<number>((sum, each) => sum + JSON.stringify(each).length, 0);

    const parts = sent.slice(1).reduce<number>((sum, next, at) => sum + JSON.stringify(partOf(sent[at], next) ?? { o: {} }).length, 0);

    expect(parts).toBeLessThan(whole);
  });
});
