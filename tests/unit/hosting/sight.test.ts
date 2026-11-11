import { describe, expect, it } from "vitest";
import { GAME_IDS, type GameId } from "../../../src/shared/games";
import { CHANCE_WORDS, TIME_OF_SIGHT, type Candidate, type Presence, type StartRequest } from "../../../src/shared/hosting";
import { HOSTS } from "../../../src/shared/hosts";

/**
 * The room sends a player the game again only when their view as of
 * `TIME_OF_SIGHT` has changed (`broadcastGame` in `src/server/room.ts`). That
 * is only right if the passing of time shows a player nothing new: every game
 * here is played to its end by its clock, and at every step each view is
 * looked at as of several moments.
 */

/** The time the fixtures start at, in ms since the epoch. */
const T0 = 1_800_000_000_000;
/** The token of the one person at the table; the other places are bots'. */
const PERSON = "token-of-player-0";
/** The room's limit on a turn, in seconds, so that a game with turns goes on without the person. */
const TURN_SECONDS = 30;
/** More steps of the clock than any game here takes. */
const MOST_STEPS = 3000;
/** How long after a step's moment its views are also looked at, in ms: a moment later, and long after every clock of it has run out. */
const LATER_MS = [1, 1500, 24 * 60 * 60 * 1000];
/** Where a snapshot keeps what the time moves: every game's `clock`, and the first game's `turnEndsIn`. */
const CLOCKS = ["clock", "turnEndsIn"];

/** The person alone in the lobby, in slot 0. */
const lobby: Candidate[] = [{ token: PERSON, nick: "p0", slot: 0 }];
const here: Presence = { seated: new Set([PERSON]), connected: new Set([PERSON]) };
/** The person's page has gone without a word: the game stands still, or goes on for them. */
const away: Presence = { seated: new Set([PERSON]), connected: new Set() };

/** Numbers for a game to draw its secrets from: the same every run. */
const chance = Array.from({ length: CHANCE_WORDS }, (_, n) => Math.imul(n + 1, 2654435761) >>> 0);

function request(): StartRequest {
  return { by: PERSON, bots: true, allowBots: true, seed: 7, chance, now: T0, turnSeconds: TURN_SECONDS };
}

/** A view without what the time moves. */
function still(view: object): string {
  return JSON.stringify(Object.fromEntries(Object.entries(view).filter(([key]) => !CLOCKS.includes(key))));
}

/** What the time moves in a view. */
function clocks(view: object): unknown {
  return Object.fromEntries(Object.entries(view).filter(([key]) => CLOCKS.includes(key)));
}

/**
 * Whether `later`, a part of a view's clocks as of `at`, is what `sight`, the
 * same part as of the time of sight, comes to by then: a number stands, or
 * has counted down by the time between and stopped at 0; an entry of a list
 * may have lapsed, and none has appeared; everything else is as it was.
 */
function countedDown(sight: unknown, later: unknown, at: number): boolean {
  if (typeof sight === "number") return later === sight || later === Math.max(0, sight - (at - TIME_OF_SIGHT));
  if (Array.isArray(sight)) return Array.isArray(later) && later.every((each) => sight.some((from) => countedDown(from, each, at)));
  if (sight !== null && typeof sight === "object") {
    if (later === null || typeof later !== "object" || Array.isArray(later)) return false;
    const from = sight as Record<string, unknown>;
    const to = later as Record<string, unknown>;
    return JSON.stringify(Object.keys(from)) === JSON.stringify(Object.keys(to)) && Object.keys(from).every((key) => countedDown(from[key], to[key], at));
  }
  return later === sight;
}

/** `game` as its clock plays it from its start, bots in every place but one: each state it passes through, with the moment that came about. */
function played(game: GameId, presence: Presence): { session: unknown; at: number }[] {
  const host = HOSTS[game];
  const result = host.start(null, lobby, request(), here);
  if (!result.ok) throw new Error(`${game}: fixture start refused: ${result.reason}`);
  let session: unknown = host.attend(result.session, presence, T0);
  const steps = [{ session, at: T0 }];
  for (let step = 0; step < MOST_STEPS && host.running(session); step++) {
    const due = host.deadline(session);
    // a game that waits for the person without a clock goes no further by itself
    if (due === null || !Number.isFinite(due)) break;
    const next: unknown = host.tick(session, presence, due);
    if (next === session) throw new Error(`${game}: nothing came of the clock at the moment the game asked for it`);
    session = next;
    steps.push({ session, at: due });
  }
  return steps;
}

describe("what the passing of time may show a player", () => {
  for (const game of GAME_IDS) {
    // with its player there a game is played to its end; with their page gone it stands still, and is given up or waits
    for (const [name, presence, least] of [
      ["with its player there", here, 5],
      ["with its player's page gone", away, 1],
    ] as const) {
      it(`${game}, ${name}: a view differs from the view as of the time of sight only in its clocks, which have counted down`, () => {
        const host = HOSTS[game];
        const steps = played(game, presence);

        // the game went as far as this fixture is meant to take it
        expect(steps.length).toBeGreaterThanOrEqual(least);
        for (const { session, at } of steps) {
          for (const viewer of [PERSON, null]) {
            const sight = host.view(session, viewer, presence, TIME_OF_SIGHT);
            for (const later of [0, ...LATER_MS]) {
              const view = host.view(session, viewer, presence, at + later);
              expect(still(view)).toBe(still(sight));
              expect(countedDown(clocks(sight), clocks(view), at + later)).toBe(true);
            }
          }
        }
      });
    }
  }

  it("is looked at in views that do have clocks: the test's list of where a clock is kept names something in every game", () => {
    for (const game of GAME_IDS) {
      const result = HOSTS[game].start(null, lobby, request(), here);
      if (!result.ok) throw new Error(`${game}: fixture start refused: ${result.reason}`);

      const view = HOSTS[game].view(result.session, PERSON, here, T0);

      expect(Object.keys(view).some((key) => CLOCKS.includes(key))).toBe(true);
    }
  });
});
