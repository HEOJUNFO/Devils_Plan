/**
 * A line said aside: to some of the room and not the rest. One player (a
 * whisper), a few picked by name (an alliance), or the speaker's own team.
 *
 * The room knows only slots. A page that says a line to its team sends the
 * slots of that team as the waiting room shows it, which everyone can see
 * anyway (`PublicPlayer.team`), so the room needs no notion of a team to pass
 * the line on, and a team that a game keeps to itself is never asked about.
 * The line goes to those of the slots who are there to read it, and says to
 * whom it went. Like every line it is passed on and not kept
 * (`src/shared/chat.ts`), and is cleaned, covered and paced as one said to
 * everyone is.
 *
 * Pure functions over plain data.
 */

/** A player of the room, as far as a line said aside goes. */
export interface AsidePlayer {
  slot: number;
  nick: string;
  /** Whether a connection of theirs is in the room now. */
  connected: boolean;
  /** The team they have chosen in the waiting room; 0 for playing alone. */
  team: number;
}

/** One a line said aside went to. */
export interface Hearer {
  slot: number;
  nick: string;
}

/**
 * Who the page says its next line to: everyone, the reader's team as it
 * stands when the line is sent, or the players picked. A player picked is
 * kept by seat and by name: someone else who has since taken the seat was
 * not picked.
 */
export type ChatTo = { kind: "all" } | { kind: "team" } | { kind: "some"; people: Hearer[] };

/** Whether `raw` is the number of a seat. */
function isSlot(raw: unknown): raw is number {
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 0;
}

/**
 * The slots a line is said to, out of what a page sent: one slot (a page of
 * an earlier build, which could pick one player) or a list of them, each
 * once and lowest first. `null` for anything else, for a list of nobody (a
 * line meant for some and addressed to none is not said to everyone
 * instead), and for a list of more than `most`.
 */
export function parseTo(raw: unknown, most: number): number[] | null {
  if (isSlot(raw)) return [raw];
  if (!Array.isArray(raw) || raw.length === 0 || !raw.every(isSlot)) return null;
  const slots = [...new Set(raw)].sort((a, b) => a - b);
  return slots.length <= most ? slots : null;
}

/** The longest name read with a slot: longer than any nickname the room gives, so nothing a page of ours sends is cut off. */
const NAME_MOST = 64;

/**
 * The slots a line is said to with the name the speaker saw in each
 * (`names[i]` in the slot `to[i]`), out of what a page sent: each slot once,
 * lowest first. `null` for anything else: names that are not one for each
 * slot, a slot twice, nobody, or more than `most`.
 */
export function parseNamed(rawTo: unknown, rawNames: unknown, most: number): { to: number[]; names: string[] } | null {
  if (!Array.isArray(rawTo) || !Array.isArray(rawNames) || rawTo.length === 0 || rawTo.length !== rawNames.length || rawTo.length > most) return null;
  if (!rawTo.every(isSlot) || !rawNames.every((name): name is string => typeof name === "string" && name.length <= NAME_MOST)) return null;
  if (new Set(rawTo).size !== rawTo.length) return null;
  const pairs = rawTo.map((slot, i) => ({ slot, name: rawNames[i] })).sort((a, b) => a.slot - b.slot);
  return { to: pairs.map((pair) => pair.slot), names: pairs.map((pair) => pair.name) };
}

/**
 * Who of the slots `asked` a line of the player in `speaker` goes to: those
 * in the room other than the speaker with a connection there to read it
 * (`here`), lowest slot first. Empty where there is nobody: the room then
 * refuses the line.
 *
 * With `names` (the name the speaker saw in each slot asked, `names[i]` in
 * `asked[i]`), a slot whose player goes by another name is left out: the
 * player spoken to left and someone else was given the slot before the
 * speaker's page heard of it, and the line was not meant for them.
 */
export function heardBy(asked: readonly number[], speaker: number, players: readonly { slot: number; nick: string }[], here: (slot: number) => boolean, names?: readonly string[]): Hearer[] {
  return players
    .filter((player) => player.slot !== speaker && asked.includes(player.slot) && here(player.slot))
    .filter((player) => names === undefined || names[asked.indexOf(player.slot)] === player.nick)
    .map((player) => ({ slot: player.slot, nick: player.nick }))
    .sort((a, b) => a.slot - b.slot);
}

/** The others in the team of the player in `you` who are connected, lowest slot first; nobody for a player alone. */
export function teammatesOf(players: readonly AsidePlayer[], you: number): Hearer[] {
  const team = players.find((player) => player.slot === you)?.team ?? 0;
  if (team === 0) return [];
  return players
    .filter((player) => player.slot !== you && player.team === team && player.connected)
    .map((player) => ({ slot: player.slot, nick: player.nick }))
    .sort((a, b) => a.slot - b.slot);
}

/**
 * Whom the next line of the player in `you` is said to: `null` for
 * everyone, else those of `to` who are in the room, lowest slot first, which
 * is nobody once they have all gone (or the team has). A player picked whose
 * connection is gone still holds their seat and is still named: they may be
 * back for the next line, and the room leaves them out of this one.
 */
export function hearersOf(to: ChatTo, players: readonly AsidePlayer[], you: number): Hearer[] | null {
  if (to.kind === "all") return null;
  if (to.kind === "team") return teammatesOf(players, you);
  return players
    .filter((player) => player.slot !== you && to.people.some((person) => person.slot === player.slot && person.nick === player.nick))
    .map((player) => ({ slot: player.slot, nick: player.nick }))
    .sort((a, b) => a.slot - b.slot);
}

/** Who the next line is said to after `person` was pressed, `people` being whom it was said to: with them, or without them if they were among them; everyone once nobody is left. */
export function toggled(people: readonly Hearer[], person: Hearer): ChatTo {
  const next = people.some((other) => other.slot === person.slot)
    ? people.filter((other) => other.slot !== person.slot)
    : [...people, { slot: person.slot, nick: person.nick }].sort((a, b) => a.slot - b.slot);
  return next.length === 0 ? { kind: "all" } : { kind: "some", people: next };
}

/**
 * The names of those a line was said to, as the chat puts them after the
 * speaker's: one, two, or the first and how many more. In no language, so a
 * line kept by the tab reads the same whichever the page is read in.
 */
export function namesOf(nicks: readonly string[]): string {
  if (nicks.length <= 2) return nicks.join(", ");
  return `${nicks[0]} +${nicks.length - 1}`;
}
