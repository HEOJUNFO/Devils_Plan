import { env } from "cloudflare:workers";
import { evictDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { GAME_PART } from "../../../src/shared/parts";
import { closeAll, join, type MarketMessage, type TestClient } from "../support";

/** The game the parts are of: the one with the most to send, sixteen at a table and a board of rules in two languages. */
const GAME = "mystery-stock-market" as const;
/** How much of the game whole a part may be, at most, where one player is done with the round: a mark in a table. */
const SMALL = 0.1;

/** Connects to `room` and joins as player `player`; `parts` as the page says it reads a game. */
function open(room: string, player: number, parts: boolean, create = false): Promise<TestClient> {
  return join(room, { player, create, game: GAME, parts });
}

/**
 * A room of three in a game: player 0 whose page reads parts, player 1 with
 * two pages open, one that reads parts and one that does not, and player 2
 * whose page does not.
 */
async function table(room: string): Promise<{ zero: TestClient; parts: TestClient; whole: TestClient; two: TestClient }> {
  const zero = await open(room, 0, true, true);
  const parts = await open(room, 1, true);
  const whole = await open(room, 1, false);
  const two = await open(room, 2, false);
  await Promise.all([zero, parts, whole, two].map((client) => client.lobbyOf(3)));
  zero.send({ type: "start", bots: false });
  await Promise.all([zero, parts, whole, two].map((client) => client.marketWhere()));
  return { zero, parts, whole, two };
}

/** `client` is done with round `round`. */
function done(client: TestClient, round: number): void {
  client.send({ type: "action", action: { type: "done", round } });
}

/** Whether `game` shows the player in seat `player` as done with the round. */
const sawDone = (player: number) => (game: MarketMessage): boolean => game.view.standings.some((each) => each.player === player && each.done);

/** The types of the messages about a game among what `client` was sent, in order. */
const kinds = (client: TestClient): string[] => client.raw.map((text) => (JSON.parse(text) as { type: string }).type).filter((type) => type === "game" || type === GAME_PART);

describe("GameRoom: a game sent as what has changed in it", () => {
  it("sends a page that reads parts the change alone, and the page makes of it the game another is sent whole", async () => {
    const { zero, parts, whole, two } = await table("PTAAA");

    done(zero, 1);
    const [made, sent] = await Promise.all([parts.marketWhere(sawDone(0)), whole.marketWhere(sawDone(0))]);

    expect(made).toEqual(sent);
    expect(kinds(parts)).toEqual(["game", GAME_PART]);
    expect(kinds(whole)).toEqual(["game", "game"]);
    expect(parts.raw.at(-1)?.length).toBeLessThan((whole.raw.at(-1)?.length ?? 0) * SMALL);
    closeAll([zero, parts, whole, two]);
  });

  it("marks the part sent to whoever made the move as the answer to it", async () => {
    const { zero, parts, whole, two } = await table("PTAAB");

    done(zero, 1);
    const answer = await zero.marketWhere(sawDone(0));
    const others = await parts.marketWhere(sawDone(0));

    expect(answer.answer).toBe(true);
    expect(others.answer).toBeUndefined();
    expect(kinds(zero)).toEqual(["game", GAME_PART]);
    closeAll([zero, parts, whole, two]);
  });

  it("goes on from part to part, through a round's end, and the page still has the game another is sent whole", async () => {
    const { zero, parts, whole, two } = await table("PTAAC");

    done(zero, 1);
    done(parts, 1);
    done(two, 1);
    const next = (game: MarketMessage): boolean => game.view.round === 2;
    const [made, sent] = await Promise.all([parts.marketWhere(next), whole.marketWhere(next)]);

    expect(made).toEqual(sent);
    closeAll([zero, parts, whole, two]);
  });

  it("sends the game whole to a page that comes back, whatever it was sent before", async () => {
    const { zero, parts, whole, two } = await table("PTAAD");
    done(zero, 1);
    await parts.marketWhere(sawDone(0));
    parts.close();

    const back = await open("PTAAD", 1, true);
    const game = await back.marketWhere();

    expect(sawDone(0)(game)).toBe(true);
    expect(kinds(back)).toEqual(["game"]);
    closeAll([zero, back, whole, two]);
  });

  it("sends the game whole once more after the room has slept: it no longer knows what each page has", async () => {
    const { zero, parts, whole, two } = await table("PTAAE");
    const stub = env.GameRoom.getByName("PTAAE");

    await evictDurableObject(stub);
    done(zero, 1);
    const [made, sent] = await Promise.all([parts.marketWhere(sawDone(0)), whole.marketWhere(sawDone(0))]);
    done(two, 1);
    const [later, laterSent] = await Promise.all([parts.marketWhere(sawDone(2)), whole.marketWhere(sawDone(2))]);

    expect(made).toEqual(sent);
    expect(later).toEqual(laterSent);
    expect(kinds(parts)).toEqual(["game", "game", GAME_PART]);
    closeAll([zero, parts, whole, two]);
  });
});
