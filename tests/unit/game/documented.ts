/**
 * The show's own match of this game, as it was played in the fifth episode:
 * the forty-two moves of its six players over seven rounds, what the dealer
 * told the table of each, and how the gun stood when it fired. Rebuilt from
 * the dealer's announcements and the words on the players' terminals in
 * viewers' subtitle files of the episode, and not checked against the release
 * itself (design/game-brief.md says from where, and what of it is a reading).
 * Written by a script from that rebuilding, so that no move is copied by
 * hand.
 *
 * Who played is left out. The players are numbers: seat 0 led the first
 * round and the rest follow clockwise. A chamber is the number of places it
 * lies clockwise from the muzzle, as in the rules.
 *
 * Not every move is on screen. `known` says how each is known:
 * - `shown`: the broadcast shows or announces it;
 * - `partly`: its kind and outcome are shown or told by the player, and an
 *   amount or a pair is filled in;
 * - `fill`: the table heard only of a hidden action. What is written here is
 *   one of the histories that fit everything shown: the credits each player
 *   later says they have left, every look that is opened, and every refusal.
 *   Two swaps of two empty chambers are among them (moves 18 and 30), which
 *   no reading of one common count of credits can do without.
 */
import type { Action, Round } from "../../../src/shared/game";

/** One move of the match. */
export interface DocumentedMove {
  /** The seat that moved. */
  seat: number;
  /** What the dealer told the table: a public look, a turn of the muzzle, or only that a hidden action was made. */
  announced: "public" | "rotate" | "hidden";
  /** The move. */
  action: Action;
  /** Where the credits earned the swap: the first chamber of the two that were exchanged. */
  swap?: number;
  /** What a look found, where the broadcast opens it or the player tells it. */
  seen?: [Round, Round];
  /** The seat the muzzle pointed at after a turn of it. */
  muzzle?: number;
  /** The credits the seat had left after the move. */
  left: number;
  /** How the move is known. */
  known: "shown" | "partly" | "fill";
}

/** Where the live rounds lay at the start, and the seat the muzzle pointed at. */
export const START = { live: [0, 3], muzzle: 0 };

/** The forty-two moves, in order. */
export const MATCH: DocumentedMove[] = [
  { seat: 0, announced: "public", action: { type: "public", pair: 0 }, seen: [1, 0], left: 15, known: "shown" },
  { seat: 1, announced: "hidden", action: { type: "private", pair: 4 }, seen: [0, 0], left: 14, known: "shown" },
  { seat: 2, announced: "hidden", action: { type: "private", pair: 2 }, seen: [0, 1], left: 14, known: "shown" },
  { seat: 3, announced: "hidden", action: { type: "private", pair: 1 }, seen: [0, 0], left: 14, known: "partly" },
  { seat: 4, announced: "hidden", action: { type: "private", pair: 4 }, left: 14, known: "fill" },
  { seat: 5, announced: "hidden", action: { type: "private", pair: 2 }, seen: [0, 1], left: 14, known: "partly" },
  { seat: 1, announced: "hidden", action: { type: "tamper", amount: 1 }, left: 13, known: "shown" },
  { seat: 2, announced: "hidden", action: { type: "private", pair: 0 }, left: 12, known: "fill" },
  { seat: 3, announced: "hidden", action: { type: "private", pair: 0 }, left: 12, known: "fill" },
  { seat: 4, announced: "rotate", action: { type: "rotate", steps: 2 }, muzzle: 2, left: 10, known: "shown" },
  { seat: 5, announced: "hidden", action: { type: "private", pair: 2 }, seen: [0, 1], left: 12, known: "shown" },
  { seat: 0, announced: "public", action: { type: "public", pair: 3 }, seen: [1, 0], left: 14, known: "shown" },
  { seat: 2, announced: "hidden", action: { type: "tamper", amount: 1 }, left: 11, known: "partly" },
  { seat: 3, announced: "hidden", action: { type: "private", pair: 0 }, left: 10, known: "fill" },
  { seat: 4, announced: "hidden", action: { type: "private", pair: 0 }, left: 8, known: "fill" },
  { seat: 5, announced: "hidden", action: { type: "tamper", amount: 3 }, left: 9, known: "partly" },
  { seat: 0, announced: "public", action: { type: "public", pair: 2 }, seen: [0, 1], left: 13, known: "shown" },
  { seat: 1, announced: "hidden", action: { type: "tamper", amount: 1 }, swap: 1, left: 12, known: "fill" },
  { seat: 3, announced: "hidden", action: { type: "tamper", amount: 1 }, left: 9, known: "partly" },
  { seat: 4, announced: "hidden", action: { type: "tamper", amount: 1 }, left: 7, known: "fill" },
  { seat: 5, announced: "rotate", action: { type: "rotate", steps: 1 }, muzzle: 3, left: 6, known: "shown" },
  { seat: 0, announced: "rotate", action: { type: "rotate", steps: 2 }, muzzle: 5, left: 9, known: "shown" },
  { seat: 1, announced: "hidden", action: { type: "tamper", amount: 3 }, left: 9, known: "partly" },
  { seat: 2, announced: "public", action: { type: "public", pair: 1 }, seen: [0, 0], left: 10, known: "shown" },
  { seat: 4, announced: "hidden", action: { type: "tamper", amount: 2 }, swap: 2, left: 5, known: "partly" },
  { seat: 5, announced: "hidden", action: { type: "private", pair: 0 }, seen: [1, 0], left: 4, known: "shown" },
  { seat: 0, announced: "public", action: { type: "public", pair: 3 }, seen: [0, 0], left: 8, known: "shown" },
  { seat: 1, announced: "hidden", action: { type: "tamper", amount: 3 }, left: 6, known: "shown" },
  { seat: 2, announced: "hidden", action: { type: "tamper", amount: 1 }, left: 9, known: "fill" },
  { seat: 3, announced: "hidden", action: { type: "tamper", amount: 3 }, swap: 3, left: 6, known: "fill" },
  { seat: 5, announced: "hidden", action: { type: "tamper", amount: 3 }, left: 1, known: "shown" },
  { seat: 0, announced: "hidden", action: { type: "private", pair: 0 }, seen: [1, 0], left: 6, known: "shown" },
  { seat: 1, announced: "rotate", action: { type: "rotate", steps: 1 }, muzzle: 0, left: 3, known: "shown" },
  { seat: 2, announced: "public", action: { type: "public", pair: 0 }, seen: [1, 0], left: 8, known: "shown" },
  { seat: 3, announced: "hidden", action: { type: "private", pair: 1 }, seen: [0, 1], left: 4, known: "shown" },
  { seat: 4, announced: "hidden", action: { type: "tamper", amount: 1 }, left: 4, known: "shown" },
  { seat: 0, announced: "hidden", action: { type: "tamper", amount: 3 }, swap: 5, left: 3, known: "shown" },
  { seat: 1, announced: "hidden", action: { type: "tamper", amount: 3 }, left: 0, known: "shown" },
  { seat: 2, announced: "hidden", action: { type: "private", pair: 1 }, seen: [0, 1], left: 6, known: "shown" },
  { seat: 3, announced: "rotate", action: { type: "rotate", steps: 2 }, muzzle: 2, left: 0, known: "shown" },
  { seat: 4, announced: "rotate", action: { type: "rotate", steps: 1 }, muzzle: 3, left: 1, known: "shown" },
  { seat: 5, announced: "hidden", action: { type: "tamper", amount: 1 }, left: 0, known: "partly" },
];

/** How it ended: where the muzzle pointed, where the live rounds lay, the order of the shots and who was hit. */
export const END = { muzzle: 3, live: [2, 5], shots: [3, 4, 5, 0, 1, 2], hit: [5, 2] };
