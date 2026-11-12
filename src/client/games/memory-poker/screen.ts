/**
 * The screen of 기억 포커: the board of cards, the shared cards beside it,
 * what the player has chosen, and how each round went.
 *
 * Design: design/games/memory-poker.md. The room decides everything; this
 * screen shows what it sends and asks it to take a choice. While the board
 * is turned over the room sends none of its cards, so there is nothing here
 * to look up: a card's back shows the letter of its cell, as the document's
 * board does. Cards are chosen with the pointer or a finger, or with the
 * arrow keys and Space; Enter, or the button of the bar, makes the choice
 * final.
 */
import { rankOf, suitOf, type Card, type Hand } from "../../../shared/games/memory-poker/cards";
import type { Outcome, PokerEvent } from "../../../shared/games/memory-poker/rules";
import { hits, type Press, type Reach } from "../../../shared/frame";
import type { ServerMessage } from "../../../shared/protocol";
import type { VoiceMark } from "../../../shared/voice";
import { BAR_Y, H, PANEL_X, Pen, SCENE_W, VOICE_MARK_W, W, drawSpeech, drawVoiceMark, speechLines, speechSeconds } from "../../game/draw";
import { C } from "../../game/palette";
import { AGAIN_REACH, LOBBY_REACH, watchPointer } from "../../game/pointer";
import { isMuted, setMuted, sfx, startAudio } from "../../game/sound";
import { TOUCH } from "../../touch";
import { WORDS as PAGE } from "../../words";
import { LOG_PITCH, PANEL_WIDTH, entryAt, isCrowded, panelLayout, underList } from "../panel";
import { WORDS } from "./words";

/** What the room sends about a game of 기억 포커. */
export type PokerMessage = Extract<ServerMessage, { type: "game"; game: "memory-poker" }>;

/** What the screen asks of whoever owns the connection. */
export interface PokerHandlers {
  /** The player chose cards, or made the choice final. Returns whether it could be sent. */
  act(action: unknown): boolean;
  /** The host asked for the next game. */
  again(): boolean;
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
export interface PokerScreen {
  update(message: PokerMessage): void;
  refused(reason: string): void;
  lost(): void;
  setHost(host: boolean): void;
  say(slot: number, text: string): void;
  press(code: string): void;
  /** What this player came out of the game with, once it is over (`GameScreen.verdict`). */
  verdict(): string | null;
  destroy(): void;
}

/** One step of the screen's clock, in seconds. */
const STEP = 1 / 60;
/** Where the board is drawn: the left of the scene, under the page's own buttons. */
const BOARD = { x: 8, y: 26, w: 156, h: 188 };
/** How far apart two cards are, in pixels. */
const GAP = 4;
/** Beside the board: the shared cards, and under them the player's own round. */
const SIDE_X = 176;
const SIDE_W = 124;
/** A shared card, and the top of their row. */
const CARD_W = 36;
const CARD_H = 44;
const SHARED_Y = 20;
/** The widest a name is drawn in the list of players, in pixels. */
const NAME_WIDTH = 62;
/** With this many seconds or fewer of a phase left, the clock turns red. */
const HURRY_FROM = 5;
/**
 * Seconds the results are on show before Enter starts another game: the host
 * may have been pressing Enter to make a choice final at the moment the game
 * ended.
 */
const RESULTS_HOLD = 1.5;
/** How many of the first places the results name in the bar. */
const PLACES_SHOWN = 3;
/** A card's face and its back. */
const FACE = "#efe6cc";
const BACK = "#1b2140";
const BACK_PICKED = "#3a2a12";
const BACK_LINE = "#343b63";
/** The suits, in the order of the cards' numbers: each its own colour, so that five of one can be told at a glance. */
const SUIT_COLOURS = ["#161a2b", "#d42a3c", "#2563c9", "#1f8a4c"];
/** A suit's sign, nine pixels square. */
const PIPS: readonly (readonly string[])[] = [
  ["....#....", "...###...", "..#####..", ".#######.", "#########", "#########", ".##.#.##.", "....#....", "...###..."],
  [".##...##.", "####.####", "#########", "#########", ".#######.", "..#####..", "...###...", "....#....", "........."],
  ["....#....", "...###...", "..#####..", ".#######.", "#########", ".#######.", "..#####..", "...###...", "....#...."],
  ["...###...", "..#####..", "...###...", ".##.#.##.", "#########", "#########", ".##.#.##.", "....#....", "...###..."],
];
const PIP = 9;
/** What the court cards and the ace are called on a card. */
const RANK_NAMES: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };

type Box = readonly [number, number, number, number];

const inRect = (p: { x: number; y: number }, r: Box): boolean => p.x >= r[0] && p.x < r[0] + r[2] && p.y >= r[1] && p.y < r[1] + r[3];

const LOCK_RECT: Box = [386, 238, 90, 28];
const AGAIN_RECT: Box = [386, 225, 90, 15];
const LOBBY_RECT: Box = [386, 250, 90, 15];

/** A rank as a card shows it. */
const rankName = (rank: number): string => RANK_NAMES[rank] ?? `${rank}`;
/** The letter of a cell, as the document letters its board: A at the top left, row by row. */
const letterOf = (cell: number): string => String.fromCharCode(65 + cell);
/** A hand as it is called: the rank it is named by, and its kind. */
const handName = (hand: Hand): string => WORDS.hand(rankName(hand.ranks[0]), WORDS.kind[hand.kind]);

/** Makes `canvas` the game screen. Nothing is drawn until the first {@link PokerScreen.update}. */
export function createPokerScreen(canvas: HTMLCanvasElement, handlers: PokerHandlers): PokerScreen {
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2D drawing in this browser");
  const ctx: CanvasRenderingContext2D = context;
  const pen = new Pen(ctx);

  let latest: PokerMessage | null = null;
  /**
   * When the latest message arrived, by the browser's own clock in ms. The
   * room's clocks are counted from here in real time: the screen's `time`
   * stops while the tab is hidden.
   */
  let receivedAt = 0;
  /** Seconds since the screen was made; drives what moves on it. */
  let time = 0;
  /** How many events of the history have been shown. */
  let seen = 0;
  /** A final choice has been sent and the room has not answered yet. */
  let pending = false;
  /** The host has asked for the next game and the room has not answered yet. */
  let starting = false;
  /** The game as the room last sent it: what is shown again if the final choice drawn ahead of the room is refused. */
  let truth: PokerMessage | null = null;
  /** Whether the player's own final choice has been sounded as it was made: the room's word of it is then not sounded again. */
  let lockSounded = false;
  /** The connection to the room is down; the next thing the room sends says it is back. */
  let offline = false;
  let host = false;
  let help = false;
  let note = "";
  let noteT = 0;
  /** The cells chosen so far this round, the earliest first. */
  let selection: number[] = [];
  /** The round this page has chosen in: until that round is over, what it holds counts, not what the room last sent. */
  let touched: string | null = null;
  /** The cell the keyboard is on, and whether that is shown: it is once an arrow or Space has been pressed. */
  let cursor = 0;
  let cursorOn = false;
  /** `time` when the game on show was first seen to be over. */
  let endedAt = 0;
  /** By player: a chat line beside their name. */
  const speech = new Map<number, { lines: string[]; t: number }>();

  /** The keys pressed since the last step, in the order they were pressed. */
  const keys: string[] = [];
  const clicks: Press[] = [];
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
  /** Those `player` is set against this round, themselves among them. */
  const groupOf = (player: number | null): number[] => (player === null ? [] : (latest?.view.groups.find((group) => group.includes(player)) ?? []));
  /** The cells `player` is shown to have chosen, once the round is shown. */
  const shownCells = (player: number): number[] => latest?.view.shown?.hands.find((hand) => hand.player === player)?.cells ?? [];
  /** How the round went for `player`, once it is shown. */
  function markOf(player: number, outcomes: readonly Outcome[]): "win" | "tie" | "loss" | null {
    const outcome = outcomes.find((each) => each.players.includes(player));
    if (outcome === undefined) return null;
    return outcome.winner === player ? "win" : outcome.best.includes(player) ? "tie" : "loss";
  }
  /** Whether the player at this screen could change their choice now. */
  function canChoose(): boolean {
    return latest !== null && latest.view.phase === "choose" && !latest.frozen && latest.view.mine !== null && !latest.view.mine.locked;
  }
  /** Where cell `cell` of the board is drawn. */
  function cellRect(cell: number): Box {
    const { rows, cols } = latest?.rules ?? { rows: 4, cols: 4 };
    const w = Math.floor((BOARD.w - (cols - 1) * GAP) / cols);
    const h = Math.floor((BOARD.h - (rows - 1) * GAP) / rows);
    return [BOARD.x + (cell % cols) * (w + GAP), BOARD.y + Math.floor(cell / cols) * (h + GAP), w, h];
  }
  const sharedRect = (index: number): Box => [SIDE_X + index * (CARD_W + GAP), SHARED_Y, CARD_W, CARD_H];

  function say(text: string): void {
    note = text;
    noteT = 2.5;
  }

  /** Shows one thing that happened: a sound for it. What it was is in the bar and the column. */
  function show(event: PokerEvent): void {
    const mine = me();
    if (event.type === "dealt") {
      if (event.round > 1) sfx.turn();
    } else if (event.type === "turned") sfx.swap();
    else if (event.type === "locked") {
      // the player's own was sounded as it was made
      if (event.player === mine && lockSounded) lockSounded = false;
      else if (event.player === mine) sfx.pick();
      else sfx.move();
    } else if (event.type === "shown") {
      const mark = mine === null ? null : markOf(mine, event.outcomes);
      if (mark === "win") sfx.win();
      else if (mark === "loss") sfx.lose();
      else sfx.back();
    }
  }

  /**
   * The game with the player's own choice shown as final, which it is from the press: the room is a moment
   * away, and a choice that reads as open until the room answers reads as a press not taken. What the others
   * chose, and the round shown once all have, come from the room.
   */
  function withLock(message: PokerMessage): PokerMessage {
    const view = message.view;
    const mine = view.you;
    if (mine === null || view.mine === null || view.mine.locked || view.phase !== "choose") return message;
    return { ...message, view: { ...view, mine: { cells: [...selection], locked: true }, locked: view.locked.includes(mine) ? view.locked : [...view.locked, mine] } };
  }

  /** Asks the room for the next game, once: a press made again before the room answers is the same press. */
  function askAgain(): void {
    if (starting) return;
    starting = handlers.again();
    if (!starting) say(WORDS.notSent);
  }

  function update(message: PokerMessage): void {
    // the next game has begun: what was asked for is here
    if (message.view.phase !== "ended") starting = false;
    const fresh = latest === null || latest.startedAt !== message.startedAt;
    if (fresh) {
      // A game met part-way is shown as it stands; only what happens from here on is played out.
      seen = message.view.history.length;
      speech.clear();
      touched = null;
      cursorOn = false;
      if (latest !== null) sfx.turn();
    }
    if (message.view.phase === "ended" && (fresh || latest?.view.phase !== "ended")) endedAt = time;
    // What the room holds is the player's own choice, made here or on a page before this one. It is
    // taken up unless this page has chosen since: an answer to an earlier pick must not undo a later one.
    const round = `${message.startedAt}:${message.view.round}`;
    if (message.view.phase !== "choose") touched = null;
    if (touched !== round) selection = [...(message.view.mine?.cells ?? [])];
    truth = message;
    receivedAt = performance.now();
    // A final choice goes as two messages and the room answers each, and others' choices are sent here meanwhile:
    // it is on its way until the room shows it final, or the choosing is over. (A refusal and a lost line end it too.)
    if (message.view.phase !== "choose" || message.view.mine?.locked === true) pending = false;
    // on its way still, it is drawn over what the room sends meanwhile, which does not have it yet
    latest = pending ? withLock(message) : message;
    offline = false;
    handlers.crowded(isCrowded(message.players.length));
  }

  // ---- Input -----------------------------------------------------------------------------------------
  /** Puts `cell` among the chosen, or takes it out. One more than a choice holds pushes the earliest out. */
  function toggle(cell: number): void {
    if (latest === null || latest.view.mine === null) return;
    const view = latest.view;
    if (view.phase !== "choose") {
      if (view.phase === "memorise") say(WORDS.say.notYet);
      return;
    }
    if (latest.frozen) return say(WORDS.say.paused);
    if (view.mine?.locked === true) {
      say(WORDS.refused.locked);
      sfx.deny();
      return;
    }
    // the choice is on its way to being final: a card turned now would be refused, and put back before the eyes
    if (pending) return;
    const picks = latest.rules.picks;
    const next = selection.includes(cell) ? selection.filter((each) => each !== cell) : [...selection.slice(Math.max(0, selection.length - picks + 1)), cell];
    if (!handlers.act({ type: "pick", cells: next })) return say(WORDS.notSent);
    selection = next;
    touched = `${latest.startedAt}:${view.round}`;
    sfx.move();
  }

  /** Makes the choice final: the cells on this screen are sent once more, so that what is final is what is seen. */
  function lock(): void {
    if (latest === null || latest.view.phase !== "choose" || latest.view.mine === null || pending) return;
    if (latest.frozen) return say(WORDS.say.paused);
    if (latest.view.mine.locked) return say(WORDS.refused.locked);
    if (selection.length !== latest.rules.picks) {
      say(WORDS.refused["not-chosen"]);
      sfx.deny();
      return;
    }
    pending = handlers.act({ type: "pick", cells: selection }) && handlers.act({ type: "lock" });
    if (!pending) return say(WORDS.notSent);
    latest = withLock(latest);
    lockSounded = true;
    sfx.pick();
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
    if (help || was) return;

    const view = latest.view;
    if (view.phase === "ended") {
      if (pressed("Escape") || clicked(LOBBY_RECT, LOBBY_REACH)) {
        handlers.lobby();
      } else if ((pressed("Enter", "NumpadEnter", "KeyR") && time - endedAt >= RESULTS_HOLD) || (host && clicked(AGAIN_RECT, AGAIN_REACH))) {
        if (host) askAgain();
        else say(WORDS.refused["not-host"]);
      }
      return;
    }
    if (me() === null) return;

    const { rows, cols } = latest.rules;
    const cells = rows * cols;
    const wanted: number[] = [];
    for (const code of keys) {
      const before = cursor;
      if (code === "ArrowLeft") cursor = cursor % cols === 0 ? cursor + cols - 1 : cursor - 1;
      else if (code === "ArrowRight") cursor = cursor % cols === cols - 1 ? cursor - cols + 1 : cursor + 1;
      else if (code === "ArrowUp") cursor = (cursor - cols + cells) % cells;
      else if (code === "ArrowDown") cursor = (cursor + cols) % cells;
      else if (code === "Space") {
        // the first press only shows where the keyboard is
        if (cursorOn) wanted.push(cursor);
        cursorOn = true;
        continue;
      } else continue;
      // an arrow shows the keyboard's place; the first one does not also move it
      if (!cursorOn) cursor = before;
      cursorOn = true;
      sfx.move();
    }
    for (const p of clicks) {
      for (let cell = 0; cell < cells; cell++) if (inRect(p, cellRect(cell))) wanted.push(cell);
    }
    for (const cell of wanted) toggle(cell);
    if (pressed("Enter", "NumpadEnter") || (view.phase === "choose" && clicked(LOCK_RECT))) lock();
  }

  // ---- One step of the screen's clock ---------------------------------------------------------------
  function step(): void {
    const dt = STEP;
    time += dt;
    if (noteT > 0) noteT -= dt;
    for (const [player, line] of speech) {
      line.t -= dt;
      if (line.t <= 0) speech.delete(player);
    }
    if (latest !== null) {
      while (seen < latest.view.history.length) show(latest.view.history[seen++]);
      // the room has answered and its word of the choice has been passed over, or was never in it
      if (!pending) lockSounded = false;
    }
    stepInput();
    keys.length = 0;
    clicks.length = 0;
  }

  // ---- Drawing ---------------------------------------------------------------------------------------
  /** A line round a box, `thick` pixels wide, inside its edge. */
  function frame(box: Box, colour: string, thick = 1): void {
    const [x, y, w, h] = box;
    pen.px(x, y, w, thick, colour);
    pen.px(x, y + h - thick, w, thick, colour);
    pen.px(x, y, thick, h, colour);
    pen.px(x + w - thick, y, thick, h, colour);
  }

  function drawFace(box: Box, card: Card): void {
    const [x, y, w, h] = box;
    const colour = SUIT_COLOURS[suitOf(card)];
    pen.px(x, y, w, h, C.ink);
    pen.px(x + 1, y + 1, w - 2, h - 2, FACE);
    // at this size the font's box starts a pixel and a half above the line's top
    pen.txt(rankName(rankOf(card)), x + Math.round(w / 2), y + 5, colour, "center", 24);
    pen.bmp(PIPS[suitOf(card)], x + Math.round((w - PIP) / 2), y + h - PIP - 4, colour);
  }

  function drawBack(box: Box, label: string, tone: "plain" | "hover" | "picked"): void {
    const [x, y, w, h] = box;
    pen.px(x, y, w, h, C.ink);
    pen.px(x + 1, y + 1, w - 2, h - 2, tone === "picked" ? BACK_PICKED : BACK);
    frame([x + 3, y + 3, w - 6, h - 6], tone === "picked" ? C.amberD : tone === "hover" ? C.steel : BACK_LINE);
    pen.txt(label, x + Math.round(w / 2), y + Math.round(h / 2) - 7, tone === "picked" ? C.amber : tone === "hover" ? C.bone : C.boneD, "center");
  }

  function plate(words: string, y: number, colour: string): void {
    const width = Math.max(120, pen.width(words) + 16);
    pen.px(Math.round(SCENE_W / 2 - width / 2), y, width, 17, C.ink);
    pen.txt(words, Math.round(SCENE_W / 2), y + 2, colour, "center");
  }

  function drawBoard(): void {
    if (latest === null) return;
    const view = latest.view;
    const mine = me();
    const others = groupOf(mine).filter((player) => player !== mine);
    const choosing = canChoose();
    for (let cell = 0; cell < latest.rules.rows * latest.rules.cols; cell++) {
      const box = cellRect(cell);
      const [x, y, w, h] = box;
      if (view.board !== null) {
        drawFace(box, view.board[cell]);
        if (view.shown === null) continue;
        // the cards of this player's own round: an opponent's choice in crimson, their own in amber round it
        if (others.some((player) => shownCells(player).includes(cell))) frame([x + 1, y + 1, w - 2, h - 2], C.crim, 2);
        if (mine !== null && shownCells(mine).includes(cell)) frame([x - 1, y - 1, w + 2, h + 2], C.amber, 2);
        continue;
      }
      drawBack(box, letterOf(cell), selection.includes(cell) ? "picked" : choosing && inRect(mouse, box) ? "hover" : "plain");
      if (choosing && cursorOn && cursor === cell) frame([x - 2, y - 2, w + 4, h + 4], C.bone);
    }
    // how much of the phase is left, under the board
    const whole = view.phase === "memorise" ? latest.rules.memoriseSeconds : view.phase === "choose" ? latest.rules.chooseSeconds : latest.rules.revealSeconds;
    const ms = left(latest.clock.phase);
    if (ms !== null && whole > 0) {
      const width = Math.round(BOARD.w * Math.min(1, ms / (whole * 1000)));
      pen.px(BOARD.x, BOARD.y + BOARD.h + 3, BOARD.w, 2, C.ink);
      pen.px(BOARD.x, BOARD.y + BOARD.h + 3, width, 2, ms <= HURRY_FROM * 1000 ? C.crim : view.phase === "reveal" ? C.steel : C.teal);
    }
  }

  /** Beside the board: the shared cards, and what this player's own round comes to. */
  function drawSide(): void {
    if (latest === null) return;
    const view = latest.view;
    const x = SIDE_X;
    pen.txt(WORDS.shared, x, 5, C.boneD);
    for (let i = 0; i < latest.rules.shared; i++) {
      if (view.shared !== null) drawFace(sharedRect(i), view.shared[i]);
      else drawBack(sharedRect(i), "?", "plain");
    }
    pen.px(x, 70, SIDE_W, 1, C.steelDD);
    const mine = me();
    const group = groupOf(mine);
    if (mine === null || group.length === 0) {
      pen.txt(WORDS.watching, x, 75, C.boneD);
      return;
    }
    const others = group.filter((player) => player !== mine);
    pen.txt(pen.fit(WORDS.versus(others.map((player) => nickOf(player)).join(", ")), SIDE_W), x, 75, C.bone);
    if (view.shown !== null) {
      const shown = view.shown;
      let y = 92;
      for (const player of [mine, ...others]) {
        const hand = shown.hands.find((each) => each.player === player);
        const mark = markOf(player, shown.outcomes);
        if (hand === undefined || mark === null) continue;
        const colour = mark === "win" ? C.teal : mark === "loss" ? C.crim : C.boneD;
        pen.txt(WORDS.mark[mark], x + SIDE_W, y, colour, "right");
        const star = hand.forced > 0 ? " *" : "";
        const name = pen.fit(nickOf(player), SIDE_W - pen.width(WORDS.mark[mark]) - pen.width(star) - 4);
        pen.txt(name, x, y, player === mine ? C.amber : C.bone);
        if (star !== "") pen.txt(star, x + pen.width(name), y, C.dim);
        pen.txt(pen.fit(handName(hand.hand), SIDE_W), x, y + 13, colour);
        y += 30;
      }
      if (group.some((player) => (shown.hands.find((each) => each.player === player)?.forced ?? 0) > 0)) pen.txt(pen.fit(WORDS.forced, SIDE_W), x, y + 2, C.dim);
    } else if (view.phase === "choose") {
      const letters = selection.map(letterOf).join(" ");
      pen.txt(WORDS.picks(letters === "" ? WORDS.noPick : letters), x, 92, C.bone);
      if (view.mine?.locked === true) pen.txt(WORDS.lockedIn, x, 106, C.teal);
      pen.txt(WORDS.chosen(view.locked.length, latest.players.length), x, 124, C.boneD);
    } else {
      WORDS.learn.forEach((line, i) => pen.txt(line, x, 92 + i * 14, C.boneD));
    }
  }

  function drawScene(): void {
    if (latest === null) return;
    pen.px(0, 0, SCENE_W, BAR_Y, C.night);
    for (let y = 9; y < BAR_Y; y += 17) pen.px(0, y, SCENE_W, 1, C.wallD);
    drawBoard();
    drawSide();
    if (latest.frozen) {
      // the game's own clock stands still; this one runs, and ends the game at nought
      const stand = latest.clock.stand === null ? null : Math.max(0, latest.clock.stand - (performance.now() - receivedAt));
      plate(WORDS.waitingBack(stand === null ? null : Math.ceil(stand / 1000)), BOARD.y + Math.round(BOARD.h / 2) - 9, C.boneD);
    }
  }

  /** The words for where the game stands, and their colour. */
  function standing(): [string, string] {
    if (latest === null) return ["", C.boneD];
    const view = latest.view;
    const mine = me();
    if (noteT > 0) return [note, C.amber];
    if (offline) return [WORDS.standing.offline, C.crim];
    if (view.phase === "ended") return [WORDS.standing.over, C.amber];
    if (latest.frozen) return [WORDS.standing.paused, C.boneD];
    const seconds = Math.ceil((left(latest.clock.phase) ?? 0) / 1000);
    const have = view.locked.length;
    const of = latest.players.length;
    if (view.phase === "memorise") return mine === null ? [WORDS.standing.watchLearn(seconds), C.bone] : [WORDS.standing.learn(seconds), C.amber];
    if (view.phase === "choose") {
      if (mine === null) return [WORDS.standing.watchChoose(have, of, seconds), C.bone];
      if (view.mine?.locked === true) return [WORDS.standing.locked(have, of, seconds), C.teal];
      if (pending) return [WORDS.standing.sending, C.boneD];
      if (selection.length === latest.rules.picks) return [WORDS.standing.ready(seconds), C.amber];
      return [WORDS.standing.choose(latest.rules.picks, selection.length, seconds), C.amber];
    }
    const hand = mine === null ? undefined : view.shown?.hands.find((each) => each.player === mine);
    const mark = mine === null ? null : markOf(mine, view.shown?.outcomes ?? []);
    const words = hand === undefined || mark === null ? WORDS.standing.shown : WORDS.standing[mark](handName(hand.hand));
    const colour = mark === "win" ? C.teal : mark === "loss" ? C.crim : C.bone;
    return [view.round >= view.rounds ? WORDS.standing.last(words, seconds) : WORDS.standing.next(words, seconds), colour];
  }

  /** The log, made from what has been shown so far. A final choice is marked in the list, and not written here. */
  function logLines(): [string, string][] {
    if (latest === null) return [];
    const lines: [string, string][] = [];
    const mine = me();
    const names = (players: readonly number[]): string => players.map((player) => pen.fit(nickOf(player), 44)).join(", ");
    for (const event of latest.view.history.slice(0, seen)) {
      if (event.type === "dealt") lines.push([WORDS.log.dealt(event.round), C.boneD]);
      else if (event.type === "turned") lines.push([WORDS.log.turned, C.dim]);
      else if (event.type === "ended") lines.push([WORDS.ended[event.reason], C.amber]);
      else if (event.type === "shown") {
        for (const outcome of event.outcomes) {
          const mark = mine === null ? null : markOf(mine, [outcome]);
          const colour = mark === "win" ? C.teal : mark === "loss" ? C.crim : mark === "tie" ? C.bone : C.boneD;
          if (outcome.winner === null) lines.push([WORDS.log.tied(names(outcome.best)), colour]);
          else lines.push([WORDS.log.won(pen.fit(nickOf(outcome.winner), 60), names(outcome.players.filter((player) => player !== outcome.winner))), colour]);
        }
      }
    }
    return lines;
  }

  /**
   * What the list says of `player` beside their name, and its colour: how
   * the round went once it is shown, that their choice is final while
   * others choose, and otherwise what they have won.
   */
  function stateOf(player: number, short: boolean): [string, string] {
    if (latest === null) return ["", C.dim];
    const view = latest.view;
    if (view.phase === "reveal" && view.shown !== null) {
      const mark = markOf(player, view.shown.outcomes);
      if (mark !== null) return [WORDS.mark[mark], mark === "win" ? C.teal : mark === "loss" ? C.crim : C.boneD];
    }
    if (view.phase === "choose") return view.locked.includes(player) ? [WORDS.state.chosen, C.brass] : ["", C.dim];
    const tally = view.standings.find((each) => each.player === player);
    if (tally === undefined) return ["", C.dim];
    return [view.phase === "ended" && !short ? WORDS.state.record(tally.wins, tally.ties, tally.losses) : WORDS.state.wins(tally.wins), C.boneD];
  }

  function drawPanel(): void {
    if (latest === null) return;
    const view = latest.view;
    const x = PANEL_X;
    pen.px(SCENE_W, 0, W - SCENE_W, BAR_Y, C.night);
    pen.px(SCENE_W, 0, 1, BAR_Y, C.steelDD);
    pen.txt(WORDS.round(view.round, view.rounds), x, 3, C.bone);
    const phase = left(latest.clock.phase);
    if (phase !== null) {
      const all = Math.ceil(phase / 1000);
      pen.txt(`${Math.floor(all / 60)}:${`${all % 60}`.padStart(2, "0")}`, W - 5, 3, all <= HURRY_FROM ? C.crim : C.boneD, "right");
    }
    // the players in the order they stand; before a round has been shown nobody has a place yet
    const played = view.standings.some((each) => each.wins + each.ties + each.losses > 0);
    const layout = panelLayout(view.standings.length);
    // in a crowded game the page's tabs are where the line under the heading would be
    if (!layout.crowded) pen.px(x, 16, PANEL_WIDTH, 1, C.steelDD);
    view.standings.forEach((each, at) => {
      const player = each.player;
      const { dx, y } = entryAt(layout, at);
      const ex = x + dx;
      const right = ex + layout.entryWidth - 1;
      const info = latest!.players.find((one) => one.id === player);
      const gone = info !== undefined && (info.left || !info.connected);
      const place = played ? `${each.place}` : "-";
      // a place of two figures needs more room than one
      if (layout.crowded) pen.txt(place, ex + 12, y, played ? C.brass : C.dim, "right");
      else pen.txt(place, ex, y, played ? C.brass : C.dim);
      const nameX = ex + (layout.crowded ? 16 : 12);
      const [words, colour] = stateOf(player, layout.crowded);
      const voice = info === undefined || info.bot || info.left ? "out" : handlers.voice(player);
      const room = right - nameX - (words === "" ? 0 : pen.width(words) + 3) - (voice !== "out" ? VOICE_MARK_W + 2 : 0);
      const name = pen.fit(info?.nick ?? "", Math.min(NAME_WIDTH, room));
      pen.txt(name, nameX, y, gone ? C.dim : me() === player ? C.amber : C.bone);
      if (voice !== "out") drawVoiceMark(pen, nameX + pen.width(name) + 2, y, voice, time);
      if (words !== "") pen.txt(words, right, y, colour, "right");
    });
    pen.px(x, layout.crowded ? underList(layout) : 86, PANEL_WIDTH, 1, C.steelDD);
    const lines = logLines();
    const from = Math.max(0, lines.length - layout.logRows);
    for (let i = from; i < lines.length; i++) pen.txt(pen.fit(lines[i][0], PANEL_WIDTH), x, layout.logTop + (i - from) * LOG_PITCH, lines[i][1]);
    // a chat line beside its speaker's name, over the edge of the scene
    for (const [player, line] of speech) {
      const at = view.standings.findIndex((each) => each.player === player);
      if (at >= 0) drawSpeech(pen, { label: { x: SCENE_W, y: entryAt(layout, at).y, align: "left" } }, line.lines);
    }
  }

  function button(rect: Box, label: string, lit: boolean, live: boolean): void {
    const [x, y, w, h] = rect;
    pen.px(x, y, w, h, lit ? C.amberD : C.steelDD);
    pen.px(x + 1, y + 1, w - 2, h - 2, lit ? "#3a2a12" : live && inRect(mouse, rect) ? C.btnH : C.btn);
    pen.txt(label, x + Math.round(w / 2), y + Math.round((h - 13) / 2), lit ? C.amber : live ? C.bone : C.dim, "center");
  }

  /** What this player came out of the game with, in the word the results lead with; `null` while it is being played, and for someone who watched. */
  function verdict(): string | null {
    const mine = me();
    if (latest === null || latest.view.phase !== "ended" || mine === null) return null;
    const own = latest.view.standings.find((each) => each.player === mine);
    return own === undefined ? null : WORDS.result.verdict(true, own.place);
  }

  function drawResults(): void {
    if (latest === null) return;
    const view = latest.view;
    const mine = me();
    const own = mine === null ? undefined : view.standings.find((each) => each.player === mine);
    pen.txt(WORDS.result.verdict(own !== undefined, own?.place ?? 0), 10, 234, own === undefined ? C.bone : own.place === 1 ? C.teal : C.bone, "left", 24);
    // the first three by name; the list beside the board has everyone
    const places = view.standings.slice(0, PLACES_SHOWN).map((each) => WORDS.result.place(each.place, pen.fit(nickOf(each.player), 56), each.wins));
    pen.txt(pen.fit(places.join(" · "), 280), 96, 226, C.bone);
    const end = view.history.at(-1);
    const how = end?.type === "ended" ? WORDS.ended[end.reason] : "";
    pen.txt(own === undefined ? how : WORDS.result.mine(own.wins, own.ties, own.losses), 96, 240, C.boneD);
    if (noteT > 0) pen.txt(note, 96, 254, C.amber);
    else pen.txt(starting ? WORDS.standing.sending : host ? WORDS.result.hostNext : WORDS.result.waitHost, 96, 254, C.boneD);
    if (host) button(AGAIN_RECT, WORDS.button.again, !starting, !starting);
    button(LOBBY_RECT, WORDS.button.lobby, false, true);
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
    const choosing = view.phase === "choose" && me() !== null;
    const [words, colour] = standing();
    pen.txt(pen.fit(words, choosing ? LOCK_RECT[0] - 14 : W - 12), 6, 225, colour);
    // which keys open the rules and mute the sound; under a finger, where the menu that does is
    const hint = TOUCH ? PAGE.menu.hint : WORDS.hint;
    if (!choosing) {
      pen.txt(hint, 6, 240, C.dim);
      return;
    }
    pen.txt(pen.fit(WORDS.keys, LOCK_RECT[0] - 14), 6, 240, C.boneD);
    pen.txt(hint, 6, 254, C.dim);
    const live = canChoose() && !pending;
    // pressed and on its way, the button stays lit: it has been taken, not shut
    button(LOCK_RECT, WORDS.button.lock, pending || (live && selection.length === latest.rules.picks), live);
  }

  function drawHelp(): void {
    if (latest === null) return;
    const rules = latest.rules;
    const lines = WORDS.help({
      cards: rules.rows * rules.cols,
      shared: rules.shared,
      picks: rules.picks,
      rounds: rules.rounds,
      memoriseSeconds: rules.memoriseSeconds,
      chooseSeconds: rules.chooseSeconds,
    });
    pen.clear(C.night);
    pen.px(8, 8, W - 16, H - 16, C.steelDD);
    pen.px(9, 9, W - 18, H - 18, C.bar);
    lines.forEach((line, i) => {
      if (line.text !== "") pen.txt(line.text, 22, 20 + i * 15, line.tone === "title" ? C.amber : line.tone === "dim" ? C.boneD : C.bone);
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
    // an arrow held down moves on; anything else held down is one press
    if (!event.repeat || event.code.startsWith("Arrow")) keys.push(event.code);
    if (event.code === "Space" || event.code.startsWith("Arrow")) event.preventDefault();
  };
  const unwatch = watchPointer(canvas, W, H, {
    move(p): void {
      mouse.x = p.x;
      mouse.y = p.y;
    },
    down(p): void {
      startAudio();
      mouse.x = p.x;
      mouse.y = p.y;
      clicks.push(p);
    },
    // a pointer that has left the screen, or a finger that has lifted, is over none of its cards
    gone(): void {
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
  void document.fonts?.load("12px Galmuri11");

  return {
    update,
    verdict,
    refused(reason: string): void {
      starting = false;
      pending = false;
      lockSounded = false;
      if (truth !== null) latest = truth;
      // what the room holds is what counts again: this page's own choice did not go through
      touched = null;
      selection = [...(latest?.view.mine?.cells ?? [])];
      say(WORDS.refused[reason] ?? WORDS.refusedOther);
      sfx.deny();
    },
    lost(): void {
      starting = false;
      pending = false;
      lockSounded = false;
      // whether the choice reached the room is not known: the game the room sends on coming back will say
      if (truth !== null) latest = truth;
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
