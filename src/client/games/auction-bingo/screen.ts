/**
 * The screen of 경매 빙고: the bingo card everyone has, the three boxes the
 * name tickets go in, the winning bids of the rounds played, and the
 * player's own coins.
 *
 * Design: design/games/auction-bingo.md. The room decides everything; this
 * screen shows what it sends and asks it to put a ticket in a box, to turn a
 * piece into a coin, or to bid. What others bid is never sent, and who won
 * what is sent to nobody until the game is over. Everything can be done with
 * the pointer; the keys are a shorter way to the same.
 */
import { SHAPES, type BingoAction, type BingoEvent, type Shape } from "../../../shared/games/auction-bingo/rules";
import { bingoWaits } from "../../../shared/waits";
import { hits, type Box, type Press, type Reach } from "../../../shared/frame";
import type { ServerMessage } from "../../../shared/protocol";
import type { VoiceMark } from "../../../shared/voice";
import { BAR_Y, H, PANEL_X, Pen, SCENE_W, VOICE_MARK_W, W, drawSpeech, drawVoiceMark, speechLines, speechSeconds } from "../../game/draw";
import { C } from "../../game/palette";
import { pixelFont } from "../../game/pixel-font";
import { AGAIN_REACH, LOBBY_REACH, RESULTS_PRESS_HOLD, watchPointer } from "../../game/pointer";
import { isMuted, setMuted, sfx, startAudio } from "../../game/sound";
import { TOUCH, keyed } from "../../touch";
import { WORDS as PAGE } from "../../words";
import { LOG_PITCH, PANEL_WIDTH, entryAt, isCrowded, panelLayout, underList } from "../panel";
import { WORDS } from "./words";

/** What the room sends about a game of 경매 빙고. */
export type BingoMessage = Extract<ServerMessage, { type: "game"; game: "auction-bingo" }>;
type View = BingoMessage["view"];

/** What the screen asks of whoever owns the connection. */
export interface BingoHandlers {
  /** The player put a ticket in, turned a piece into a coin, or bid. Returns whether it could be sent. */
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
export interface BingoScreen {
  update(message: BingoMessage): void;
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
/** The card: where it begins, how big a square of it is and how far apart two are. It begins under the page's own buttons, which lie over the top left of the scene. */
const CARD_X = 8;
const CARD_Y = 42;
const CELL = 30;
const CELL_GAP = 2;
/** The table of the rounds, beside the card: its left edge, how wide the column of round numbers is and a column of a shape, and where its rows begin. */
const TABLE_X = 112;
const TABLE_LABEL = 13;
const TABLE_COLUMN = 58;
const TABLE_HEAD_Y = 27;
const TABLE_Y = 41;
const TABLE_PITCH = 13;
/** The three boxes the tickets go in, under the card and the table. */
const BOX_Y = 140;
const BOX_W = 95;
const BOX_H = 78;
const BOX_STEP = 99;
const boxRect = (index: number): Box => [6 + index * BOX_STEP, BOX_Y, BOX_W, BOX_H];
/** How far past its edge a box takes a finger: they are 4 pixels apart. */
const BOX_REACH: Reach = 2;
/** In a box: how many names stand in a row, how many rows there are, and how wide a name may be. */
const NAMES_IN_ROW = 2;
const NAME_ROWS = 4;
const BOX_NAME = 42;
/** The widest a name is drawn in the list of players, in pixels. */
const NAME_WIDTH = 86;
/** With this many seconds or fewer left, the clock turns red, and a player the game is waiting on hears each of them ticked. */
const HURRY_FROM = 5;
/** Seconds the results are on show before Enter starts another game: the host may have been pressing Enter for a bid. */
const RESULTS_HOLD = 1.5;
/** How many of the first places the results name in the bar. */
const PLACES_SHOWN = 3;
/** How wide the lines of the results may be, beside the verdict and before the buttons. */
const RESULT_WIDTH = 280;
/** The places in the scene, under their heading and the names of their columns: where the rows begin, how tall one is, and how many stand in a column. */
const FINAL_Y = 56;
const FINAL_PITCH = 20;
const FINAL_ROWS = 8;
/** The rounds in the scene, under their heading: where the rows begin, and how tall one of two lines is. */
const ROUNDS_Y = 42;
const ROUNDS_PITCH = 25;
/** A card drawn small beside a player's place: how big a square of it is. */
const MINI_CELL = 5;

/** The shapes' colours, bright for one won or chosen and dim for a square not filled. Each shape is told by its outline, the colour is a second sign. */
const SHAPE_COLOURS: Record<Shape, string> = { triangle: "#3fd0b6", circle: "#ffb43c", star: "#c58cf2" };
const SHAPE_DIM: Record<Shape, string> = { triangle: "#1c5f5a", circle: "#7a5516", star: "#5a3f78" };

/** The buttons of the bar. */
const shapeButton = (index: number): Box => [6 + index * 104, 238, 100, 28];
const SUBMIT_RECT: Box = [386, 238, 90, 28];
const PIECE_RECT: Box = [320, 238, 62, 28];
/** A coin's button: `count` of them share the bar to the left of the piece's. */
function coinRect(index: number, count: number): Box {
  const pitch = Math.min(24, Math.floor(314 / Math.max(1, count)));
  return [6 + index * pitch, 238, pitch - 2, 28];
}
const AGAIN_RECT: Box = [386, 225, 90, 15];
const LOBBY_RECT: Box = [386, 250, 90, 15];
/** Over the results, at the top right of the scene: the button that turns their page. */
const PAGE_RECT: Box = [204, 24, 96, 15];

const inRect = (p: { x: number; y: number }, r: Box): boolean => p.x >= r[0] && p.x < r[0] + r[2] && p.y >= r[1] && p.y < r[1] + r[3];
const sum = (numbers: readonly number[]): number => numbers.reduce((total, each) => total + each, 0);

/** A clock that has `ms` left, as minutes and seconds. */
function clockOf(ms: number): string {
  const all = Math.ceil(ms / 1000);
  return `${Math.floor(all / 60)}:${`${all % 60}`.padStart(2, "0")}`;
}

/** The corners of a shape with corners, in a square of side 1: a triangle on its base, a star of five points. */
function cornersOf(shape: "triangle" | "star"): [number, number][] {
  if (shape === "triangle") {
    return [
      [0.5, 0.04],
      [0.98, 0.94],
      [0.02, 0.94],
    ];
  }
  const corners: [number, number][] = [];
  for (let point = 0; point < 10; point++) {
    const radius = point % 2 === 0 ? 0.52 : 0.22;
    const angle = -Math.PI / 2 + (point * Math.PI) / 5;
    corners.push([0.5 + radius * Math.cos(angle), 0.54 + radius * Math.sin(angle)]);
  }
  return corners;
}

/** Whether (`x`, `y`) is inside the shape with `corners`. */
function inside(corners: readonly [number, number][], x: number, y: number): boolean {
  let within = false;
  for (let at = 0, before = corners.length - 1; at < corners.length; before = at++) {
    const [ax, ay] = corners[at];
    const [bx, by] = corners[before];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) within = !within;
  }
  return within;
}

/** A shape drawn `size` pixels wide and tall, as the runs of pixels of each of its rows; worked out once for each size. */
const masks = new Map<string, [row: number, from: number, width: number][]>();
function maskOf(shape: Shape, size: number): [row: number, from: number, width: number][] {
  const key = `${shape}.${size}`;
  const kept = masks.get(key);
  if (kept !== undefined) return kept;
  const corners = shape === "circle" ? null : cornersOf(shape);
  const runs: [number, number, number][] = [];
  for (let row = 0; row < size; row++) {
    let from = -1;
    for (let column = 0; column <= size; column++) {
      const x = (column + 0.5) / size;
      const y = (row + 0.5) / size;
      const on = column < size && (corners === null ? (x - 0.5) ** 2 + (y - 0.5) ** 2 <= 0.25 : inside(corners, x, y));
      if (on && from < 0) from = column;
      if (!on && from >= 0) {
        runs.push([row, from, column - from]);
        from = -1;
      }
    }
  }
  masks.set(key, runs);
  return runs;
}

/** Makes `canvas` the game screen. Nothing is drawn until the first {@link BingoScreen.update}. */
export function createBingoScreen(canvas: HTMLCanvasElement, handlers: BingoHandlers): BingoScreen {
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2D drawing in this browser");
  const ctx: CanvasRenderingContext2D = context;
  const pen = new Pen(ctx);

  let latest: BingoMessage | null = null;
  /** When the latest message arrived, by the browser's own clock in ms: the room's clocks are counted from here in real time. */
  let receivedAt = 0;
  /** Seconds since the screen was made; drives what moves on it. */
  let time = 0;
  /** How many events of the history have been shown. */
  let seen = 0;
  /** The last second of the player's own time that was ticked aloud. */
  let ticked = -1;
  /** Something has been sent and the room has not answered yet. */
  let pending = false;
  /** The host has asked for the next game and the room has not answered yet. */
  let starting = false;
  /** The game as the room last sent it: what is shown again if a move drawn ahead of the room is refused. */
  let truth: BingoMessage | null = null;
  /**
   * The player's own move on its way to the room, as the change it makes to what the room sent. It is drawn
   * at once, drawn again over whatever the room sends before its answer, and dropped when the answer comes
   * or the move is refused (as in the screen of 무거운 13).
   */
  let ahead: ((view: View) => View) | null = null;
  /** The connection to the room is down; the next thing the room sends says it is back. */
  let offline = false;
  let host = false;
  let help = false;
  let note = "";
  let noteT = 0;
  /** The shape pointed at, before the ticket is put in. */
  let shape: Shape | null = null;
  /** The coins picked to bid, by their worth, before they are bid. */
  let picked: number[] = [];
  /** Which page of the results is up: the places with everyone's card, or the rounds with their winners. */
  let page: "places" | "rounds" = "places";
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
  /** Whether the player at this screen is in the rounds: a player, and not out of coins. */
  const active = (view: View): boolean => view.you !== null && !view.out.includes(view.you);
  /** Whether the player at this screen has a ticket to put in now. */
  const choosing = (): boolean => latest !== null && !latest.frozen && latest.view.phase === "choose" && active(latest.view) && latest.view.choice === null;
  /** Whether the player at this screen has a bid to make now. */
  const bidding = (): boolean => latest !== null && !latest.frozen && latest.view.phase === "bid" && active(latest.view) && latest.view.bid === null;
  /** How many choose and bid in the round. */
  const takingPart = (view: View): number => view.players.length - view.out.length;

  function say(text: string): void {
    note = text;
    noteT = 2.5;
  }

  /** Shows one thing that happened: a sound. */
  function show(event: BingoEvent): void {
    if (event.type === "round") {
      if (event.round > 1) sfx.turn();
    } else if (event.type === "tickets") sfx.swap();
    else if (event.type === "result") sfx.chip();
    else {
      const own = latest?.view.final?.standings.find((each) => each.player === me());
      if (own !== undefined && own.place === 1 && event.reason === "rounds") sfx.win();
      else sfx.turn();
    }
  }

  /** Sends the player's move and, if it went, draws it at once as `change` makes it (see `ahead`). */
  function sendAhead(action: BingoAction, change: (view: View) => View): void {
    pending = handlers.act(action);
    if (!pending) return say(WORDS.notSent);
    if (latest === null) return;
    ahead = change;
    latest = { ...latest, view: change(latest.view) };
  }

  /** Takes back a move drawn ahead of the room: the game is shown as the room last sent it. */
  function takeBack(): void {
    ahead = null;
    if (truth !== null) latest = truth;
  }

  /** Asks the room for the next game, once: a press made again before the room answers is the same press. */
  function askAgain(): void {
    if (starting) return;
    starting = handlers.again();
    if (!starting) say(WORDS.notSent);
  }

  function update(message: BingoMessage): void {
    // the next game has begun: what was asked for is here
    if (message.view.phase !== "ended") starting = false;
    const fresh = latest === null || latest.startedAt !== message.startedAt;
    if (fresh) {
      // a game met part-way is shown as it stands; only what happens from here on is played out
      seen = message.view.history.length;
      speech.clear();
      shape = null;
      picked = [];
      page = "places";
      if (latest !== null) sfx.turn();
    } else if (truth !== null) {
      const before = truth.view;
      const now = message.view;
      const mine = now.you;
      if (mine !== null) {
        // the time ran out on this player, and the room did it for them
        if (before.phase === "choose" && before.choice === null && now.choice !== null && now.phase !== "choose" && ahead === null) say(WORDS.say.chosenForYou(WORDS.shape[now.choice]));
        const bid = now.mine.find((each) => each.round === before.round);
        if (before.phase === "bid" && before.bid === null && before.round === now.round && now.phase === "result" && bid !== undefined && ahead === null) say(WORDS.say.bidForYou(bid.amount));
        if (!before.out.includes(mine) && now.out.includes(mine)) say(WORDS.say.out);
      }
    }
    if (message.view.phase === "ended" && (fresh || latest?.view.phase !== "ended")) endedAt = time;
    // what was picked and not sent does not carry over to another round, nor a shape to the bids
    if (latest !== null && (latest.view.round !== message.view.round || latest.view.phase !== message.view.phase)) {
      shape = null;
      if (message.view.phase !== "bid") picked = [];
    }
    // The room marks the game it sends in answer to this page's move. What it sends meanwhile, for another
    // player's move, leaves this one on its way; a game that has gone on to another phase waits for nothing.
    const answered = message.answer === true || latest === null || latest.startedAt !== message.startedAt || latest.view.phase !== message.view.phase;
    const waited = choosing() || bidding();
    truth = message;
    if (answered) ahead = null;
    // a move still on its way is drawn over what the room sends meanwhile, which does not have it yet
    latest = ahead === null ? message : { ...message, view: ahead(message.view) };
    receivedAt = performance.now();
    if (answered) pending = false;
    offline = false;
    handlers.crowded(isCrowded(message.players.length));
    // coins picked that the player no longer holds are not picked
    const held = [...(latest.view.purse?.coins ?? [])];
    picked = picked.filter((coin) => {
      const at = held.indexOf(coin);
      if (at >= 0) held.splice(at, 1);
      return at >= 0;
    });
    // the game has come to wait on this player: the clock on their ticket or their bid has begun
    if (!waited && (choosing() || bidding()) && !fresh) sfx.turn();
  }

  // ---- Input -----------------------------------------------------------------------------------------
  function putTicket(): void {
    if (latest === null || !choosing() || pending) return;
    if (shape === null) {
      say(WORDS.say.pickShape);
      sfx.deny();
      return;
    }
    const mine = me() as number;
    const chosen = shape;
    // the ticket is in from the press; where everyone else's went comes from the room
    sendAhead({ type: "choose", shape: chosen }, (view) => (view.choice !== null || view.phase !== "choose" ? view : { ...view, choice: chosen, chosen: [...view.chosen, mine] }));
    if (pending) sfx.pick();
  }

  function turnPiece(): void {
    if (latest === null || !bidding() || pending) return;
    if ((latest.view.purse?.pieces ?? 0) < 1) {
      say(WORDS.say.noPieces);
      sfx.deny();
      return;
    }
    const worth = latest.rules.pieceWorth;
    sendAhead({ type: "exchange", pieces: 1 }, (view) =>
      view.purse === null || view.purse.pieces < 1 ? view : { ...view, purse: { pieces: view.purse.pieces - 1, coins: [...Array.from({ length: worth }, () => 1), ...view.purse.coins] } },
    );
    if (pending) sfx.chip();
  }

  function makeBid(): void {
    if (latest === null || !bidding() || pending) return;
    if (picked.length === 0) {
      say(WORDS.say.pickCoins);
      sfx.deny();
      return;
    }
    const mine = me() as number;
    const coins = [...picked].sort((a, b) => a - b);
    // the coins are gone from the press, and the player is among those who have bid
    sendAhead({ type: "bid", coins }, (view) => {
      if (view.purse === null || view.bid !== null || view.phase !== "bid") return view;
      const held = [...view.purse.coins];
      for (const coin of coins) {
        const at = held.indexOf(coin);
        if (at >= 0) held.splice(at, 1);
      }
      return { ...view, purse: { ...view.purse, coins: held }, bid: { coins, amount: sum(coins) }, bidders: [...view.bidders, mine] };
    });
    if (pending) {
      picked = [];
      sfx.pick();
    }
  }

  /** Which of the coins held are drawn as picked: of each worth, as many from the left as are picked. */
  function pickedAmong(coins: readonly number[]): boolean[] {
    const wanted = [...picked];
    return coins.map((coin) => {
      const at = wanted.indexOf(coin);
      if (at >= 0) wanted.splice(at, 1);
      return at >= 0;
    });
  }

  /** Picks a coin of `worth` more, or with all of them picked, none of that worth. */
  function pickWorth(worth: number): void {
    const held = (latest?.view.purse?.coins ?? []).filter((coin) => coin === worth).length;
    if (held === 0) return;
    const have = picked.filter((coin) => coin === worth).length;
    picked = have < held ? [...picked, worth] : picked.filter((coin) => coin !== worth);
    sfx.move();
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
      if (pressed("KeyV") || (pressable && clicked(PAGE_RECT, 3))) {
        page = page === "places" ? "rounds" : "places";
        sfx.move();
      }
      if (pressed("Escape") || (pressable && clicked(LOBBY_RECT, LOBBY_REACH))) {
        handlers.lobby();
      } else if ((pressed("Enter", "NumpadEnter", "KeyR") && time - endedAt >= RESULTS_HOLD) || (host && pressable && clicked(AGAIN_RECT, AGAIN_REACH))) {
        if (host) askAgain();
        // (someone who is not the host says with the same key that they would play one more: the tab beside the log shows it)
        else if (!handlers.wantAgain()) say(WORDS.refused["not-host"]);
      }
      return;
    }
    if (pending) return;
    if (choosing()) {
      for (const code of keys) {
        const digit = /^(?:Digit|Numpad)([123])$/.exec(code);
        if (digit !== null) {
          shape = SHAPES[Number(digit[1]) - 1];
          sfx.move();
        } else if (code === "ArrowLeft" || code === "ArrowRight") {
          const at = shape === null ? -1 : SHAPES.indexOf(shape);
          shape = SHAPES[at < 0 ? (code === "ArrowRight" ? 0 : SHAPES.length - 1) : (at + (code === "ArrowRight" ? 1 : SHAPES.length - 1)) % SHAPES.length];
          sfx.move();
        }
      }
      let putting = pressed("Enter", "NumpadEnter") || clicked(SUBMIT_RECT);
      SHAPES.forEach((each, index) => {
        // a shape is pointed at by a press on its button or its box, and its box takes the ticket at a second press
        const onBox = clicked(boxRect(index), BOX_REACH);
        if (!onBox && !clicked(shapeButton(index))) return;
        if (onBox && shape === each) putting = true;
        else if (shape !== each) {
          shape = each;
          sfx.move();
        }
      });
      if (putting) putTicket();
      return;
    }
    if (!bidding() || view.purse === null) return;
    const coins = view.purse.coins;
    for (const code of keys) {
      const digit = /^(?:Digit|Numpad)(\d)$/.exec(code);
      // 0 is the coin of ten
      if (digit !== null) pickWorth(digit[1] === "0" ? 10 : Number(digit[1]));
      else if (code === "Backspace" || code === "Delete") picked = [];
    }
    const lit = pickedAmong(coins);
    coins.forEach((coin, index) => {
      if (!clicked(coinRect(index, coins.length))) return;
      if (lit[index]) picked.splice(picked.indexOf(coin), 1);
      else picked.push(coin);
      sfx.move();
    });
    if (pressed("KeyP") || clicked(PIECE_RECT)) turnPiece();
    else if (pressed("Enter", "NumpadEnter") || clicked(SUBMIT_RECT)) makeBid();
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
      const history = latest.view.history;
      while (seen < history.length) {
        const event = history[seen];
        seen += 1;
        show(event);
      }
      // my own time is nearly up, with my ticket not in or my bid not made: a tick a second
      const mine = choosing() || bidding() ? left(latest.clock.phase) : null;
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
  }

  // ---- Drawing ---------------------------------------------------------------------------------------
  /** A shape, `size` pixels wide and tall, with its top left at (`x`, `y`). */
  function drawShape(kind: Shape, x: number, y: number, size: number, colour: string): void {
    for (const [row, from, width] of maskOf(kind, size)) pen.px(x + from, y + row, width, 1, colour);
  }

  function plate(words: string, y: number, colour: string): void {
    const width = Math.max(120, pen.width(words) + 16);
    pen.px(Math.round(SCENE_W / 2 - width / 2), y, width, 17, C.ink);
    pen.txt(words, Math.round(SCENE_W / 2), y + 2, colour, "center");
  }

  function button(rect: Box, label: string, lit: boolean, live: boolean): void {
    const [x, y, w, h] = rect;
    pen.px(x, y, w, h, lit ? C.amberD : C.steelDD);
    pen.px(x + 1, y + 1, w - 2, h - 2, lit ? "#3a2a12" : live && inRect(mouse, rect) ? C.btnH : C.btn);
    if (label !== "") pen.txt(pen.fit(label, w - 4), x + Math.round(w / 2), y + Math.round((h - 13) / 2), lit ? C.amber : live ? C.bone : C.dim, "center");
  }

  /** The card everyone has: each square with its shape, dim, since nobody is told what they have won. */
  function drawCard(): void {
    if (latest === null) return;
    const board = latest.view.board;
    const side = Math.round(Math.sqrt(board.length));
    pen.txt(WORDS.card, CARD_X, 26, C.boneD);
    board.forEach((kind, index) => {
      const x = CARD_X + (index % side) * (CELL + CELL_GAP);
      const y = CARD_Y + Math.floor(index / side) * (CELL + CELL_GAP);
      pen.px(x, y, CELL, CELL, C.steelDD);
      pen.px(x + 1, y + 1, CELL - 2, CELL - 2, C.btn);
      drawShape(kind, x + 5, y + 5, CELL - 10, SHAPE_COLOURS[kind]);
    });
  }

  /** Beside the card: for each round played, how many chose each shape and what it went for, the highest kept secret. */
  function drawTable(): void {
    if (latest === null) return;
    const view = latest.view;
    const mine = me();
    SHAPES.forEach((kind, column) => drawShape(kind, TABLE_X + TABLE_LABEL + column * TABLE_COLUMN + Math.round(TABLE_COLUMN / 2) - 5, TABLE_HEAD_Y, 10, SHAPE_COLOURS[kind]));
    for (let round = 1; round <= view.rounds; round++) {
      const y = TABLE_Y + (round - 1) * TABLE_PITCH;
      const past = view.past.find((each) => each.round === round);
      const current = round === view.round;
      pen.txt(`${round}`, TABLE_X + TABLE_LABEL - 4, y, current ? C.amber : past !== undefined ? C.boneD : C.dim, "right");
      // the round being bid on: the tickets are out, the winning bids are not
      const choices = past?.choices ?? (current ? view.choices : null);
      if (choices === null) continue;
      const own = mine === null ? undefined : choices.find((each) => each.player === mine)?.shape;
      SHAPES.forEach((kind, column) => {
        const x = TABLE_X + TABLE_LABEL + column * TABLE_COLUMN;
        if (own === kind) pen.px(x, y, TABLE_COLUMN - 2, TABLE_PITCH - 1, C.btnH);
        const votes = choices.filter((each) => each.shape === kind).length;
        pen.txt(WORDS.votes(votes), x + 1, y, votes === 0 ? C.dim : C.boneD);
        const lot = past?.lots.find((each) => each.shape === kind);
        if (lot === undefined) return;
        if (lot.secret) pen.txt("?", x + TABLE_COLUMN - 4, y, SHAPE_COLOURS.star, "right");
        else if (lot.price === null) pen.txt("-", x + TABLE_COLUMN - 4, y, C.dim, "right");
        else pen.txt(WORDS.bidShort(lot.price), x + TABLE_COLUMN - 4, y, C.amber, "right");
      });
    }
  }

  /** The three boxes: to put a ticket in while shapes are chosen, and after that with the names of those who did. */
  function drawBoxes(): void {
    if (latest === null) return;
    const view = latest.view;
    const mine = me();
    const live = choosing() && !pending;
    const result = view.phase === "result" ? view.past.find((each) => each.round === view.round) : undefined;
    SHAPES.forEach((kind, index) => {
      const rect = boxRect(index);
      const [x, y, w, h] = rect;
      const pointed = live && shape === kind;
      const own = view.choice === kind;
      pen.px(x, y, w, h, pointed ? C.amberD : own ? SHAPE_COLOURS[kind] : live && inRect(mouse, rect) ? C.steel : C.steelDD);
      pen.px(x + 1, y + 1, w - 2, h - 2, pointed ? "#3a2a12" : live ? C.btn : C.ink);
      drawShape(kind, x + 4, y + 3, 11, SHAPE_COLOURS[kind]);
      const chose = view.choices?.filter((each) => each.shape === kind).map((each) => each.player) ?? null;
      const votes = chose === null ? "" : WORDS.votes(chose.length);
      const lot = result?.lots.find((each) => each.shape === kind);
      // the box's heading: the shape's name, and once the round is worked out what it went for
      const heading = lot === undefined ? WORDS.shape[kind] : lot.secret ? WORDS.secret : lot.price === null ? WORDS.noBid : WORDS.price(lot.price);
      const colour = lot === undefined ? (pointed || own ? C.amber : C.bone) : lot.secret ? SHAPE_COLOURS.star : lot.price === null ? C.dim : C.amber;
      pen.txt(pen.fit(heading, w - 22 - (votes === "" ? 0 : pen.width(votes) + 4)), x + 19, y + 2, colour);
      if (votes !== "") pen.txt(votes, x + w - 4, y + 2, C.boneD, "right");
      pen.px(x + 1, y + 17, w - 2, 1, C.steelDD);
      if (chose === null) {
        // tickets are going in: the shape, large, and the key that points at it
        drawShape(kind, x + Math.round(w / 2) - 17, y + 24, 34, pointed || own ? SHAPE_COLOURS[kind] : SHAPE_DIM[kind]);
        if (live && !TOUCH) pen.txt(`${index + 1}`, x + w - 5, y + h - 15, C.dim, "right");
        return;
      }
      const room = NAMES_IN_ROW * NAME_ROWS;
      const shown = chose.length > room ? chose.slice(0, room - 1) : chose;
      shown.forEach((player, at) => {
        pen.txt(pen.fit(nickOf(player), BOX_NAME), x + 4 + (at % NAMES_IN_ROW) * (BOX_NAME + 4), y + 21 + Math.floor(at / NAMES_IN_ROW) * 13, player === mine ? C.amber : C.bone);
      });
      if (chose.length > room) pen.txt(`+${chose.length - shown.length}`, x + 4 + (BOX_NAME + 4), y + 21 + (NAME_ROWS - 1) * 13, C.boneD);
    });
  }

  /** A card drawn small: a square filled in its shape's colour, one not filled dark. A card filled whole has a bright edge. */
  function drawMini(x: number, y: number, filled: readonly boolean[]): void {
    if (latest === null) return;
    const board = latest.view.board;
    const side = Math.round(Math.sqrt(board.length));
    const size = side * (MINI_CELL + 1) + 1;
    pen.px(x, y, size, size, filled.every((each) => each) ? C.brassH : C.ink);
    board.forEach((kind, index) => {
      pen.px(x + 1 + (index % side) * (MINI_CELL + 1), y + 1 + Math.floor(index / side) * (MINI_CELL + 1), MINI_CELL, MINI_CELL, filled[index] ? SHAPE_COLOURS[kind] : C.steelDD);
    });
  }

  /** The results' first page: everyone in the order of their places, each with their card as it was filled, their bingos, squares and coins left. */
  function drawPlaces(): void {
    if (latest === null || latest.view.final === null) return;
    const standings = latest.view.final.standings;
    const mine = me();
    const wide = standings.length <= FINAL_ROWS;
    const columnWidth = wide ? SCENE_W - 8 : 148;
    // where the three numbers end, from the left of a column
    const ends = wide ? [236, 262, 294] : [90, 112, 138];
    const heads = [WORDS.result.columns.lines, WORDS.result.columns.cells, WORDS.result.columns.coins];
    for (let column = 0; column < (wide ? 1 : 2); column++) {
      const x0 = 4 + column * (columnWidth + 2);
      if (column * FINAL_ROWS >= standings.length) break;
      heads.forEach((head, at) => pen.txt(head, x0 + ends[at], FINAL_Y - 14, C.dim, "right"));
    }
    standings.slice(0, FINAL_ROWS * 2).forEach((each, at) => {
      const x0 = 4 + Math.floor(at / FINAL_ROWS) * (columnWidth + 2);
      const y = FINAL_Y + (at % FINAL_ROWS) * FINAL_PITCH;
      const own = each.player === mine;
      if (own) pen.px(x0, y - 1, columnWidth, FINAL_PITCH, C.btnH);
      pen.txt(`${each.place}`, x0 + 13, y + 3, each.out ? C.dim : C.brass, "right");
      drawMini(x0 + 17, y, each.filled);
      const nameX = x0 + 40;
      pen.txt(pen.fit(nickOf(each.player), wide ? 78 : 34), nameX, y + 3, each.out ? C.dim : own ? C.amber : C.bone);
      if (wide) {
        // the shapes won, those the card had no square for among them
        SHAPES.forEach((kind, index) => {
          const sx = x0 + 126 + index * 28;
          drawShape(kind, sx, y + 5, 9, SHAPE_COLOURS[kind]);
          pen.txt(`${each.shapes[kind]}`, sx + 11, y + 3, C.boneD);
        });
      }
      pen.txt(`${each.lines}`, x0 + ends[0], y + 3, each.lines > 0 ? C.amber : C.boneD, "right");
      pen.txt(`${each.cells}`, x0 + ends[1], y + 3, C.bone, "right");
      pen.txt(`${each.coins}`, x0 + ends[2], y + 3, C.boneD, "right");
    });
  }

  /** The results' second page: every round with what each shape went for, the secret ones too, and who won it. */
  function drawRounds(): void {
    if (latest === null || latest.view.final === null) return;
    const rounds = latest.view.final.rounds;
    const columnWidth = 93;
    const pitch = Math.min(ROUNDS_PITCH, Math.floor((BAR_Y - ROUNDS_Y - 2) / Math.max(1, rounds.length)));
    rounds.forEach((round, row) => {
      const y = ROUNDS_Y + row * pitch;
      pen.txt(`${round.round}`, 16, y + Math.round((pitch - 13) / 2), C.boneD, "right");
      round.lots.forEach((lot, column) => {
        const x = 22 + column * columnWidth;
        pen.px(x, y, columnWidth - 2, pitch - 1, C.btn);
        drawShape(lot.shape, x + 3, y + 2, 9, lot.votes === 0 ? SHAPE_DIM[lot.shape] : SHAPE_COLOURS[lot.shape]);
        pen.txt(WORDS.votes(lot.votes), x + 15, y, lot.votes === 0 ? C.dim : C.boneD);
        if (lot.price === null) {
          pen.txt("-", x + columnWidth - 6, y, C.dim, "right");
          return;
        }
        const secret = round.secret.includes(lot.shape);
        pen.txt(secret ? `${WORDS.bidShort(lot.price)} ?` : WORDS.bidShort(lot.price), x + columnWidth - 6, y, secret ? SHAPE_COLOURS.star : C.amber, "right");
        // a round of more lines than there is room for is told without its winners
        if (pitch < ROUNDS_PITCH) return;
        const each = WORDS.result.each(lot.share);
        const names = lot.winners.map((player) => nickOf(player)).join(", ");
        pen.txt(pen.fit(names, columnWidth - 12 - pen.width(each)), x + 3, y + 12, lot.winners.includes(me() ?? -1) ? C.amber : C.bone);
        pen.txt(each, x + columnWidth - 6, y + 12, C.boneD, "right");
      });
    });
  }

  function drawScene(): void {
    if (latest === null) return;
    pen.px(0, 0, SCENE_W, BAR_Y, C.night);
    for (let y = 9; y < BAR_Y; y += 17) pen.px(0, y, SCENE_W, 1, C.wallD);
    if (latest.view.phase === "ended" && latest.view.final !== null) {
      pen.txt(pen.fit(page === "places" ? WORDS.result.places : WORDS.result.rounds, PAGE_RECT[0] - 16), 8, 26, C.amber);
      button(PAGE_RECT, page === "places" ? WORDS.button.rounds : WORDS.button.places, false, true);
      if (page === "places") drawPlaces();
      else drawRounds();
    } else {
      drawCard();
      drawTable();
      drawBoxes();
    }
    if (latest.frozen) {
      // the game's own clock stands still; this one runs, and ends the game at nought
      const stand = latest.clock.stand === null ? null : Math.max(0, latest.clock.stand - (performance.now() - receivedAt));
      plate(WORDS.waitingBack(stand === null ? null : Math.ceil(stand / 1000)), 80, C.boneD);
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
    const ms = left(latest.clock.phase) ?? 0;
    const seconds = Math.ceil(ms / 1000);
    const clock = clockOf(ms);
    const of = takingPart(view);
    if (view.phase === "result") return [view.round >= view.rounds ? WORDS.standing.lastResult(seconds) : WORDS.standing.result(view.round, seconds), C.bone];
    if (view.phase === "choose") {
      if (mine === null) return [WORDS.standing.watchChoose(view.chosen.length, of, clock), C.bone];
      if (!active(view)) return [WORDS.standing.out, C.boneD];
      if (pending) return [WORDS.standing.sending, C.boneD];
      if (view.choice !== null) return [WORDS.standing.chosen(WORDS.shape[view.choice], view.chosen.length, of, clock), C.teal];
      return shape !== null ? [WORDS.standing.chooseReady(WORDS.shape[shape], clock), C.amber] : [WORDS.standing.choose(clock), C.amber];
    }
    if (mine === null) return [WORDS.standing.watchBid(view.bidders.length, of, clock), C.bone];
    if (!active(view)) return [WORDS.standing.out, C.boneD];
    if (pending) return [WORDS.standing.sending, C.boneD];
    const on = view.choice === null ? "" : WORDS.shape[view.choice];
    if (view.bid !== null) return [WORDS.standing.bidDone(on, view.bid.amount, view.bidders.length, of, clock), C.teal];
    return picked.length > 0 ? [WORDS.standing.bidReady(on, sum(picked), clock), C.amber] : [WORDS.standing.bid(on, clock), C.amber];
  }

  function drawPanel(): void {
    if (latest === null) return;
    const view = latest.view;
    const x = PANEL_X;
    const mine = me();
    pen.px(SCENE_W, 0, W - SCENE_W, BAR_Y, C.night);
    pen.px(SCENE_W, 0, 1, BAR_Y, C.steelDD);
    pen.txt(WORDS.round(view.round, view.rounds), x, 3, C.bone);
    const phase = left(latest.clock.phase);
    if (phase !== null) pen.txt(clockOf(phase), W - 5, 3, Math.ceil(phase / 1000) <= HURRY_FROM ? C.crim : C.boneD, "right");
    // while the game is played the players stand in the order of their numbers: nobody has a place before the end
    const order = view.final !== null ? view.final.standings.map((each) => each.player) : view.players;
    const layout = panelLayout(order.length);
    // in a crowded game the page's tabs are where the line under the heading would be
    if (!layout.crowded) pen.px(x, 16, PANEL_WIDTH, 1, C.steelDD);
    order.forEach((player, at) => {
      const { dx, y } = entryAt(layout, at);
      const ex = x + dx;
      let right = ex + layout.entryWidth - 1;
      const info = latest!.players.find((one) => one.id === player);
      const gone = info !== undefined && (info.left || !info.connected);
      const out = view.out.includes(player);
      const place = view.final?.standings.find((each) => each.player === player)?.place;
      let nameX = ex;
      if (place !== undefined) {
        pen.txt(`${place}`, ex + (layout.crowded ? 12 : 7), y, C.brass, "right");
        nameX = ex + (layout.crowded ? 16 : 12);
      }
      // at the right of an entry: where their ticket went once the tickets are out, and before it a mark that they have done what the round waits for
      const chose = view.phase === "ended" ? undefined : view.choices?.find((each) => each.player === player)?.shape;
      if (chose !== undefined) {
        drawShape(chose, right - 8, y + 2, 9, SHAPE_COLOURS[chose]);
        right -= 12;
      }
      const done = view.phase === "choose" ? view.chosen.includes(player) : view.phase === "bid" ? view.bidders.includes(player) : false;
      if (done) {
        pen.px(right - 5, y + 4, 5, 5, C.teal);
        right -= 8;
      }
      let words = "";
      if (out && view.phase !== "ended") words = layout.crowded ? "" : WORDS.outMark;
      else if (player === mine && view.purse !== null && !layout.crowded) words = WORDS.coins(sum(view.purse.coins));
      if (words !== "") {
        pen.txt(words, right, y, out ? C.dim : C.boneD, "right");
        right -= pen.width(words) + 3;
      }
      const voice = info === undefined || info.bot || info.left ? "out" : handlers.voice(player);
      const room = right - nameX - (voice !== "out" ? VOICE_MARK_W + 2 : 0);
      const name = pen.fit(info?.nick ?? "", Math.min(NAME_WIDTH, room));
      pen.txt(name, nameX, y, gone || out ? C.dim : mine === player ? C.amber : C.bone);
      if (voice !== "out") drawVoiceMark(pen, nameX + pen.width(name) + 2, y, voice, time);
    });
    pen.px(x, layout.crowded ? underList(layout) : 86, PANEL_WIDTH, 1, C.steelDD);
    // the log: what this player bid, round by round; nobody else's bids are known
    const lines: [string, string][] = view.mine.map((each) => [WORDS.log.bid(each.round, WORDS.shape[each.shape], each.amount), C.boneD]);
    if (view.ended !== null) lines.push([WORDS.ended[view.ended], C.amber]);
    const from = Math.max(0, lines.length - layout.logRows);
    for (let i = from; i < lines.length; i++) pen.txt(pen.fit(lines[i][0], PANEL_WIDTH), x, layout.logTop + (i - from) * LOG_PITCH, lines[i][1]);
    // a chat line beside its speaker's name, over the edge of the scene
    for (const [player, line] of speech) {
      const at = order.indexOf(player);
      if (at >= 0) drawSpeech(pen, { label: { x: SCENE_W, y: entryAt(layout, at).y, align: "left" } }, line.lines);
    }
  }

  /** The player's coins, as buttons while they bid, and beside them the piece to turn into a coin and the bid itself. */
  function drawPurse(): void {
    if (latest === null || latest.view.purse === null) return;
    const purse = latest.view.purse;
    const live = bidding() && !pending;
    const lit = pickedAmong(purse.coins);
    purse.coins.forEach((coin, index) => button(coinRect(index, purse.coins.length), `${coin}`, live && lit[index], live));
    if (!bidding()) return;
    const [x, y, w, h] = PIECE_RECT;
    const pieces = live && purse.pieces > 0;
    button(PIECE_RECT, "", false, pieces);
    WORDS.button.piece(purse.pieces).forEach((line, at) => pen.txt(pen.fit(line, w - 2), x + Math.round(w / 2), y + 1 + at * 13, pieces ? C.bone : C.dim, "center"));
    void h;
    button(SUBMIT_RECT, WORDS.button.bid, live && picked.length > 0, live);
  }

  /** What this player came out of the game with, in the word the results lead with; `null` while it is being played, and for someone who watched. */
  function verdict(): string | null {
    const mine = me();
    if (latest === null || latest.view.final === null || mine === null) return null;
    const own = latest.view.final.standings.find((each) => each.player === mine);
    return own === undefined ? null : WORDS.result.verdict(true, own.place);
  }

  function drawResults(): void {
    if (latest === null) return;
    const view = latest.view;
    const mine = me();
    const standings = view.final?.standings ?? [];
    const own = mine === null ? undefined : standings.find((each) => each.player === mine);
    pen.txt(WORDS.result.verdict(own !== undefined, own?.place ?? 0), 10, 234, own === undefined ? C.bone : own.place === 1 ? C.teal : C.bone, "left", 24);
    // the first three by name, as many of them as fit whole; the scene has everyone
    let places = "";
    for (const each of standings.slice(0, PLACES_SHOWN)) {
      const one = WORDS.result.place(each.place, pen.fit(nickOf(each.player), 56), each.lines);
      const longer = places === "" ? one : `${places} · ${one}`;
      if (pen.width(longer) > RESULT_WIDTH) break;
      places = longer;
    }
    pen.txt(places, 96, 226, C.bone);
    const how = view.ended === null ? "" : WORDS.ended[view.ended];
    pen.txt(pen.fit(own === undefined ? how : own.out ? WORDS.result.mineOut : WORDS.result.mine(own.lines, own.cells, own.coins), RESULT_WIDTH), 96, 240, C.boneD);
    if (noteT > 0) pen.txt(note, 96, 254, C.amber);
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
    if (me() === null) {
      // someone watching is told what the game is, over the keys
      pen.txt(pen.fit(WORDS.sheet.brief.goal, W - 12), 6, 240, C.boneD);
      pen.txt(idle, 6, 254, C.dim);
      return;
    }
    if (choosing()) {
      const live = !pending;
      SHAPES.forEach((kind, index) => {
        const rect = shapeButton(index);
        const lit = live && shape === kind;
        button(rect, "", lit, live);
        drawShape(kind, rect[0] + 6, rect[1] + 8, 12, SHAPE_COLOURS[kind]);
        pen.txt(pen.fit(keyed(`${index + 1}`, WORDS.shape[kind]), rect[2] - 26), rect[0] + 22, rect[1] + 7, lit ? C.amber : live ? C.bone : C.dim);
      });
      button(SUBMIT_RECT, WORDS.button.put, live && shape !== null, live);
      return;
    }
    if (!active(view)) {
      pen.txt(idle, 6, 240, C.dim);
      return;
    }
    drawPurse();
  }

  function drawHelp(): void {
    if (latest === null) return;
    const rules = latest.rules;
    const lines = WORDS.help({
      rounds: rules.rounds,
      coins: rules.coins.length,
      total: sum(rules.coins),
      pieces: rules.pieces,
      chooseSeconds: latest.view.seconds.chooseSeconds,
      bidSeconds: latest.view.seconds.bidSeconds,
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
    if (!event.repeat) keys.push(event.code);
    if (event.code === "Space" || event.code.startsWith("Arrow") || event.code === "Backspace") event.preventDefault();
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
    // a pointer that has left the screen, or a finger that has lifted, is over none of its buttons
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
  void pixelFont();

  return {
    update,
    verdict,
    // by the room's last word, not by a move of this page's still on its way; a game that stands still waits on no one
    waits: (): boolean => truth !== null && !truth.frozen && bingoWaits(truth.view),
    refused(reason: string): void {
      starting = false;
      pending = false;
      takeBack();
      say(WORDS.refused[reason] ?? WORDS.refusedOther);
      sfx.deny();
    },
    lost(): void {
      starting = false;
      pending = false;
      // whether the move reached the room is not known: the game the room sends on coming back will say
      takeBack();
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
