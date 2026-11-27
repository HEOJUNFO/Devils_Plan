/**
 * The screen of 컬러 링크: the round's board, the pieces on it, the pieces a
 * player is about to place, and the paths of a proof.
 *
 * Design: design/games/color-link.md. The room decides everything; this
 * screen shows what it sends and asks it to take a turn's pieces, a
 * declaration or a proof. Nothing of the game is hidden, so both players
 * are sent the same board. What a player is writing is theirs alone until
 * it is sent: the pieces of a turn not placed yet, and the paths of a proof
 * not made yet. Pieces and paths are checked here before they are sent, by
 * the rules the room holds them to (`rules.ts`), so that a player is told
 * what is wrong with them at once. Everything can be done with the pointer;
 * the keys are another way to the same.
 *
 * A piece is told from another twice, by its colour and by the letter on
 * it. A proof is drawn: a press on a piece begins its path, and the path
 * follows the pointer from square to square. The path of a piece that has
 * no partner ends where its partner is to go.
 */
import { EMPTY, NONE, checkPlacing, checkProof, lettersLeft, unpaired, type LinkEvent, type Placing } from "../../../shared/games/color-link/rules";
import { hits, type Box, type Press, type Reach } from "../../../shared/frame";
import type { ServerMessage } from "../../../shared/protocol";
import type { VoiceMark } from "../../../shared/voice";
import { linkWaits } from "../../../shared/waits";
import { BAR_Y, H, PANEL_X, Pen, SCENE_W, VOICE_MARK_W, W, drawSpeech, drawVoiceMark, speechLines, speechSeconds } from "../../game/draw";
import { C, shade } from "../../game/palette";
import { pixelFont } from "../../game/pixel-font";
import { AGAIN_REACH, LOBBY_REACH, RESULTS_PRESS_HOLD, watchPointer, type Point } from "../../game/pointer";
import { isMuted, setMuted, sfx, startAudio } from "../../game/sound";
import { TOUCH } from "../../touch";
import { WORDS as PAGE } from "../../words";
import { LOG_PITCH, PANEL_WIDTH, entryAt, isCrowded, panelLayout } from "../panel";
import { WORDS } from "./words";

/** What the room sends about a game of 컬러 링크. */
export type LinkMessage = Extract<ServerMessage, { type: "game"; game: "color-link" }>;

/** What the screen asks of whoever owns the connection. */
export interface LinkHandlers {
  /** The player placed pieces, declared, proved, gave a proof up or chose. Returns whether it could be sent. */
  act(action: unknown): boolean;
  /** The host asked for the next game. */
  again(): boolean;
  /** Someone who is not the host would play one more; whether the room has that word of them now (`GameHandlers`). */
  wantAgain(): boolean;
  /** Whether the room's 탈락전 has put this browser's player out (`GameHandlers`). */
  out(): boolean;
  /** The game is over and the player wants the waiting room back. */
  lobby(): void;
  /** How the player in lobby slot `slot` stands in the room's voice chat. */
  voice(slot: number): VoiceMark;
  /** The rules sheet covers the whole screen, or has been put away. */
  covered(covered: boolean): void;
  /** The game has more players than the column lists one to a row, or no longer has. */
  crowded(crowded: boolean): void;
}

/** The game screen. */
export interface LinkScreen {
  update(message: LinkMessage): void;
  refused(reason: string): void;
  lost(): void;
  setHost(host: boolean): void;
  say(slot: number, text: string): void;
  press(code: string): void;
  /** What this player came out of the game with, once it is over (`GameScreen.verdict`). */
  verdict(): string | null;
  /** Whether the game waits on this player by the room's last word (`GameScreen.waits`, `src/shared/waits.ts`). */
  waits(): boolean;
  destroy(): void;
}

/** One step of the screen's clock, in seconds. */
const STEP = 1 / 60;
/** The board: its top left and how many pixels across at most. It stands to the right of the page's own buttons, which lie over the top left of the scene. */
const BOARD_X = 110;
const BOARD_Y = 29;
const BOARD_SPAN = 189;
/** What stands to the left of the board: the two players and their points, the round, and the pieces not placed yet. */
const SIDE_X = 6;
const SIDE_W = 98;
const LEGEND_Y = 34;
const ROUND_Y = 68;
const PALETTE_Y = 100;
const PALETTE_COLUMNS = 4;
const PALETTE_W = 24;
const PALETTE_H = 22;
/** How much farther than its edge a letter of the palette takes a finger: nothing, the letters lie side by side. */
const PALETTE_REACH: Reach = 0;
/** The letters as they are drawn on a piece, five pixels by seven: the font's own are higher than a small piece. */
const SMALL_LETTERS: Record<string, readonly string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#.#.#", "#..##", "#...#", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
};
/** A piece's colour and the colour of the letter on it, by its letter. The two pairs a board comes with are black and white. */
const PIECE: Record<string, readonly [fill: string, ink: string]> = {
  A: ["#e23b4a", C.bone],
  B: ["#f08a2c", C.ink],
  C: ["#f2d13c", C.ink],
  D: ["#9bd13f", C.ink],
  E: ["#2f9e58", C.bone],
  F: ["#3fd0b6", C.ink],
  G: ["#5cc0f4", C.ink],
  H: ["#3a6fe0", C.bone],
  I: ["#7a5be8", C.bone],
  J: ["#c25be0", C.bone],
  K: ["#f47fbe", C.ink],
  L: ["#a8743c", C.bone],
  M: ["#9aa3b8", C.ink],
  N: ["#5d7a4a", C.bone],
  X: ["#14151f", C.bone],
  Y: ["#f4f1e6", C.ink],
};
const OTHER_PIECE: readonly [string, string] = [C.steel, C.ink];
/** A square of the board and its edge. */
const TILE = "#3b4158";
const TILE_EDGE = "#2a2f44";
/** The widest a name is drawn in the list of players and in a line of the log, in pixels. */
const NAME_WIDTH = 86;
const LOG_NAME = 62;
/** With this many seconds or fewer left, the clock turns red, and a player the game is waiting on hears each of them ticked. */
const HURRY_FROM = 10;
/** Seconds the results are on show before Enter starts another game: the host may have been pressing Enter for a proof. */
const RESULTS_HOLD = 1.5;
/** How wide the lines of the results may be, beside the verdict and before the buttons. */
const RESULT_WIDTH = 280;
/** Seconds the pieces just placed are marked out. */
const FLASH = 2.4;
/** Seconds a declaration or a proof given up waits for its second press. */
const SURE = 3;

/** The buttons of the bar. */
const MAIN_RECT: Box = [364, 238, 112, 28];
const ERASE_RECT: Box = [270, 238, 90, 28];
const GRAVE_RECT: Box = [150, 238, 116, 28];
const FIRST_RECT: Box = [244, 238, 114, 28];
const SECOND_RECT: Box = [362, 238, 114, 28];
const AGAIN_RECT: Box = [386, 225, 90, 15];
const LOBBY_RECT: Box = [386, 250, 90, 15];
/** How wide the line beside the buttons may be. */
const HINT_WIDTH = GRAVE_RECT[0] - 12;

const inRect = (p: { x: number; y: number }, r: Box): boolean => p.x >= r[0] && p.x < r[0] + r[2] && p.y >= r[1] && p.y < r[1] + r[3];

/** A clock that has `ms` left, as minutes and seconds. */
function clockOf(ms: number): string {
  const all = Math.ceil(ms / 1000);
  return `${Math.floor(all / 60)}:${`${all % 60}`.padStart(2, "0")}`;
}

/** Makes `canvas` the game screen. Nothing is drawn until the first {@link LinkScreen.update}. */
export function createLinkScreen(canvas: HTMLCanvasElement, handlers: LinkHandlers): LinkScreen {
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2D drawing in this browser");
  const ctx: CanvasRenderingContext2D = context;
  const pen = new Pen(ctx);

  let latest: LinkMessage | null = null;
  /** When the latest message arrived, by the browser's own clock in ms: the room's clocks are counted from here in real time. */
  let receivedAt = 0;
  /** Seconds since the screen was made; drives what moves on it. */
  let time = 0;
  /** How many of the game's events have been shown. */
  let seen = 0;
  /** The last second of the player's own time that was ticked aloud. */
  let ticked = -1;
  /** Something has been sent and the room has not answered yet. */
  let pending = false;
  /** The host has asked for the next game and the room has not answered yet. */
  let starting = false;
  /** The connection to the room is down; the next thing the room sends says it is back. */
  let offline = false;
  let host = false;
  let help = false;
  let note = "";
  let noteT = 0;
  /** The colour the next piece placed has, by its letter. */
  let letter = "";
  /** The pieces of the turn placed here and not sent yet. */
  let draft: Placing[] = [];
  /** The square the keys are at, and whether the keys have been used to move it: only then is it drawn. */
  let cursor = 0;
  let keyed = false;
  /** The paths of the proof drawn here and not sent yet, by the letter of their pieces, each from a piece on. */
  const paths = new Map<string, number[]>();
  /** The letter of the path being drawn; whether the keys are drawing it; whether the pointer is, pressed down. */
  let active: string | null = null;
  let drawing = false;
  let held = false;
  /** What waits for a second press, and for how many seconds more. */
  let sure: "declare" | "forfeit" | null = null;
  let sureT = 0;
  /** `time` when the latest pieces were placed, and where: they are marked out for a moment. */
  let placedAt = -10;
  let placed: number[] = [];
  /** `time` when the game on show was first seen to be over. */
  let endedAt = 0;
  /** By player: a chat line beside their name. */
  const speech = new Map<number, { lines: string[]; t: number }>();

  /** The keys pressed since the last step, in the order they were pressed: a key's code, or `Num:` and the number it types. */
  const keys: string[] = [];
  const clicks: Press[] = [];
  /** Where the pointer went while pressed down, since the last step. */
  const drags: Point[] = [];
  const mouse = { x: -1, y: -1 };
  let stopped = false;

  // ---- What the latest message means ---------------------------------------------------------------
  const nickOf = (player: number): string => latest?.players.find((each) => each.id === player)?.nick ?? "";
  /** How long a clock that had `ms` to run when the message came has left, in ms. */
  function left(ms: number | null): number | null {
    if (ms === null || latest === null) return null;
    return latest.frozen ? ms : Math.max(0, ms - (performance.now() - receivedAt));
  }
  const me = (): number | null => latest?.view.you ?? null;
  const live = (): boolean => latest !== null && !latest.frozen && latest.view.you !== null;
  /** Whether this player is choosing who goes first, placing a turn's pieces, or proving the connections. */
  const choosing = (): boolean => live() && latest!.view.phase === "choose" && latest!.view.chooser === latest!.view.you;
  const placing = (): boolean => live() && latest!.view.phase === "place" && latest!.view.turn === latest!.view.you;
  const proving = (): boolean => live() && latest!.view.phase === "prove" && latest!.view.prover === latest!.view.you;
  const cellsNow = (): string => latest?.view.board.cells ?? "";
  const pointsOf = (player: number): number => latest?.view.scores.find((each) => each.player === player)?.points ?? 0;

  // ---- Where things are on the board ----------------------------------------------------------------
  /** How many pixels a square is across, where the board's first square is, and how far a piece reaches from its middle. */
  function grid(): { width: number; height: number; pitch: number; x: number; y: number; r: number } {
    const { width, height } = latest?.view.board ?? { width: 9, height: 9 };
    const pitch = Math.floor(BOARD_SPAN / Math.max(width, height));
    return { width, height, pitch, x: BOARD_X + Math.floor((BOARD_SPAN - pitch * width) / 2), y: BOARD_Y + Math.floor((BOARD_SPAN - pitch * height) / 2), r: Math.floor((pitch - 4) / 2) };
  }
  /** The middle of square `cell`, in pixels. */
  function pointOf(cell: number): [number, number] {
    const g = grid();
    const half = Math.floor(g.pitch / 2);
    return [g.x + (cell % g.width) * g.pitch + half, g.y + Math.floor(cell / g.width) * g.pitch + half];
  }
  /** The square a press at (`x`, `y`) is on; `null` off the board and where the board has no square. */
  function cellAt(x: number, y: number): number | null {
    const g = grid();
    const [cx, cy] = [Math.floor((x - g.x) / g.pitch), Math.floor((y - g.y) / g.pitch)];
    if (cx < 0 || cx >= g.width || cy < 0 || cy >= g.height) return null;
    const cell = cy * g.width + cx;
    return cellsNow()[cell] === NONE ? null : cell;
  }
  /** Whether two squares lie side by side or one above the other. */
  function adjacent(a: number, b: number): boolean {
    const { width } = grid();
    return Math.abs((a % width) - (b % width)) + Math.abs(Math.floor(a / width) - Math.floor(b / width)) === 1;
  }
  /** The square of the palette's letter number `index`. */
  const paletteBox = (index: number): Box => [SIDE_X + (index % PALETTE_COLUMNS) * PALETTE_W, PALETTE_Y + Math.floor(index / PALETTE_COLUMNS) * PALETTE_H, PALETTE_W, PALETTE_H];
  /** How many pieces of `which` are on the board, those of the turn being written counted. */
  const countOf = (which: string): number => [...cellsNow()].filter((cell) => cell === which).length + draft.filter((piece) => piece.letter === which).length;

  // ---- The proof being drawn -------------------------------------------------------------------------
  /** Whether `cell` has a piece on it, one of the board's own pairs included. */
  const pieceAt = (cell: number): string | null => {
    const on = cellsNow()[cell];
    return on === undefined || on === EMPTY || on === NONE ? null : on;
  };
  /** Where the other piece of `which` is, the one not on `cell`; `null` where it has no partner. */
  function mateOf(which: string, cell: number): number | null {
    const cells = cellsNow();
    for (let at = 0; at < cells.length; at++) if (at !== cell && cells[at] === which) return at;
    return null;
  }
  /** The letters there are pieces of on the board: each needs a path. */
  function wanted(): string[] {
    if (latest === null) return [];
    const cells = cellsNow();
    return [...latest.rules.fixed, ...latest.rules.letters].filter((each) => cells.includes(each));
  }
  /** Whether the path of `which` is one the proof can have: long enough, and from one piece to the other, or to where a partner can go. */
  function joined(which: string): boolean {
    const path = paths.get(which);
    if (latest === null || path === undefined || path.length < latest.rules.minPath) return false;
    const mate = mateOf(which, path[0]);
    return mate === null || path[path.length - 1] === mate;
  }
  /** The letter of the path that goes over `cell`, with where on it; `null` where none does. */
  function pathOver(cell: number): [string, number] | null {
    for (const [which, path] of paths) {
      const at = path.indexOf(cell);
      if (at >= 0) return [which, at];
    }
    return null;
  }

  /**
   * Takes the path of `which` one step on to `cell`, or one step back where
   * `cell` is the square before its last. Returns whether it did.
   */
  function extend(which: string, cell: number): boolean {
    const path = paths.get(which);
    if (path === undefined) return false;
    const head = path[path.length - 1];
    if (!adjacent(head, cell)) return false;
    if (path.length >= 2 && path[path.length - 2] === cell) {
      path.pop();
      return true;
    }
    const mate = mateOf(which, path[0]);
    // a path that has reached the other piece goes no farther
    if (mate !== null && head === mate) return false;
    if (cell === mate) {
      path.push(cell);
      if (joined(which)) sfx.pick();
      return true;
    }
    if (cellsNow()[cell] !== EMPTY || pathOver(cell) !== null) return false;
    path.push(cell);
    return true;
  }

  /** Takes the path being drawn toward `cell`, a square at a time, as far as it goes. Returns whether it moved. */
  function stretch(cell: number): boolean {
    if (active === null) return false;
    const { width } = grid();
    let moved = false;
    for (let n = 0; n < 32; n++) {
      const path = paths.get(active);
      if (path === undefined) break;
      const head = path[path.length - 1];
      if (head === cell) break;
      const [dx, dy] = [(cell % width) - (head % width), Math.floor(cell / width) - Math.floor(head / width)];
      const along = Math.abs(dx) >= Math.abs(dy) ? head + Math.sign(dx) : head + Math.sign(dy) * width;
      const across = Math.abs(dx) >= Math.abs(dy) ? head + Math.sign(dy) * width : head + Math.sign(dx);
      if (!extend(active, along) && (across === head || !extend(active, across))) break;
      moved = true;
    }
    return moved;
  }

  /** A press on `cell` while proving: begins a path on a piece, takes up a path where it is pressed, or takes the path being drawn there. */
  function pressProof(cell: number): void {
    const head = active === null ? undefined : paths.get(active)?.at(-1);
    // the other piece of the path being drawn, right beside its end: the path arrives
    if (active !== null && head !== undefined && pieceAt(cell) === active && adjacent(head, cell) && !paths.get(active)!.includes(cell) && extend(active, cell)) return;
    const over = pathOver(cell);
    if (over !== null) {
      const path = paths.get(over[0])!;
      if (over[1] < path.length - 1) sfx.back();
      path.length = over[1] + 1;
      active = over[0];
      return;
    }
    const piece = pieceAt(cell);
    if (piece !== null) {
      paths.set(piece, [cell]);
      active = piece;
      sfx.move();
      return;
    }
    if (active === null) return deny(WORDS.say.startOnPiece);
    if (stretch(cell)) sfx.move();
    else deny(WORDS.say.noWay);
  }

  function say(text: string): void {
    note = text;
    noteT = 2.5;
  }

  function deny(text: string): void {
    say(text);
    sfx.deny();
  }

  /** Shows one thing that happened: a sound, and a word in the bar. What this player did themselves was heard when they did it. */
  function show(event: LinkEvent): void {
    const mine = me();
    if (event.type === "chose") {
      if (event.forced && event.player === mine && event.first !== mine) say(WORDS.say.choseForYou);
      if (event.player !== mine || event.forced) sfx.pick();
    } else if (event.type === "placed") {
      placedAt = time;
      placed = event.pieces.map((piece) => piece.cell);
      if (event.player !== mine) sfx.stored();
    } else if (event.type === "declared") {
      if (event.prover === mine) say(WORDS.say.declaredOnYou);
      if (event.player !== mine) sfx.turn();
    } else if (event.type === "round-over") {
      if (event.winner === mine) sfx.earn();
      else sfx.back();
    } else if (event.type === "ended") {
      if (latest?.view.places !== null && latest?.view.winner === mine && mine !== null) sfx.win();
      else sfx.turn();
    }
  }

  /** Asks the room for the next game, once: a press made again before the room answers is the same press. */
  function askAgain(): void {
    if (starting) return;
    starting = handlers.again();
    if (!starting) say(WORDS.notSent);
  }

  /** The first letter there are pieces left of that the turn being written has none of, from `from` on. */
  function nextLetter(from = ""): string {
    if (latest === null) return "";
    const open = lettersLeft(cellsNow(), latest.rules).filter((each) => !draft.some((piece) => piece.letter === each));
    return open.find((each) => each > from) ?? open[0] ?? "";
  }

  function update(message: LinkMessage): void {
    // the next game has begun: what was asked for is here
    if (message.view.phase !== "ended") starting = false;
    const fresh = latest === null || latest.startedAt !== message.startedAt;
    if (fresh) {
      // a game met part-way is shown as it stands; only what happens from here on is played out
      seen = message.view.events;
      speech.clear();
      placed = [];
      placedAt = -10;
      keyed = false;
      if (latest !== null) sfx.turn();
    }
    if (message.view.phase === "ended" && (fresh || latest?.view.phase !== "ended")) endedAt = time;
    const moved = latest === null || latest.view.phase !== message.view.phase || latest.view.round !== message.view.round || latest.view.turn !== message.view.turn;
    const waited = choosing() || placing() || proving();
    const board = latest?.view.board;
    // the room marks the game it sends in answer to what this page asked; a game that has gone on waits for nothing
    if (message.answer === true || fresh || moved) pending = false;
    latest = message;
    receivedAt = performance.now();
    offline = false;
    // another step: what was written for the last is put away
    if (fresh || moved) {
      draft = [];
      paths.clear();
      active = null;
      drawing = false;
      held = false;
      sure = null;
      // (and what was said of it: the events of the step to come say their own)
      noteT = 0;
      letter = nextLetter();
    }
    if (fresh || board === undefined || board.width !== message.view.board.width || board.height !== message.view.board.height) {
      // another board: the keys begin on its first square
      cursor = Math.max(0, [...message.view.board.cells].findIndex((cell) => cell !== NONE));
    }
    handlers.crowded(isCrowded(message.players.length));
    // the game has come to wait on this player
    if (!waited && (choosing() || placing() || proving()) && !fresh && moved) sfx.turn();
  }

  // ---- Input -----------------------------------------------------------------------------------------
  /** Puts a piece of the chosen colour on `cell`, moves the turn's piece of that colour there, or takes back the piece that is there. */
  function put(cell: number): void {
    if (latest === null) return;
    const there = draft.find((piece) => piece.cell === cell);
    if (there !== undefined) {
      draft = draft.filter((piece) => piece !== there);
      letter = there.letter;
      sfx.back();
      return;
    }
    if (cellsNow()[cell] !== EMPTY) return deny(WORDS.refused["cell-taken"]);
    if (letter === "") return deny(WORDS.refused["colour-used"]);
    const same = draft.find((piece) => piece.letter === letter);
    if (same !== undefined) {
      // a turn has one piece of a colour: it goes where it is put last
      same.cell = cell;
      sfx.move();
      return;
    }
    if ([...cellsNow()].filter((each) => each === letter).length >= 2) return deny(WORDS.refused["colour-used"]);
    if (draft.length >= latest.view.due) return deny(WORDS.say.turnFull(latest.view.due));
    draft = [...draft, { letter, cell }];
    sfx.move();
    if (draft.length < latest.view.due) letter = nextLetter(letter);
  }

  /** Sends the turn's pieces, once they are as many as the turn is. */
  function sendPieces(): void {
    if (latest === null || pending) return;
    if (!latest.view.room) return deny(WORDS.standing.placeNone(""));
    if (draft.length < latest.view.due) return deny(WORDS.say.turnShort(latest.view.due - draft.length));
    const wrong = checkPlacing(latest.view.board, draft, latest.view.due, latest.rules);
    if (wrong !== null) return deny(WORDS.refused[wrong] ?? WORDS.refusedOther);
    pending = handlers.act({ type: "place", pieces: draft.map((piece) => ({ ...piece })) });
    if (!pending) return say(WORDS.notSent);
    sfx.pick();
  }

  /** Declares the board impossible, or gives the proof up, at the second press. */
  function grave(what: "declare" | "forfeit"): void {
    if (latest === null || pending) return;
    if (what === "declare" && latest.view.last === null) return deny(WORDS.refused["nothing-placed"]);
    if (sure !== what || sureT <= 0) {
      sure = what;
      sureT = SURE;
      say(what === "declare" ? WORDS.say.declareAgain : WORDS.say.forfeitAgain);
      sfx.move();
      return;
    }
    sure = null;
    pending = handlers.act({ type: what });
    if (!pending) return say(WORDS.notSent);
    sfx.pick();
  }

  /** Sends the proof drawn: every path, and for a piece without a partner the square its path ends on. */
  function sendProof(): void {
    if (latest === null || pending) return;
    const board = latest.view.board;
    // what is missing is said in the proof's own words: a path that has arrived and is too short, or a pair with no path to its end yet
    const open = wanted().filter((which) => !joined(which));
    const arrived = (which: string): boolean => {
      const path = paths.get(which);
      if (path === undefined || path.length < 2) return false;
      const mate = mateOf(which, path[0]);
      return mate === null || path[path.length - 1] === mate;
    };
    if (open.some(arrived)) return deny(WORDS.refused["path-too-short"]);
    if (open.length > 0) return deny(WORDS.refused["pair-missing"]);
    const alone = unpaired(board.cells, latest.rules);
    const partners: Placing[] = [];
    for (const which of alone) {
      const path = paths.get(which);
      if (path !== undefined && path.length >= 2) partners.push({ letter: which, cell: path[path.length - 1] });
    }
    const drawn = [...paths.values()].filter((path) => path.length >= 2).map((path) => [...path]);
    const wrong = checkProof(board, partners, drawn, latest.rules);
    if (wrong !== null) return deny(WORDS.refused[wrong] ?? WORDS.refusedOther);
    pending = handlers.act({ type: "prove", partners, paths: drawn });
    if (!pending) return say(WORDS.notSent);
    sfx.pick();
  }

  /** Takes the path being drawn away, or every path where none is. */
  function erasePaths(): void {
    if (paths.size > 0) sfx.back();
    if (active !== null && paths.has(active)) paths.delete(active);
    else paths.clear();
    active = null;
    drawing = false;
  }

  /** The square the keys come to from `from` by `code`: the next square of the board that way, over what is no square. */
  function stepped(from: number, code: string): number {
    const { width, height } = grid();
    const [dx, dy] = code === "ArrowLeft" ? [-1, 0] : code === "ArrowRight" ? [1, 0] : code === "ArrowUp" ? [0, -1] : [0, 1];
    let [x, y] = [from % width, Math.floor(from / width)];
    for (;;) {
      x += dx;
      y += dy;
      if (x < 0 || x >= width || y < 0 || y >= height) return from;
      if (cellsNow()[y * width + x] !== NONE) return y * width + x;
    }
  }

  function stepInput(): void {
    if (latest === null) return;
    const pressed = (...codes: string[]): boolean => codes.some((code) => keys.includes(code));
    const clicked = (rect: Box, finger?: Reach): boolean => clicks.some((p) => hits(p, rect, finger));
    if (pressed("KeyM")) setMuted(!isMuted());
    const was = help;
    if (pressed("KeyH")) help = !help;
    if (help && (pressed("Escape", "Enter") || clicks.length > 0)) help = false;
    // the page's own buttons lie over the frame: they give way while the sheet is up
    if (help !== was) handlers.covered(help);
    // (results that were under the sheet are up from now: their buttons wait as they do when a game ends in sight)
    if (was && !help && latest.view.phase === "ended") endedAt = time;
    if (help || was) return;

    const view = latest.view;
    if (view.phase === "ended") {
      // (the two buttons take no press in the first moment the results are up: `RESULTS_PRESS_HOLD`)
      const pressable = time - endedAt >= RESULTS_PRESS_HOLD;
      if (pressed("Escape") || (pressable && clicked(LOBBY_RECT, LOBBY_REACH))) {
        handlers.lobby();
      } else if ((pressed("Enter", "NumpadEnter", "KeyR") && time - endedAt >= RESULTS_HOLD) || (host && pressable && clicked(AGAIN_RECT, AGAIN_REACH))) {
        if (host) askAgain();
        // (someone who is not the host says with the same key that they would play one more: the tab beside the log shows it)
        else if (!handlers.wantAgain()) say(WORDS.refused["not-host"]);
      }
      return;
    }
    if (view.you === null || latest.frozen || pending) return;

    if (choosing()) {
      const first = pressed("Num:1") || clicked(FIRST_RECT);
      const second = pressed("Num:2") || clicked(SECOND_RECT);
      if (!first && !second) return;
      pending = handlers.act({ type: "choose", first });
      if (!pending) return say(WORDS.notSent);
      sfx.pick();
      return;
    }

    if (placing()) {
      const letters = lettersLeft(cellsNow(), latest.rules);
      for (const code of keys) {
        if (code.startsWith("Arrow")) cursor = stepped(cursor, code);
        else if (code === "Space") put(cursor);
        else if (code === "KeyE" || code === "Tab") letter = letters[(letters.indexOf(letter) + 1) % Math.max(1, letters.length)] ?? "";
        else if (code === "KeyQ") letter = letters[(letters.indexOf(letter) + letters.length - 1) % Math.max(1, letters.length)] ?? "";
        else if (code === "Enter" || code === "NumpadEnter") sendPieces();
        else if (code === "KeyX") grave("declare");
        else if (code === "Escape" || code === "Backspace") draft = [];
        else continue;
        if (code.startsWith("Arrow") || code === "Space") keyed = true;
        if (pending) return;
      }
      for (const p of clicks) {
        if (pending) return;
        if (hits(p, MAIN_RECT)) sendPieces();
        else if (hits(p, ERASE_RECT)) {
          if (draft.length > 0) sfx.back();
          draft = [];
        } else if (hits(p, GRAVE_RECT)) grave("declare");
        else {
          const picked = [...latest.rules.letters].findIndex((_, index) => hits(p, paletteBox(index), PALETTE_REACH));
          const cell = cellAt(p.x, p.y);
          if (picked >= 0) {
            const which = latest.rules.letters[picked];
            if (letters.includes(which)) {
              letter = which;
              sfx.move();
            } else deny(WORDS.refused["colour-used"]);
          } else if (cell !== null) {
            keyed = false;
            put(cell);
          }
        }
      }
      return;
    }

    if (!proving()) return;
    for (const code of keys) {
      if (code.startsWith("Arrow")) {
        keyed = true;
        if (!drawing || active === null) cursor = stepped(cursor, code);
        else {
          // the path goes with the keys, a square at a time
          const { width, height } = grid();
          const [x, y] = [cursor % width, Math.floor(cursor / width)];
          const [nx, ny] = code === "ArrowLeft" ? [x - 1, y] : code === "ArrowRight" ? [x + 1, y] : code === "ArrowUp" ? [x, y - 1] : [x, y + 1];
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && extend(active, ny * width + nx)) cursor = ny * width + nx;
          else sfx.deny();
        }
      } else if (code === "Space") {
        keyed = true;
        if (drawing) drawing = false;
        else {
          pressProof(cursor);
          drawing = active !== null && paths.get(active)?.at(-1) === cursor;
        }
      } else if (code === "Enter" || code === "NumpadEnter") sendProof();
      else if (code === "KeyX") grave("forfeit");
      else if (code === "Escape" || code === "Backspace") erasePaths();
      if (pending) return;
    }
    for (const p of clicks) {
      if (pending) return;
      if (hits(p, MAIN_RECT)) sendProof();
      else if (hits(p, ERASE_RECT)) erasePaths();
      else if (hits(p, GRAVE_RECT)) grave("forfeit");
      else {
        const cell = cellAt(p.x, p.y);
        if (cell !== null) {
          keyed = false;
          drawing = false;
          pressProof(cell);
        }
      }
    }
    // the pointer, pressed down, draws the path on from square to square
    if (held && active !== null) {
      for (const p of drags) {
        const cell = cellAt(p.x, p.y);
        if (cell !== null) stretch(cell);
      }
    }
  }

  // ---- One step of the screen's clock ---------------------------------------------------------------
  function step(): void {
    const dt = STEP;
    time += dt;
    if (noteT > 0) noteT -= dt;
    if (sureT > 0) sureT -= dt;
    for (const [player, line] of speech) {
      line.t -= dt;
      if (line.t <= 0) speech.delete(player);
    }
    if (latest !== null) {
      const view = latest.view;
      const fresh = Math.min(view.events - seen, view.history.length);
      seen = view.events;
      for (const event of fresh > 0 ? view.history.slice(-fresh) : []) show(event);
      // my own time is nearly up: a tick a second
      const mine = choosing() || placing() || proving() ? left(latest.clock.turn) : null;
      const second = mine === null ? null : Math.ceil(mine / 1000);
      if (second === null || second > HURRY_FROM) ticked = -1;
      else if (second !== ticked) {
        ticked = second;
        if (second > 0) sfx.move();
      }
    }
    stepInput();
    keys.length = 0;
    clicks.length = 0;
    drags.length = 0;
  }

  // ---- Drawing ---------------------------------------------------------------------------------------
  function plate(words: string, y: number, colour: string): void {
    const width = Math.min(SCENE_W - 4, Math.max(120, pen.width(words) + 16));
    const x = Math.round(SCENE_W / 2 - width / 2);
    pen.px(x, y, width, 17, C.ink);
    pen.txt(pen.fit(words, width - 8), x + Math.round(width / 2), y + 2, colour, "center");
  }

  function button(rect: Box, label: string, lit: boolean, on: boolean): void {
    const [x, y, w, h] = rect;
    pen.px(x, y, w, h, lit ? C.amberD : C.steelDD);
    pen.px(x + 1, y + 1, w - 2, h - 2, lit ? "#3a2a12" : on && inRect(mouse, rect) ? C.btnH : C.btn);
    if (label !== "") pen.txt(pen.fit(label, w - 4), x + Math.round(w / 2), y + Math.round((h - 13) / 2), lit ? C.amber : on ? C.bone : C.dim, "center");
  }

  /** A piece of `which`, `r` pixels from its middle to its rim; one not placed yet is drawn `faint`. */
  function piece(x: number, y: number, r: number, which: string, faint = false): void {
    const [fill, ink] = PIECE[which] ?? OTHER_PIECE;
    pen.ell(x, y, r, r, faint ? C.ink : shade(fill, 0.55));
    pen.ell(x, y, r - 1, r - 1, faint ? shade(fill, 0.6) : fill);
    const rows = SMALL_LETTERS[which];
    if (rows !== undefined && r >= 5) pen.bmp(rows, Math.round(x) - 2, Math.round(y) - 3, faint ? shade(ink, 0.8) : ink);
  }

  /** The edge of a box `r` pixels round (`x`, `y`), a pixel thick. */
  function ring(x: number, y: number, r: number, colour: string): void {
    const side = r * 2 + 1;
    pen.px(x - r, y - r, side, 1, colour);
    pen.px(x - r, y + r, side, 1, colour);
    pen.px(x - r, y - r, 1, side, colour);
    pen.px(x + r, y - r, 1, side, colour);
  }

  /** A path over the squares of `path`, in the colour of `which`. */
  function trail(path: readonly number[], which: string, whole: boolean): void {
    const [fill] = PIECE[which] ?? OTHER_PIECE;
    for (const [thick, colour] of [[5, C.ink], [3, whole ? fill : shade(fill, 0.7)]] as const) {
      for (let at = 1; at < path.length; at++) {
        const [x0, y0] = pointOf(path[at - 1]);
        const [x1, y1] = pointOf(path[at]);
        pen.line(x0, y0, x1, y1, thick, colour);
      }
    }
  }

  function drawBoard(): void {
    if (latest === null) return;
    const view = latest.view;
    const g = grid();
    const cells = view.board.cells;
    [...cells].forEach((cell, at) => {
      if (cell === NONE) return;
      const [x, y] = [g.x + (at % g.width) * g.pitch, g.y + Math.floor(at / g.width) * g.pitch];
      pen.px(x, y, g.pitch, g.pitch, TILE_EDGE);
      pen.px(x + 1, y + 1, g.pitch - 1, g.pitch - 1, TILE);
    });
    // the paths: those of a proof the room took, or those being drawn here
    const shown = view.log.at(-1);
    if ((view.phase === "show" || view.phase === "ended") && shown !== undefined && shown.round === view.round) {
      for (const path of shown.paths) trail(path, shown.cells[path[0]] ?? "", true);
    } else if (proving()) {
      for (const [which, path] of paths) trail(path, which, joined(which));
    }
    const flash = time - placedAt < FLASH;
    [...cells].forEach((cell, at) => {
      if (cell === EMPTY || cell === NONE) return;
      const [x, y] = pointOf(at);
      piece(x, y, g.r, cell);
      // the pieces placed last: marked out for a moment
      if (view.phase === "place" && placed.includes(at) && flash && Math.floor(time * 5) % 2 === 0) ring(x, y, g.r + 1, C.amber);
    });
    if (proving()) {
      // where the partner of a piece without one goes: the end of its path
      for (const [which, path] of paths) {
        if (path.length < 2 || mateOf(which, path[0]) !== null) continue;
        const [x, y] = pointOf(path[path.length - 1]);
        piece(x, y, g.r, which, !joined(which));
      }
      const head = active === null ? undefined : paths.get(active)?.at(-1);
      if (head !== undefined && Math.floor(time * 4) % 2 === 0) {
        const [x, y] = pointOf(head);
        ring(x, y, g.r + 1, C.amber);
      }
    }
    if (placing()) {
      for (const each of draft) {
        const [x, y] = pointOf(each.cell);
        piece(x, y, g.r, each.letter);
        ring(x, y, g.r + 1, Math.floor(time * 4) % 2 === 0 ? C.amber : C.amberD);
      }
    }
    if (!placing() && !proving()) return;
    const over = keyed ? cursor : mouse.x >= 0 ? cellAt(mouse.x, mouse.y) : null;
    if (over !== null && !pending) {
      const [x, y] = pointOf(over);
      const free = cells[over] === EMPTY || proving() || draft.some((each) => each.cell === over);
      ring(x, y, Math.floor(g.pitch / 2) - 1, free ? C.bone : C.crim);
    }
  }

  /** What stands to the left of the board. */
  function drawSide(): void {
    if (latest === null) return;
    const view = latest.view;
    const rules = latest.rules;
    const mine = me();
    view.players.forEach((player, at) => {
      const y = LEGEND_Y + at * 14;
      const waited = view.phase === "choose" ? view.chooser === player : view.phase === "place" ? view.turn === player : view.phase === "prove" && view.prover === player;
      if (waited) pen.px(SIDE_X - 3, y + 2, 2, 9, C.amber);
      // a point a square, as many squares as win
      const points = pointsOf(player);
      for (let n = 0; n < rules.goal; n++) pen.px(SIDE_X + SIDE_W - (rules.goal - n) * 8, y + 3, 6, 6, n < points ? C.teal : C.steelDD);
      pen.txt(pen.fit(nickOf(player), SIDE_W - rules.goal * 8 - 4), SIDE_X, y, mine === player ? C.amber : C.bone);
    });
    pen.px(SIDE_X, ROUND_Y - 4, SIDE_W, 1, C.steelDD);
    pen.txt(pen.fit(WORDS.side.round(view.round, rules.rounds), SIDE_W), SIDE_X, ROUND_Y, C.bone);
    const all = wanted();
    const second = proving() ? WORDS.side.joined(all.filter(joined).length, all.length) : WORDS.side.pieces(view.pieces);
    pen.txt(pen.fit(second, SIDE_W), SIDE_X, ROUND_Y + 14, C.boneD);
    // the colours: how many pieces of each are not placed yet
    const picking = placing() && !pending;
    [...rules.letters].forEach((which, index) => {
      const [x, y] = paletteBox(index);
      const count = countOf(which);
      const chosen = (picking && which === letter) || (proving() && which === active);
      if (chosen) {
        pen.px(x, y, PALETTE_W - 1, PALETTE_H - 1, C.amber);
        pen.px(x + 1, y + 1, PALETTE_W - 3, PALETTE_H - 3, C.btn);
      } else if (picking && count < 2 && inRect(mouse, paletteBox(index))) pen.px(x, y, PALETTE_W - 1, PALETTE_H - 1, C.btnH);
      piece(x + 11, y + 9, 6, which, count >= 2);
      for (let n = 0; n < 2 - count; n++) pen.px(x + 8 + n * 5, y + 17, 3, 2, C.boneD);
    });
  }

  function drawScene(): void {
    if (latest === null) return;
    const view = latest.view;
    pen.px(0, 0, SCENE_W, BAR_Y, C.night);
    drawSide();
    drawBoard();
    if (latest.frozen && view.phase !== "ended") {
      // the game's own clock stands still; this one runs, and ends the game at nought
      const stand = latest.clock.stand === null ? null : Math.max(0, latest.clock.stand - (performance.now() - receivedAt));
      plate(WORDS.waitingBack(stand === null ? null : Math.ceil(stand / 1000)), 96, C.boneD);
    }
  }

  /** The words for where the game stands, and their colour. */
  function standing(): [string, string] {
    if (latest === null) return ["", C.boneD];
    const view = latest.view;
    if (noteT > 0) return [note, C.amber];
    if (offline) return [WORDS.standing.offline, C.crim];
    if (view.phase === "ended") return [WORDS.standing.over, C.amber];
    if (latest.frozen) return [WORDS.standing.paused, C.boneD];
    const ms = left(latest.clock.turn);
    const clock = ms === null ? "" : clockOf(ms);
    if (pending) return [WORDS.standing.sending, C.boneD];
    const who = (player: number | null): string => pen.fit(nickOf(player ?? -1), 90);
    if (view.phase === "choose") {
      if (view.you === null) return [WORDS.standing.chooseOther(who(view.chooser), clock), C.bone];
      return choosing() ? [WORDS.standing.choose(clock), C.amber] : [WORDS.standing.chooseWait(clock), C.bone];
    }
    if (view.phase === "place") {
      if (view.you === null) return [WORDS.standing.placeOther(who(view.turn), clock), C.bone];
      if (!placing()) return [WORDS.standing.placeWait(clock), C.bone];
      if (!view.room) return [WORDS.standing.placeNone(clock), C.crim];
      const blank = view.due - draft.length;
      return blank > 0 ? [WORDS.standing.place(view.due, blank, clock), C.amber] : [WORDS.standing.placeReady(clock), C.teal];
    }
    if (view.phase === "prove") {
      if (view.you === null) return [WORDS.standing.proveOther(who(view.prover), clock), C.bone];
      if (!proving()) return [WORDS.standing.proveWait(clock), C.bone];
      const all = wanted();
      const done = all.filter(joined).length;
      return done < all.length ? [WORDS.standing.prove(done, all.length, clock), C.amber] : [WORDS.standing.proveReady(clock), C.teal];
    }
    // a round's outcome on show: who has its point, and how
    const shown = view.log.at(-1);
    return shown === undefined ? [WORDS.standing.show("", clock), C.boneD] : [WORDS.standing.show(WORDS.round[shown.how](who(shown.winner)), clock), C.amber];
  }

  function drawPanel(): void {
    if (latest === null) return;
    const view = latest.view;
    const x = PANEL_X;
    const mine = me();
    pen.px(SCENE_W, 0, W - SCENE_W, BAR_Y, C.night);
    pen.px(SCENE_W, 0, 1, BAR_Y, C.steelDD);
    pen.txt(WORDS.heading(view.round, view.phase), x, 3, C.bone);
    const turn = left(latest.clock.turn);
    if (turn !== null) pen.txt(clockOf(turn), W - 5, 3, Math.ceil(turn / 1000) <= HURRY_FROM ? C.crim : C.boneD, "right");
    // while the game is played the players stand in the order of their numbers; at its end, of their places
    const order = view.places !== null ? view.places.map((each) => each.player) : view.players;
    const layout = panelLayout(order.length);
    if (!layout.crowded) pen.px(x, 16, PANEL_WIDTH, 1, C.steelDD);
    order.forEach((player, at) => {
      const { dx, y } = entryAt(layout, at);
      const ex = x + dx;
      let right = ex + layout.entryWidth - 1;
      const info = latest!.players.find((one) => one.id === player);
      const gone = info !== undefined && (info.left || !info.connected);
      const waited = view.phase === "choose" ? view.chooser === player : view.phase === "place" ? view.turn === player : view.phase === "prove" && view.prover === player;
      // who the game waits for
      if (waited) pen.px(ex - 3, y + 2, 2, 9, C.amber);
      const declared = view.phase === "prove" && view.declarer === player;
      const words =
        view.phase === "ended"
          ? view.places === null
            ? ""
            : WORDS.result.outcome(view.winner === null ? "level" : view.winner === player ? "won" : "lost")
          : declared
            ? WORDS.status.declared
            : !waited
              ? ""
              : view.phase === "choose"
                ? WORDS.status.choosing
                : view.phase === "place"
                  ? WORDS.status.placing
                  : WORDS.status.proving;
      pen.txt(words, right, y, view.phase === "ended" ? C.brass : declared ? C.teal : C.boneD, "right");
      right -= pen.width(words) + 4;
      const voice = info === undefined || info.bot || info.left ? "out" : handlers.voice(player);
      pen.txt(`${pointsOf(player)}`, ex, y, C.brass);
      const room = right - ex - 12 - (voice !== "out" ? VOICE_MARK_W + 2 : 0);
      const name = pen.fit(info?.nick ?? "", Math.min(NAME_WIDTH, room));
      pen.txt(name, ex + 12, y, gone ? C.dim : mine === player ? C.amber : C.bone);
      if (voice !== "out") drawVoiceMark(pen, ex + 12 + pen.width(name) + 2, y, voice, time);
    });
    pen.px(x, 86, PANEL_WIDTH, 1, C.steelDD);
    // the log: the latest of what was done
    const lines: [string, string][] = [];
    const short = (player: number): string => pen.fit(nickOf(player), LOG_NAME);
    for (const event of view.history) {
      if (event.type === "round") lines.push([WORDS.log.round(event.round), C.amber]);
      else if (event.type === "chose") lines.push([!event.forced ? WORDS.log.chose(short(event.player), event.first === event.player) : event.first === event.player ? WORDS.log.drawn(short(event.first)) : WORDS.log.choseLate(short(event.player)), C.boneD]);
      else if (event.type === "placed") lines.push([WORDS.log.placed(short(event.player), event.pieces.map((each) => each.letter).join(" ")), C.bone]);
      else if (event.type === "declared") lines.push([WORDS.log.declared(short(event.player)), C.crim]);
      else if (event.type === "round-over") lines.push([WORDS.log.over[event.how](short(event.winner)), C.teal]);
      else lines.push([WORDS.ended[event.reason], C.amber]);
    }
    const from = Math.max(0, lines.length - layout.logRows);
    for (let i = from; i < lines.length; i++) pen.txt(pen.fit(lines[i][0], PANEL_WIDTH), x, layout.logTop + (i - from) * LOG_PITCH, lines[i][1]);
    // a chat line beside its speaker's name, over the edge of the scene
    for (const [player, line] of speech) {
      const at = order.indexOf(player);
      if (at >= 0) drawSpeech(pen, { label: { x: SCENE_W, y: entryAt(layout, at).y, align: "left" } }, line.lines);
    }
  }

  /** How the game came out for the player the screen is for: won, lost, or neither won; `null` while it is played, for someone who watched, and for a game cut short. */
  function outcome(): "won" | "lost" | "level" | null {
    const mine = me();
    if (latest === null || latest.view.places === null || mine === null) return null;
    return latest.view.winner === null ? "level" : latest.view.winner === mine ? "won" : "lost";
  }

  /** What this player came out of the game with, in the word the results lead with. */
  function verdict(): string | null {
    const own = outcome();
    return own === null ? null : WORDS.result.outcome(own);
  }

  function drawResults(): void {
    if (latest === null) return;
    const view = latest.view;
    const own = outcome();
    pen.txt(own === null ? WORDS.result.over : WORDS.result.outcome(own), 10, 234, own === "won" ? C.teal : C.bone, "left", 24);
    const named = view.winner === null ? (view.places === null ? "" : WORDS.result.nobody) : WORDS.result.winner(pen.fit(nickOf(view.winner), 120));
    pen.txt(pen.fit(named, RESULT_WIDTH), 96, 226, C.bone);
    // the points of the player the screen is for first, or the winner's for someone watching
    const lead = view.you ?? view.winner ?? view.players[0];
    const other = view.players.find((each) => each !== lead) ?? lead;
    const how = view.ended === null ? "" : view.ended === "played" ? WORDS.result.how(pointsOf(lead), pointsOf(other), view.round) : WORDS.ended[view.ended];
    pen.txt(pen.fit(how, RESULT_WIDTH), 96, 240, C.boneD);
    if (noteT > 0) pen.txt(pen.fit(note, RESULT_WIDTH), 96, 254, C.amber);
    else pen.txt(starting ? WORDS.standing.sending : host ? WORDS.result.hostNext : handlers.out() ? WORDS.result.waitHostOut : WORDS.result.waitHost, 96, 254, C.boneD);
    // (dim while they take no press yet: `RESULTS_PRESS_HOLD`)
    const pressable = time - endedAt >= RESULTS_PRESS_HOLD;
    if (host) button(AGAIN_RECT, WORDS.button.again, !starting && pressable, !starting && pressable);
    button(LOBBY_RECT, WORDS.button.lobby, false, pressable);
  }

  function drawBar(): void {
    if (latest === null) return;
    pen.px(0, BAR_Y, W, H - BAR_Y, C.bar);
    pen.px(0, BAR_Y, W, 1, C.steelDD);
    const view = latest.view;
    if (view.phase === "ended") {
      drawResults();
      return;
    }
    const [words, colour] = standing();
    pen.txt(pen.fit(words, W - 12), 6, 225, colour);
    // which keys open the rules and mute the sound; under a finger, where the menu that does is
    const idle = TOUCH ? PAGE.menu.hint : WORDS.keys.idle;
    if (view.you === null) {
      // someone watching is told what the game is, over the keys
      pen.txt(pen.fit(WORDS.sheet.brief.goal, W - 12), 6, 240, C.boneD);
      pen.txt(idle, 6, 254, C.dim);
      return;
    }
    const on = !pending && !latest.frozen;
    const waiting = sure !== null && sureT > 0;
    if (choosing()) {
      button(FIRST_RECT, WORDS.button.first, false, on);
      button(SECOND_RECT, WORDS.button.second, false, on);
      pen.txt(pen.fit(idle, FIRST_RECT[0] - 12), 6, 246, C.dim);
      return;
    }
    if (placing()) {
      button(MAIN_RECT, WORDS.button.place, on && view.room && draft.length === view.due, on && view.room);
      button(ERASE_RECT, WORDS.button.clear, false, on && draft.length > 0);
      button(GRAVE_RECT, waiting && sure === "declare" ? WORDS.button.declareSure : WORDS.button.declare, (waiting && sure === "declare") || !view.room, on && view.last !== null);
      pen.txt(pen.fit(TOUCH ? PAGE.menu.hint : WORDS.keys.place, HINT_WIDTH), 6, 246, C.dim);
      return;
    }
    if (proving()) {
      const all = wanted();
      button(MAIN_RECT, WORDS.button.prove, on && all.every(joined), on);
      button(ERASE_RECT, WORDS.button.clearPath, false, on && paths.size > 0);
      button(GRAVE_RECT, waiting && sure === "forfeit" ? WORDS.button.forfeitSure : WORDS.button.forfeit, waiting && sure === "forfeit", on);
      pen.txt(pen.fit(TOUCH ? PAGE.menu.hint : WORDS.keys.prove, HINT_WIDTH), 6, 246, C.dim);
      return;
    }
    pen.txt(pen.fit(idle, W - 12), 6, 246, C.dim);
  }

  function drawHelp(): void {
    if (latest === null) return;
    const lines = WORDS.help(latest.rules);
    pen.clear(C.night);
    pen.px(8, 8, W - 16, H - 16, C.steelDD);
    pen.px(9, 9, W - 18, H - 18, C.bar);
    lines.forEach((line, i) => {
      if (line.text !== "") pen.txt(pen.fit(line.text, W - 44), 22, 20 + i * 15, line.tone === "title" ? C.amber : line.tone === "dim" ? C.boneD : line.tone === "mark" ? C.teal : C.bone);
    });
  }

  function draw(): void {
    pen.clear(C.night);
    if (latest === null) return;
    if (help) {
      drawHelp();
      return;
    }
    drawScene();
    drawPanel();
    drawBar();
  }

  // ---- The screen, the loop and the listeners ---------------------------------------------------------
  canvas.width = W;
  canvas.height = H;
  ctx.imageSmoothingEnabled = false;

  const onKeyDown = (event: KeyboardEvent): void => {
    if (canvas.hidden) return;
    // a key typed into a text box (the chat) is not for the game, and neither is one pressed on a button
    // the player has gone to with the keyboard: that key is the button's
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLButtonElement) return;
    startAudio();
    // a number is taken by what the key types, wherever a keyboard has it; anything else by the key itself
    if (event.key.length === 1 && "0123456789".includes(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) keys.push(`Num:${event.key}`);
    else if (!event.repeat || event.code.startsWith("Arrow")) keys.push(event.code);
    if (event.code === "Space" || event.code.startsWith("Arrow") || event.code === "Backspace") event.preventDefault();
  };
  const unwatch = watchPointer(canvas, W, H, {
    move(p): void {
      mouse.x = p.x;
      mouse.y = p.y;
      if (held) drags.push(p);
    },
    down(p): void {
      startAudio();
      mouse.x = p.x;
      mouse.y = p.y;
      held = true;
      clicks.push(p);
    },
    up(): void {
      held = false;
    },
    // a pointer that has left the screen, or a finger that has lifted, is over none of its buttons
    gone(): void {
      held = false;
      mouse.x = -1;
      mouse.y = -1;
    },
  });
  addEventListener("keydown", onKeyDown);

  let last = performance.now() / 1000;
  let owed = 0;
  function loop(): void {
    if (stopped) return;
    const now = performance.now() / 1000;
    // a stalled tab never fast-forwards the screen
    owed += Math.min(now - last, 0.25);
    last = now;
    let stepped = false;
    while (owed >= STEP) {
      step();
      owed -= STEP;
      stepped = true;
    }
    // nothing on the screen moves between two steps: a display faster than the screen's clock is not drawn the same picture twice
    if (stepped) draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  // the pixel font comes with the page: draw again once it is in
  void pixelFont();

  return {
    update,
    verdict,
    // a game that stands still waits on no one
    waits: (): boolean => latest !== null && !latest.frozen && linkWaits(latest.view),
    refused(reason: string): void {
      starting = false;
      pending = false;
      say(WORDS.refused[reason] ?? WORDS.refusedOther);
      sfx.deny();
    },
    lost(): void {
      starting = false;
      // whether what was sent reached the room is not known: the game the room sends on coming back will say
      pending = false;
      offline = true;
    },
    setHost(value: boolean): void {
      host = value;
    },
    say(slot: number, text: string): void {
      if (latest === null) return;
      // someone watching has no place to speak from: their line is in the chat alone
      const player = latest.players.find((each) => each.id === slot && !each.bot && !each.left);
      if (player === undefined) return;
      speech.set(slot, { lines: speechLines(pen, text), t: speechSeconds(text) });
    },
    press(code: string): void {
      keys.push(code);
    },
    destroy(): void {
      stopped = true;
      removeEventListener("keydown", onKeyDown);
      unwatch();
    },
  };
}
