/**
 * The match of 경매 빙고 the show played (episodes 9 and 10), as the wiki's
 * seven round tables record it: design/games/auction-bingo.md, "방송의 판".
 * Seats are the rows of those tables, 1 to 8; a player here is the seat less
 * one. Each bid is written as the coins it was made of.
 */
import type { Shape, Shapes } from "../../../src/shared/games/auction-bingo/rules";

const SHAPE: Record<string, Shape> = { T: "triangle", C: "circle", S: "star" };

/** What a seat did in a round. */
export interface Entry {
  player: number;
  shape: Shape;
  coins: number[];
}

/** How a shape came out in a round, as the wiki's table has it. */
export interface Outcome {
  shape: Shape;
  votes: number;
  price: number;
  winners: number[];
  share: number;
}

/** Reads `"1:T1 2:C1 5:S5+1"`: seat, shape, coins. */
function entries(line: string): Entry[] {
  return line.split(" ").map((word) => {
    const [seat, rest] = word.split(":");
    return { player: Number(seat) - 1, shape: SHAPE[rest[0]], coins: rest.slice(1).split("+").map(Number) };
  });
}

/** Reads `"T 4 3 3,7 2"`: shape, votes, winning bid, winning seats, shapes each. */
function outcomes(lines: string[]): Outcome[] {
  return lines.map((line) => {
    const [shape, votes, price, seats, share] = line.split(" ");
    return { shape: SHAPE[shape], votes: Number(votes), price: Number(price), winners: seats.split(",").map((seat) => Number(seat) - 1), share: Number(share) };
  });
}

/** The seven rounds: what everyone chose and bid, and what the wiki says came of it. */
export const MATCH: { entries: Entry[]; outcomes: Outcome[] }[] = [
  { entries: entries("1:T1 2:C1 3:T3 4:T1 5:S5+1 6:C1 7:T3 8:S3"), outcomes: outcomes(["T 4 3 3,7 2", "C 2 1 2,6 1", "S 2 6 5 2"]) },
  { entries: entries("1:T2 2:S1 3:C1 4:C2 5:T2 6:T10+3+1 7:S1 8:C3"), outcomes: outcomes(["T 3 14 6 3", "C 3 3 8 3", "S 2 1 2,7 1"]) },
  { entries: entries("1:C1 2:T5+2 3:S10+5+1 4:C10+5+2+2 5:C1 6:S2 7:C10+5+2+2 8:T1"), outcomes: outcomes(["T 2 7 2 2", "C 4 19 4,7 2", "S 2 16 3 2"]) },
  { entries: entries("1:T1 2:S3 3:C2+2 4:T1 5:T2 6:C2 7:S1 8:S10+2"), outcomes: outcomes(["T 3 2 5 3", "C 2 4 3 2", "S 3 12 8 3"]) },
  { entries: entries("1:T2 2:S3 3:T1 4:T1 5:C1 6:S5+1 7:S1 8:T1"), outcomes: outcomes(["T 4 2 1 4", "C 1 1 5 1", "S 3 6 6 3"]) },
  { entries: entries("1:C10+5+3+3+2 2:C10+2+2+1+1 3:T3+2+1 4:S1 5:C1 6:C3+2+1+1 7:T2 8:T5+2+2+1+1"), outcomes: outcomes(["T 3 11 8 3", "C 4 23 1 4", "S 1 1 4 1"]) },
  { entries: entries("1:S1 2:C1 3:C1 4:T3+3+1 5:C10+3+3+2 6:S1 7:S3 8:T1"), outcomes: outcomes(["T 2 7 4 2", "C 3 18 5 3", "S 3 3 7 3"]) },
];

/**
 * How the match ended, by player: the shapes won, and the place the show
 * gave. Bingos and squares filled were not said on the show: they are what
 * the card comes to with eight lines, and their order is the show's places.
 */
export const ENDS: { player: number; shapes: Shapes; lines: number; cells: number; place: number }[] = [
  { player: 0, shapes: { triangle: 4, circle: 4, star: 0 }, lines: 2, cells: 7, place: 6 },
  { player: 1, shapes: { triangle: 2, circle: 1, star: 1 }, lines: 1, cells: 4, place: 8 },
  { player: 2, shapes: { triangle: 2, circle: 2, star: 2 }, lines: 3, cells: 6, place: 3 },
  { player: 3, shapes: { triangle: 2, circle: 2, star: 1 }, lines: 2, cells: 5, place: 7 },
  { player: 4, shapes: { triangle: 3, circle: 4, star: 2 }, lines: 8, cells: 9, place: 1 },
  { player: 5, shapes: { triangle: 3, circle: 1, star: 3 }, lines: 3, cells: 6, place: 3 },
  { player: 6, shapes: { triangle: 2, circle: 2, star: 4 }, lines: 3, cells: 6, place: 3 },
  { player: 7, shapes: { triangle: 3, circle: 3, star: 3 }, lines: 6, cells: 8, place: 2 },
];
