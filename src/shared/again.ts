/**
 * "One more": after a game ends, a player who is not the host says from the
 * results that they want another, where until now they could only wait or
 * go back to the room. It is the room's own word "ready" (`lobby.ts`), which
 * the room takes again as soon as a game is over, said from where the
 * player is: so the host, who starts the next game from the results, sees
 * there how many are waiting for it, and a room whose host has walked away
 * passes to someone who is (`waitingOnHost`).
 *
 * Pure functions over plain data.
 */

/** A player of the room, as far as this goes (`PublicPlayer`). */
export interface AgainPlayer {
  slot: number;
  /** Whether they have said they are ready for the next game. Never so for the host. */
  ready: boolean;
  /** Whether they sit the room's games out (탈락전). */
  out: boolean;
}

/** What the results say of another game. */
export interface Again {
  /** How many have said they want one, the reader among them. */
  count: number;
  /** Whether the reader has. */
  mine: boolean;
  /** Whether the reader can say so, or take it back: not the host, who starts it, nor someone sitting the room's games out. */
  press: boolean;
}

/**
 * What the player in the slot `you` is shown of another game, over the
 * results of one that has ended: `null` where there is nothing to show,
 * which is for someone who cannot say so themselves (the host, a player
 * sitting out, someone who is not of the room) while nobody has. `asked` is
 * what the reader has pressed and the room has not answered yet: it stands
 * for their own word until the room says.
 */
export function againOf(players: readonly AgainPlayer[], you: number, host: boolean, knockout: boolean, asked?: boolean): Again | null {
  const me = players.find((player) => player.slot === you);
  const press = me !== undefined && !host && !(knockout && me.out);
  const mine = press && (asked ?? me.ready);
  const count = players.filter((player) => player.slot !== you && player.ready).length + (mine ? 1 : 0);
  return press || count > 0 ? { count, mine, press } : null;
}
