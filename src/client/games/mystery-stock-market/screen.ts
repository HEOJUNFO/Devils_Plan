/**
 * The screen of 미스터리 거래소: the monitor (every stock's price, what was
 * bought and sold of it, what is held of it in all, everyone's assets and
 * place), the rule board (each stock's rule, as far as it is open to this
 * player), the charts with the exchange's emblem, and the player's own
 * terminal: what they hold, and the buttons that buy, sell, use the secret,
 * spend a piece and finish the round.
 *
 * Design: design/games/mystery-stock-market.md. The room decides everything;
 * this screen shows what it sends and asks it to take an order. The show's
 * own monitor and logo are not copied: the table, the cards and the emblem
 * are this project's. Everything can be done with the pointer; the keys are
 * a shorter way to the same.
 */
import { STOCKS } from "../../../shared/games/mystery-stock-market/prices";
import { CARD, placeWords, wordsOf, type CardPiece, type HiddenWord } from "../../../shared/games/mystery-stock-market/rule-words";
import type { MarketEvent, MarketMove, StockView } from "../../../shared/games/mystery-stock-market/rules";
import { hits, type Press, type Reach } from "../../../shared/frame";
import type { ServerMessage } from "../../../shared/protocol";
import type { VoiceMark } from "../../../shared/voice";
import { BAR_Y, H, PANEL_X, Pen, SCENE_W, VOICE_MARK_W, W, drawSpeech, drawVoiceMark, speechLines, speechSeconds } from "../../game/draw";
import { C } from "../../game/palette";
import { AGAIN_REACH, LOBBY_REACH, watchPointer } from "../../game/pointer";
import { isMuted, setMuted, sfx, startAudio } from "../../game/sound";
import { lang } from "../../lang";
import { TOUCH } from "../../touch";
import { LOG_PITCH, PANEL_WIDTH, entryAt, isCrowded, panelLayout, underList } from "../panel";
import { WORDS, grouped } from "./words";

/** What the room sends about a game of 미스터리 거래소. */
export type MarketMessage = Extract<ServerMessage, { type: "game"; game: "mystery-stock-market" }>;

/** What the screen asks of whoever owns the connection. */
export interface MarketHandlers {
  /** The player asked for something: an order, their secret, a piece, the end of their round. Returns whether it could be sent. */
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
  /** Whether this is the player's first game of 미스터리 거래소 (`GameHandlers.first`): until they have bought anything, the bar says what the game is where it would say what they hold. */
  first: boolean;
}

/** The game screen. */
export interface MarketScreen {
  update(message: MarketMessage): void;
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
/** The table: where its heads are, where its first row is and how far apart the rows are. */
const HEAD_Y = 24;
const ROW_Y = 39;
const ROW_H = 18;
/** Where a stock's name begins. Where the names end and where the numbers of each column end is the language's to say (`WORDS.columnAt`). */
const NAME_X = 7;
/** The least space between a column and the numbers of the next, and the room the arrow beside a price takes. */
const COLUMN_GAP = 5;
const ARROW_ROOM = 8;
/** The line across under the table, the stock's name over its rule, and the rule's lines. How wide a rule may be, and how far apart its words are, is `CARD`'s to say. */
const DETAIL_Y = 167;
const CARD_X = 6;
const CARD_Y = 183;
const CARD_PITCH = 13;
/** The emblem over the table, at the top of the scene. */
const EMBLEM = { x: 238, y: 3, w: 62, h: 18 } as const;
/** The charts: four to a row under the switch that brings the table back, and the emblem in the last place. */
const CELL_W = 74;
const CELL_H = 64;
const CELL_Y = 38;
const CELLS_IN_ROW = 4;
/** The widest a name is drawn in the list of players, in pixels. */
const NAME_WIDTH = 62;
/** With this many seconds or fewer of the round left, the clock turns red: the show's dealer calls the last minute. */
const HURRY_FROM = 60;
/** Seconds the results are on show before Enter starts another game: the host may have been pressing Enter to finish a round. */
const RESULTS_HOLD = 1.5;
/** How many of the first places the results name in the bar, and how wide its lines may be. */
const PLACES_SHOWN = 3;
const RESULT_WIDTH = 280;
/** The most figures a number of shares is typed with. */
const MOST_FIGURES = 6;
/** A word of a rule that is the next to be opened; and the squares of one that is not open. */
const NEXT_WORD = "#3b6fd6";
const HIDDEN_WORD = C.steelD;
/** A chart's line and its dots. */
const CHART_LINE = C.steelD;
const CHART_DOT = C.bone;

type Box = readonly [number, number, number, number];

const inRect = (p: { x: number; y: number }, r: Box): boolean => p.x >= r[0] && p.x < r[0] + r[2] && p.y >= r[1] && p.y < r[1] + r[3];

/** The place of a stock's row in the table, and of a chart among the charts. */
const rowRect = (index: number): Box => [2, ROW_Y - 3 + index * ROW_H, SCENE_W - 4, ROW_H];
const cellRect = (index: number): Box => [4 + (index % CELLS_IN_ROW) * (CELL_W + 1), CELL_Y + Math.floor(index / CELLS_IN_ROW) * CELL_H, CELL_W - 1, CELL_H - 2];
/**
 * The switch between the table and the charts, where the table has no head.
 * Under a finger it is beside the menu's button instead, over the table: right
 * under that button it was 14 pixels tall, and a press meant for it was taken
 * by the button above.
 */
const VIEW_RECT: Box = TOUCH ? [56, 2, 60, 20] : [4, 22, 60, 14];
/** Where its word is written. Under a finger: level with the word of the menu's button beside it. */
const VIEW_WORD_Y = VIEW_RECT[1] + (TOUCH ? 5 : 1);
/** The buttons of the bar while orders are taken. */
const MINUS_RECT: Box = [6, 238, 16, 28];
const SHARES_RECT: Box = [24, 238, 52, 28];
const PLUS_RECT: Box = [78, 238, 16, 28];
const MAX_RECT: Box = [98, 238, 42, 28];
const ALL_RECT: Box = [142, 238, 42, 28];
const BUY_RECT: Box = [188, 238, 42, 28];
const SELL_RECT: Box = [232, 238, 42, 28];
const SECRET_RECT: Box = [278, 238, 60, 28];
const PIECE_RECT: Box = [340, 238, 52, 28];
const DONE_RECT: Box = [396, 238, 78, 28];
/** The buttons of the bar while the player is asked whether they mean it. */
const THIRD_RECT: Box = [232, 238, 78, 28];
const SECOND_RECT: Box = [314, 238, 78, 28];
const LAST_RECT: Box = [396, 238, 78, 28];
/**
 * How long a question is up before a finger or a click answers it. Its buttons lie where the button that asked it
 * was (피스 under "현금으로", 마침 under "취소"): the second press of a double press is not its answer.
 */
const QUESTION_HOLD = 0.35;
/** How long the bar goes on saying that a press came while a move was on its way, where the move is back sooner. */
const HURRIED_SHOWN = 0.8;
const AGAIN_RECT: Box = [386, 225, 90, 15];
const LOBBY_RECT: Box = [386, 250, 90, 15];
/**
 * Under a finger a number of shares has no keys to be typed with: a press on
 * the number puts a pad of figures in place of the bar's buttons, the number
 * at its left. The pad's buttons, in order, and the key each stands for.
 */
const FIGURES_RECT: Box = [6, 238, 80, 28];
const PAD_CODES: readonly string[] = [...["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((digit) => `Digit${digit}`), "Backspace", "Enter"];
const padRect = (index: number): Box => [92 + index * 32, 238, 30, 28];
/**
 * How far the buttons of the bar take a finger: half the gap to the next,
 * and up and down to the edges of the bar's row. The two that step the
 * number by one are 16 pixels wide: the first reaches to the frame's edge,
 * the second over the gap beside it.
 */
const BAR_REACH: Reach = [1, 4, 1, 4];
const MINUS_REACH: Reach = [6, 4, 1, 4];
const PLUS_REACH: Reach = [1, 4, 3, 4];
/**
 * The switch between the table and the charts. Beside the menu's button: to
 * that button's edge, up to the frame's, and down to the table's head. Where
 * a mouse has it: sideways, and down as far as the table's first row.
 */
const VIEW_REACH: Reach = TOUCH ? [2, 2, 8, 4] : [4, 0, 8, 2];

/** A small arrow, for a price that rose and for one that fell. */
const ARROW_UP = ["..#..", ".###.", "#####"] as const;
const ARROW_DOWN = ["#####", ".###.", "..#.."] as const;

/** What the bar is asking the player: for orders, or whether they mean what they just pressed. */
type Mode = "trade" | "secret" | "piece" | "done";

/** A clock that has `ms` left, as minutes and seconds. */
function clockOf(ms: number): string {
  const all = Math.ceil(ms / 1000);
  return `${Math.floor(all / 60)}:${`${all % 60}`.padStart(2, "0")}`;
}

/** Makes `canvas` the game screen. Nothing is drawn until the first {@link MarketScreen.update}. */
export function createMarketScreen(canvas: HTMLCanvasElement, handlers: MarketHandlers): MarketScreen {
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2D drawing in this browser");
  const ctx: CanvasRenderingContext2D = context;
  const pen = new Pen(ctx);

  let latest: MarketMessage | null = null;
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
  /** What was asked of the room and has not shown in what it sends yet; `null` when nothing is on its way. */
  let sent: MarketMove | null = null;
  /** The host has asked for the next game and the room has not answered yet. */
  let starting = false;
  /** The game as the room last sent it: what is shown again if a move drawn ahead of the room is refused. */
  let truth: MarketMessage | null = null;
  /**
   * The move on its way to the room, as the change it makes to the player's own holdings in what the room
   * sent, where that can be worked out here: an order at a price on show, for cash on show, is worked out by
   * the room in the same way. It is drawn, and said, at once: the room is a moment away, and shares that turn
   * up only when it answers read as a press not taken. It is drawn again over whatever the room sends before
   * its answer, and dropped when the answer comes or the move is refused. `null` for a move that waits for
   * the room to be shown (a stock whose price is covered, a piece spent on a rule).
   */
  let ahead: ((view: MarketMessage["view"]) => MarketMessage["view"]) | null = null;
  /** The connection to the room is down; the next thing the room sends says it is back. */
  let offline = false;
  let host = false;
  let help = false;
  let note = "";
  let noteT = 0;
  /** Which stock the rule, the orders and the secret are for: its place in the table. */
  let selected = 0;
  /** The number of shares being entered, as typed. */
  let typed = "1";
  /** Whether that number was put there by a button and not typed: the next figure typed then takes its place. */
  let put = true;
  let mode: Mode = "trade";
  /** When the question that is up was asked, by this screen's clock. */
  let modeAt = 0;
  /** When a press last came while a move was on its way, by this screen's clock; `null` once a move has gone since. */
  let hurriedAt: number | null = null;
  /** Whether the pad of figures is on show in place of the bar's buttons. */
  let pad = false;
  /** Whether the charts are on show in place of the table. */
  let charts = false;
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
  const mine = () => latest?.view.mine ?? null;
  const stockAt = (index: number): StockView | undefined => latest?.view.stocks[index];
  const chosen = (): StockView | undefined => stockAt(selected);
  /** Whether the player at this screen can do anything in the round now. */
  function atWork(): boolean {
    const own = mine();
    return latest !== null && own !== null && latest.view.phase === "trading" && !latest.frozen && !own.done;
  }
  /** The number of shares entered; 0 while nothing is. */
  const shares = (): number => (typed === "" ? 0 : Number(typed));
  /** The most shares of the chosen stock the player's money buys; `null` where its price or their money is kept back. */
  function mostBought(): number | null {
    const own = mine();
    const stock = chosen();
    if (own === null || stock === undefined || own.cash === null || stock.price === null) return null;
    return Math.floor(own.cash / stock.price);
  }

  function say(text: string): void {
    note = text;
    noteT = 2.5;
  }

  /** Shows one thing that happened: a sound, and a word where the player should not miss it. */
  function show(event: MarketEvent): void {
    if (event.type === "round") {
      if (event.round > 1) sfx.turn();
    } else if (event.type === "opened") {
      // a screen that was out of sight may be shown this once the game is over: the results have that line then
      if (latest?.view.phase !== "ended") say(WORDS.say.opened);
      sfx.swap();
    } else if (event.type === "hidden") {
      sfx.back();
    } else {
      const own = latest?.view.you ?? null;
      const rank = latest?.view.standings.find((each) => each.player === own)?.rank;
      if (rank === 1) sfx.win();
      else if (rank !== undefined) sfx.lose();
    }
  }

  /** Whether what was asked shows in `now`, which `before` did not have: only then is it said to be done. */
  function took(move: MarketMove, before: MarketMessage, now: MarketMessage): boolean {
    const was = before.view.mine;
    const is = now.view.mine;
    if (was === null || is === null) return false;
    if (move.type === "buy") return is.shares[move.stock] > was.shares[move.stock];
    if (move.type === "sell") return is.shares[move.stock] < was.shares[move.stock];
    if (move.type === "secret") return was.secret && !is.secret;
    if (move.type === "done") return is.done;
    return is.pieces < was.pieces;
  }

  /** Asks the room for the next game, once: a press made again before the room answers is the same press. */
  function askAgain(): void {
    if (starting) return;
    starting = handlers.again();
    if (!starting) say(WORDS.notSent);
  }

  /** What `move` makes of the player's own holdings, where this page can tell (see `ahead`); `null` where only the room can. */
  function foreseen(move: MarketMove, from: MarketMessage): ((view: MarketMessage["view"]) => MarketMessage["view"]) | null {
    const own = (change: (mine: NonNullable<MarketMessage["view"]["mine"]>, view: MarketMessage["view"]) => NonNullable<MarketMessage["view"]["mine"]> | null) => {
      return (view: MarketMessage["view"]): MarketMessage["view"] => {
        const next = view.mine === null ? null : change(view.mine, view);
        return next === null ? view : { ...view, mine: next };
      };
    };
    const priceIn = (view: MarketMessage["view"], id: MarketMove extends infer Each ? (Each extends { stock: infer Id } ? Id : never) : never): number | null =>
      view.stocks.find((each) => each.id === id)?.price ?? null;
    if (move.type === "buy" || move.type === "sell") {
      // a price or a purse that is covered leaves nothing to work the order out from
      if (from.view.mine === null || from.view.mine.cash === null || priceIn(from.view, move.stock) === null) return null;
      const sign = move.type === "buy" ? 1 : -1;
      return own((mine, view) => {
        const price = priceIn(view, move.stock);
        if (price === null || mine.cash === null) return null;
        return { ...mine, shares: { ...mine.shares, [move.stock]: mine.shares[move.stock] + sign * move.shares }, cash: mine.cash - sign * move.shares * price };
      });
    }
    if (move.type === "cash") {
      if (from.view.mine === null || from.view.mine.cash === null) return null;
      const gain = from.rules.pieceCash;
      return own((mine) => (mine.cash === null ? null : { ...mine, cash: mine.cash + gain, assets: mine.assets === null ? null : mine.assets + gain, pieces: mine.pieces - 1 }));
    }
    if (move.type === "secret") return own((mine) => ({ ...mine, secret: false }));
    if (move.type === "done") return own((mine) => ({ ...mine, done: true }));
    return null;
  }

  /** Says what a move did, with its sound: when the room shows it, or at once for one drawn ahead. */
  function sayDone(move: MarketMove, rules: MarketMessage["rules"]): void {
    const name = "stock" in move ? WORDS.short[move.stock] : "";
    if (move.type === "buy") say(WORDS.say.bought(name, WORDS.shares(move.shares)));
    else if (move.type === "sell") say(WORDS.say.sold(name, WORDS.shares(move.shares)));
    else if (move.type === "secret") say(WORDS.say.secret(name));
    else if (move.type === "peek") say(WORDS.say.peeked(name));
    else if (move.type === "cash") say(WORDS.say.cashed(WORDS.won(rules.pieceCash)));
    if (move.type !== "done") sfx.pick();
  }

  function update(message: MarketMessage): void {
    // the next game has begun: what was asked for is here
    if (message.view.phase !== "ended") starting = false;
    // what the room last sent, not that with a move of this page's drawn over it
    const before = truth;
    const fresh = before === null || before.startedAt !== message.startedAt;
    if (fresh) {
      // A game met part-way is shown as it stands; only what happens from here on is played out.
      seen = message.view.history.length;
      speech.clear();
      selected = 0;
      typed = "1";
      put = true;
      charts = false;
      mode = "trade";
      pad = false;
      sent = null;
      if (before !== null) sfx.turn();
    }
    if (message.view.phase === "ended" && (fresh || before?.view.phase !== "ended")) {
      endedAt = time;
      mode = "trade";
      sent = null;
    }
    if (before !== null && !fresh) {
      if (before.view.round !== message.view.round) {
        // what was being asked belonged to the round that is over
        mode = "trade";
        sent = null;
      } else if (sent !== null && took(sent, before, message)) {
        // one drawn ahead was said as it was made
        if (ahead === null) sayDone(sent, message.rules);
        sent = null;
      } else if (sent !== null && message.answer === true) {
        // the room has answered and nothing of the move shows: it is not waited for any longer
        sent = null;
      }
    }
    truth = message;
    if (sent === null) ahead = null;
    // a move still on its way is drawn over what the room sends meanwhile, which does not have it yet
    latest = ahead === null ? message : { ...message, view: ahead(message.view) };
    receivedAt = performance.now();
    offline = false;
    handlers.crowded(isCrowded(message.players.length));
  }

  // ---- Input -----------------------------------------------------------------------------------------
  /**
   * Whether a move is on its way to the room. The press that asked is then told so and comes to nothing: the bar's
   * line says it while the move is out (`standing`), not as a note, which would outlive it and cover what the
   * move did.
   */
  function busy(): boolean {
    if (sent === null) return false;
    hurriedAt = time;
    sfx.deny();
    return true;
  }

  /** Puts a question in the bar. */
  function question(asked: Exclude<Mode, "trade">): void {
    mode = asked;
    modeAt = time;
  }

  /**
   * Asks the room for `move` in the round being played, and shows it at once where its outcome can be told here
   * (`ahead`). Whether it went: not while the move before it is on its way (the bar says so: a second press is
   * not counted and not lost without a word), and not without a connection.
   */
  function ask(move: MarketMove): boolean {
    if (latest === null || busy()) return false;
    if (!handlers.act({ ...move, round: latest.view.round })) {
      say(WORDS.notSent);
      return false;
    }
    sent = move;
    hurriedAt = null;
    ahead = foreseen(move, latest);
    if (ahead === null) return true;
    sayDone(move, latest.rules);
    latest = { ...latest, view: ahead(latest.view) };
    return true;
  }

  /** Takes back a move drawn ahead of the room: the game is shown as the room last sent it. */
  function takeBack(): void {
    if (ahead !== null && truth !== null) latest = truth;
    ahead = null;
  }

  function order(type: "buy" | "sell"): void {
    const stock = chosen();
    if (stock === undefined || !atWork()) return;
    if (shares() < 1) {
      say(WORDS.say.noShares);
      sfx.deny();
      return;
    }
    // What the room would refuse for want of cash or of shares is not sent, where this page can tell: with the
    // price and the purse on show it works an order out as the room does.
    const own = latest?.view.mine ?? null;
    if (own !== null && type === "sell" && own.shares[stock.id] < shares()) {
      say(WORDS.refused["no-shares"]);
      sfx.deny();
      return;
    }
    if (own !== null && type === "buy" && own.cash !== null && stock.price !== null && shares() * stock.price > own.cash) {
      say(WORDS.refused["no-cash"]);
      sfx.deny();
      return;
    }
    ask({ type, stock: stock.id, shares: shares() });
    put = true;
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
    // Looking is for everyone, at any time: which stock, and the table or the charts.
    if (mode === "trade" || view.phase === "ended") {
      if (pressed("ArrowUp")) selected = (selected + STOCKS.length - 1) % STOCKS.length;
      if (pressed("ArrowDown")) selected = (selected + 1) % STOCKS.length;
      if (pressed("KeyC") || clicked(VIEW_RECT, VIEW_REACH)) {
        charts = !charts;
        sfx.move();
      }
      STOCKS.forEach((_stock, index) => {
        if (clicked(charts ? cellRect(index) : rowRect(index))) selected = index;
      });
    }

    if (view.phase === "ended") {
      if (pressed("Escape") || clicked(LOBBY_RECT, LOBBY_REACH)) {
        handlers.lobby();
      } else if ((pressed("Enter", "NumpadEnter", "KeyR") && time - endedAt >= RESULTS_HOLD) || (host && clicked(AGAIN_RECT, AGAIN_REACH))) {
        if (host) askAgain();
        // (someone who is not the host says with the same key that they would play one more: the tab beside the log shows it)
        else if (!handlers.wantAgain()) say(WORDS.refused["not-host"]);
      }
      return;
    }
    const own = view.mine;
    const stock = chosen();
    if (own === null || stock === undefined || !atWork()) {
      // nothing is entered while nothing can be ordered
      pad = false;
      return;
    }

    if (mode !== "trade") {
      // the bar is asking whether the player means it (a key answers at once; a button once the question has been up a moment)
      const answered = (rect: Box): boolean => time - modeAt >= QUESTION_HOLD && clicked(rect, BAR_REACH);
      if (pressed("Escape") || answered(LAST_RECT)) {
        mode = "trade";
      } else if (mode === "piece") {
        // (a question stays up when its answer did not go, so that it can be answered again)
        if (pressed("Digit1", "Numpad1") || answered(THIRD_RECT)) {
          if (ask({ type: "peek", stock: stock.id })) mode = "trade";
        } else if (pressed("Digit2", "Numpad2") || answered(SECOND_RECT)) {
          if (ask({ type: "cash" })) mode = "trade";
        }
      } else if (pressed("Enter", "NumpadEnter") || answered(SECOND_RECT)) {
        if (ask(mode === "secret" ? { type: "secret", stock: stock.id } : { type: "done" })) mode = "trade";
      }
      return;
    }

    // how many shares: typed, or stepped, or all that can be bought or sold
    /** Puts `count` shares in the box, as a button does: within what the box holds. */
    const enter = (count: number): void => {
      typed = `${Math.min(10 ** MOST_FIGURES - 1, Math.max(1, count))}`;
      put = true;
    };
    /** Takes one key of a number: a figure, or the one that takes a figure back. */
    const figure = (code: string): void => {
      const digit = /^(?:Digit|Numpad)(\d)$/.exec(code);
      if (digit !== null) {
        // a figure typed over a number that was not typed, or over nought, takes its place
        typed = put || typed === "0" ? digit[1] : (typed + digit[1]).slice(0, MOST_FIGURES);
        put = false;
        sfx.move();
      } else if (code === "Backspace") {
        typed = typed.slice(0, -1);
        put = false;
      }
    };
    if (pad) {
      // The pad's buttons count as the keys they stand for, after the keys that came with them. The key
      // that ends a number here puts the pad away: it does not end the round, as it does from the bar.
      const pressedOn = PAD_CODES.filter((_code, index) => clicked(padRect(index), BAR_REACH));
      for (const code of [...keys, ...pressedOn]) {
        if (code === "Enter" || code === "NumpadEnter" || code === "Escape") {
          pad = false;
          sfx.pick();
          break;
        }
        figure(code);
      }
      return;
    }
    for (const code of keys) figure(code);
    // a finger on the number itself asks for the pad
    if (clicks.some((p) => p.touch && hits(p, SHARES_RECT, [0, 4, 0, 4]))) {
      pad = true;
      // the number that stands there is taken over by the first figure
      put = true;
      sfx.pick();
      return;
    }
    if (pressed("ArrowRight") || clicked(PLUS_RECT, PLUS_REACH)) enter(shares() + 1);
    if (pressed("ArrowLeft") || clicked(MINUS_RECT, MINUS_REACH)) enter(shares() - 1);
    if (pressed("KeyA") || clicked(MAX_RECT, BAR_REACH)) {
      const most = mostBought();
      if (most === null) {
        say(WORDS.say.noMax);
        sfx.deny();
      } else enter(most);
    }
    if (pressed("KeyZ") || clicked(ALL_RECT, BAR_REACH)) enter(own.shares[stock.id]);

    if (pressed("KeyB") || clicked(BUY_RECT, BAR_REACH)) order("buy");
    else if (pressed("KeyS") || clicked(SELL_RECT, BAR_REACH)) order("sell");
    // (no question is put while a move is on its way: the bar does not draw one then, and it would be answered unseen)
    else if (pressed("KeyX") || clicked(SECRET_RECT, BAR_REACH)) {
      if (busy()) return;
      if (own.secret) question("secret");
      else {
        say(WORDS.refused["secret-used"]);
        sfx.deny();
      }
    } else if (pressed("KeyP") || clicked(PIECE_RECT, BAR_REACH)) {
      if (busy()) return;
      if (view.round > latest.rules.pieceRounds) say(WORDS.refused["pieces-closed"]);
      else if (own.pieces < 1) say(WORDS.refused["no-pieces"]);
      else question("piece");
    } else if (pressed("Enter", "NumpadEnter") || clicked(DONE_RECT, BAR_REACH)) {
      if (!busy()) question("done");
    }
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
    }
    stepInput();
    keys.length = 0;
    clicks.length = 0;
  }

  // ---- Drawing ---------------------------------------------------------------------------------------
  function plate(words: string, y: number, colour: string): void {
    const width = Math.max(120, pen.width(words) + 16);
    pen.px(Math.round(SCENE_W / 2 - width / 2), y, width, 17, C.ink);
    pen.txt(words, Math.round(SCENE_W / 2), y + 2, colour, "center");
  }

  /** A frame one pixel wide. */
  function frame(rect: Box, colour: string): void {
    const [x, y, w, h] = rect;
    pen.px(x, y, w, 1, colour);
    pen.px(x, y + h - 1, w, 1, colour);
    pen.px(x, y, 1, h, colour);
    pen.px(x + w - 1, y, 1, h, colour);
  }

  /** A path of heights as a line inside `rect`: the emblem, large or small. */
  function drawEmblem(rect: Box, colour: string): void {
    if (latest === null) return;
    const heights = latest.view.emblem;
    const top = Math.max(1, ...heights);
    const [x, y, w, h] = rect;
    const at = (n: number): [number, number] => [x + (n * (w - 1)) / Math.max(1, heights.length - 1), y + h - 1 - (heights[n] * (h - 1)) / top];
    for (let n = 1; n < heights.length; n++) pen.line(...at(n - 1), ...at(n), 1, colour);
  }

  /** A stock's prices so far as a chart inside `rect`: a dot for each round, joined where no round between is missing. */
  function drawChart(stock: StockView, rect: Box): void {
    if (latest === null) return;
    const [x, y, w, h] = rect;
    const known = stock.chart.filter((price): price is number => price !== null);
    if (known.length === 0) return;
    const low = Math.min(...known);
    const high = Math.max(...known);
    const rounds = latest.view.rounds;
    const at = (n: number, price: number): [number, number] => [
      Math.round(x + (n * (w - 2)) / rounds),
      // a price that never moved is drawn half-way up
      Math.round(high === low ? y + h / 2 : y + h - 2 - ((price - low) * (h - 3)) / (high - low)),
    ];
    stock.chart.forEach((price, n) => {
      const before = n > 0 ? stock.chart[n - 1] : null;
      if (price !== null && before !== null) pen.line(...at(n - 1, before), ...at(n, price), 1, CHART_LINE);
    });
    stock.chart.forEach((price, n) => {
      if (price !== null) pen.px(...at(n, price), 2, 2, CHART_DOT);
    });
  }

  /** A number as it is written where it has `room` pixels: whole where it fits, and shortened (12K) where it does not. */
  function figure(n: number, room: number): string {
    const whole = grouped(n);
    return pen.width(whole) <= room ? whole : WORDS.figure(n);
  }

  /** How many pixels the table has for a stock's price, with its arrow beside it. */
  const priceRoom = (): number => WORDS.columnAt.price - WORDS.columnAt.name - 2 - ARROW_ROOM;
  /** Whether the table has a stock's price whole. */
  const priceWhole = (price: number): boolean => pen.width(grouped(price)) <= priceRoom();

  function drawTable(): void {
    if (latest === null) return;
    const view = latest.view;
    const at = WORDS.columnAt;
    pen.txt(WORDS.column.price, at.price, HEAD_Y, C.dim, "right");
    pen.txt(WORDS.column.bought, at.bought, HEAD_Y, C.dim, "right");
    pen.txt(WORDS.column.sold, at.sold, HEAD_Y, C.dim, "right");
    pen.txt(WORDS.column.held, at.held, HEAD_Y, C.dim, "right");
    if (view.mine !== null) pen.txt(WORDS.column.mine, at.mine, HEAD_Y, C.dim, "right");
    view.stocks.forEach((stock, index) => {
      const rect = rowRect(index);
      const y = ROW_Y + index * ROW_H;
      const on = index === selected;
      if (on) {
        pen.px(rect[0], rect[1], rect[2], rect[3] - 1, C.btn);
        pen.px(rect[0], rect[1], 2, rect[3] - 1, C.amber);
      } else if (inRect(mouse, rect)) pen.px(rect[0], rect[1], rect[2], rect[3] - 1, C.btnH);
      pen.txt(WORDS.short[stock.id], NAME_X, y, on ? C.amber : C.bone);
      if (stock.price === null) {
        // a secret keeps it off the monitor
        pen.txt(WORDS.veiled, at.price, y, C.dim, "right");
        for (const column of [at.bought, at.sold, at.held]) pen.txt(WORDS.veiledShort, column, y, C.dim, "right");
      } else {
        const words = figure(stock.price, priceRoom());
        const way = stock.change === null || stock.change === 0 ? null : stock.change > 0 ? "up" : "down";
        const colour = way === null ? C.bone : WORDS.colour[way];
        pen.txt(words, at.price, y, colour, "right");
        if (way !== null) pen.bmp(way === "up" ? ARROW_UP : ARROW_DOWN, at.price - pen.width(words) - ARROW_ROOM, y + 5, colour);
        const count = (n: number | null, from: number, to: number): void => pen.txt(figure(n ?? 0, to - from - COLUMN_GAP), to, y, n === null || n === 0 ? C.dim : C.bone, "right");
        count(stock.bought, at.price, at.bought);
        count(stock.sold, at.bought, at.sold);
        count(stock.held, at.sold, at.held);
      }
      if (view.mine !== null) {
        const held = view.mine.shares[stock.id];
        pen.txt(held === 0 ? "-" : figure(held, at.mine - at.held - COLUMN_GAP), at.mine, y, held === 0 ? C.dim : C.amber, "right");
      }
    });
  }

  function drawCharts(): void {
    if (latest === null) return;
    const view = latest.view;
    view.stocks.forEach((stock, index) => {
      const rect = cellRect(index);
      const on = index === selected;
      frame(rect, on ? C.amberD : inRect(mouse, rect) ? C.steelD : C.steelDD);
      pen.txt(pen.fit(WORDS.short[stock.id], rect[2] - 6), rect[0] + 3, rect[1] + 1, on ? C.amber : C.bone);
      drawChart(stock, [rect[0] + 3, rect[1] + 16, rect[2] - 6, rect[3] - 19]);
    });
    // in the last place, the emblem the game wears, as large as a chart
    const rect = cellRect(STOCKS.length);
    frame(rect, C.steelDD);
    pen.txt(pen.fit(WORDS.emblem, rect[2] - 6), rect[0] + 3, rect[1] + 1, C.brass);
    drawEmblem([rect[0] + 4, rect[1] + 18, rect[2] - 8, rect[3] - 23], C.brass);
  }

  /**
   * A word of a rule that is not open, at the place it will be read at: a
   * square for each letter of a run, set evenly over the room they take, and
   * a low mark for a comma or a stop. The room sends the shape and nothing
   * of what the word says.
   */
  function drawHidden(shape: HiddenWord, x: number, y: number): void {
    let left = x;
    for (const [squares, width] of shape) {
      if (squares === 0) pen.px(left, y + 9, Math.max(1, width - 1), 3, HIDDEN_WORD);
      for (let n = 0; n < squares; n++) {
        const at = left + Math.round((n * width) / squares);
        const w = left + Math.round(((n + 1) * width) / squares) - at - 1;
        pen.px(at, y + 1, w, 11, HIDDEN_WORD);
        // a square too narrow to be hollow stays solid
        if (w >= 3) pen.px(at + 1, y + 2, w - 2, 9, C.night);
      }
      left += width;
    }
  }

  /** The words of a rule, as far as they are open to this player: a word not open is a row of squares, one to a letter, and the next to be opened is a solid block. */
  function drawCard(card: readonly CardPiece[]): void {
    const words = wordsOf(lang, card, (text) => pen.width(text));
    const places = placeWords(words, CARD.width, CARD.gap);
    words.forEach((word, at) => {
      const x = CARD_X + places[at].x;
      const y = CARD_Y + places[at].line * CARD_PITCH;
      if (word.open) pen.txt(word.text, x, y, C.bone);
      else if (word.next) pen.px(x, y + 1, word.width, 11, NEXT_WORD);
      else drawHidden(word.shape, x, y);
    });
  }

  function drawDetail(): void {
    if (latest === null) return;
    const stock = chosen();
    if (stock === undefined) return;
    pen.px(4, DETAIL_Y - 1, SCENE_W - 8, 1, C.steelDD);
    pen.txt(WORDS.name[stock.id], CARD_X, DETAIL_Y + 2, C.amber);
    const own = latest.view.mine;
    const held = own?.shares[stock.id] ?? 0;
    // beside the name: the price where the table does not have it whole, what the player holds, and what that is worth
    const beside: string[] = [];
    if (stock.price === null) {
      if (charts) beside.push(WORDS.veiled);
    } else if (charts || !priceWhole(stock.price)) beside.push(WORDS.won(stock.price));
    if (held > 0) {
      beside.push(WORDS.position(WORDS.shares(held)));
      if (stock.price !== null) beside.push(WORDS.won(held * stock.price));
    }
    // as much of it as there is room for, the first things first
    const room = SCENE_W - 16 - pen.width(WORDS.name[stock.id]);
    while (beside.length > 1 && pen.width(beside.join(" · ")) > room) beside.pop();
    if (beside.length > 0) pen.txt(pen.fit(beside.join(" · "), room), SCENE_W - 6, DETAIL_Y + 2, C.boneD, "right");
    drawCard(stock.card[lang]);
  }

  function drawScene(): void {
    if (latest === null) return;
    pen.px(0, 0, SCENE_W, BAR_Y, C.night);
    for (let y = 9; y < BAR_Y; y += 17) pen.px(0, y, SCENE_W, 1, C.wallD);
    // the emblem the exchange wears in this game
    pen.px(EMBLEM.x, EMBLEM.y, EMBLEM.w, EMBLEM.h, C.steelDD);
    pen.px(EMBLEM.x + 1, EMBLEM.y + 1, EMBLEM.w - 2, EMBLEM.h - 2, C.ink);
    drawEmblem([EMBLEM.x + 3, EMBLEM.y + 3, EMBLEM.w - 6, EMBLEM.h - 6], C.brass);
    // the switch between the table and the charts
    const lit = inRect(mouse, VIEW_RECT);
    frame(VIEW_RECT, lit ? C.steel : C.steelDD);
    pen.txt(pen.fit(charts ? WORDS.button.table : WORDS.button.charts, VIEW_RECT[2] - 4), VIEW_RECT[0] + Math.round(VIEW_RECT[2] / 2), VIEW_WORD_Y, lit ? C.bone : C.boneD, "center");
    if (charts) drawCharts();
    else drawTable();
    drawDetail();
    if (latest.frozen) {
      // the game's own clock stands still; this one runs, and ends the game at nought
      const stand = latest.clock.stand === null ? null : Math.max(0, latest.clock.stand - (performance.now() - receivedAt));
      plate(WORDS.waitingBack(stand === null ? null : Math.ceil(stand / 1000)), 84, C.boneD);
    }
  }

  /** The log, made from what has been shown so far. */
  function logLines(): [string, string][] {
    if (latest === null) return [];
    // which rules the game is played by comes first: it is settled before the first round
    const lines: [string, string][] = [[WORDS.log.rulebook[latest.view.rulebook], C.teal]];
    for (const event of latest.view.history.slice(0, seen)) {
      if (event.type === "round") lines.push([WORDS.log.round(event.round), C.dim]);
      else if (event.type === "opened") lines.push([WORDS.log.opened(event.stage, latest.rules.revealRounds.length), C.amber]);
      else if (event.type === "hidden") lines.push([WORDS.log.hidden(WORDS.short[event.stock], event.round, event.until), C.crim]);
      else lines.push([WORDS.ended[event.reason], C.amber]);
    }
    return lines;
  }

  function drawPanel(): void {
    if (latest === null) return;
    const view = latest.view;
    const x = PANEL_X;
    pen.px(SCENE_W, 0, W - SCENE_W, BAR_Y, C.night);
    pen.px(SCENE_W, 0, 1, BAR_Y, C.steelDD);
    pen.txt(WORDS.round(view.round, view.rounds), x, 3, C.bone);
    const round = left(latest.clock.round);
    if (round !== null) pen.txt(clockOf(round), W - 5, 3, Math.ceil(round / 1000) <= HURRY_FROM ? C.crim : C.boneD, "right");
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
      // a place of two figures needs more room than one
      if (layout.crowded) pen.txt(`${each.rank}`, ex + 12, y, C.brass, "right");
      else pen.txt(`${each.rank}`, ex, y, C.brass);
      const nameX = ex + (layout.crowded ? 16 : 12);
      const words = each.assets === null ? WORDS.veiled : layout.crowded ? WORDS.wonShort(each.assets) : grouped(each.assets);
      const voice = info === undefined || info.bot || info.left ? "out" : handlers.voice(player);
      const done = each.done && view.phase === "trading";
      // a mark for whoever is done with the round: after the name, and where two share a row, with no room there, at the entry's edge
      const marks = (done && !layout.crowded ? 6 : 0) + (voice !== "out" ? VOICE_MARK_W + 2 : 0);
      const name = pen.fit(info?.nick ?? "", Math.min(NAME_WIDTH, right - nameX - pen.width(words) - (layout.crowded ? 2 : 3) - marks));
      pen.txt(name, nameX, y, gone ? C.dim : view.you === player ? C.amber : C.bone);
      let after = nameX + pen.width(name) + 2;
      if (done && layout.crowded) pen.px(ex - 3, y + 3, 2, 7, C.teal);
      else if (done) {
        pen.px(after, y + 5, 4, 4, C.teal);
        after += 6;
      }
      if (voice !== "out") drawVoiceMark(pen, after, y, voice, time);
      pen.txt(words, right, y, each.assets === null ? C.dim : C.boneD, "right");
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
    pen.txt(pen.fit(label, w - 4), x + Math.round(w / 2), y + Math.round((h - 13) / 2), lit ? C.amber : live ? C.bone : C.dim, "center");
  }

  /** What the player has, as the first line of the bar says it. */
  function wallet(): string {
    const own = mine();
    if (own === null) return "";
    const money = (amount: number | null): string => (amount === null ? WORDS.veiled : WORDS.won(amount));
    return WORDS.wallet(money(own.cash), money(own.assets), own.pieces, own.secret);
  }

  /** The words for where the game stands, and their colour. */
  function standing(): [string, string] {
    if (latest === null) return ["", C.boneD];
    const view = latest.view;
    const stock = chosen();
    const name = stock === undefined ? "" : WORDS.short[stock.id];
    // what the bar is asking, over the buttons that answer it, comes before anything it was saying
    if (atWork() && sent === null) {
      if (mode === "secret") return [WORDS.standing.askSecret(name, latest.rules.secretRounds), C.amber];
      if (mode === "piece") return [WORDS.standing.askPiece(name, WORDS.won(latest.rules.pieceCash)), C.amber];
      if (mode === "done") return [WORDS.standing.askDone, C.amber];
    }
    // what was asked of the room is on its way: said at once, over whatever the last move left written
    // (a move drawn ahead has been said already: its own words stand)
    // (and where a press came in that time, that it was not counted: until the move is back, or a moment longer)
    if (hurriedAt !== null && !offline && (sent !== null || time - hurriedAt < HURRIED_SHOWN)) return [WORDS.say.wait, C.amber];
    if (sent !== null && ahead === null && !offline) return [WORDS.standing.sending, C.boneD];
    if (noteT > 0) return [note, C.amber];
    if (offline) return [WORDS.standing.offline, C.crim];
    if (view.phase === "ended") return [WORDS.standing.over, C.amber];
    if (latest.frozen) return [WORDS.standing.paused, C.boneD];
    const done = view.standings.filter((each) => each.done).length;
    if (view.mine === null) return [WORDS.standing.watching(done, view.standings.length), C.bone];
    if (view.mine.done) return [WORDS.standing.done(done, view.standings.length), C.teal];
    // a first game, with nothing bought yet: what is held is what everyone starts with, so the line can say what the game is
    if (handlers.first && untouched()) return [WORDS.coach.start, C.amber];
    return [wallet(), C.bone];
  }

  /** Whether the player still holds exactly what the game began with, in its first round: all of the starting money and no share. */
  function untouched(): boolean {
    const own = mine();
    if (latest === null || own === null) return false;
    return latest.view.round === 1 && own.cash === latest.rules.startCash && STOCKS.every((stock) => own.shares[stock] === 0);
  }

  /** What this player came out of the game with, in the word the results lead with; `null` while it is being played, and for someone who watched. */
  function verdict(): string | null {
    if (latest === null || latest.view.phase !== "ended") return null;
    const view = latest.view;
    const own = view.standings.find((each) => each.player === view.you);
    return own === undefined ? null : WORDS.result.verdict(true, own.rank);
  }

  function drawResults(): void {
    if (latest === null) return;
    const view = latest.view;
    const own = view.standings.find((each) => each.player === view.you);
    pen.txt(WORDS.result.verdict(own !== undefined, own?.rank ?? 0), 10, 234, own === undefined ? C.bone : own.rank === 1 ? C.teal : C.bone, "left", 24);
    // the first three by name, as many of them as fit whole; the list beside the table has everyone
    let places = "";
    for (const each of view.standings.slice(0, PLACES_SHOWN)) {
      const one = WORDS.result.place(each.rank, pen.fit(nickOf(each.player), 56), grouped(each.assets ?? 0));
      const longer = places === "" ? one : `${places} · ${one}`;
      if (pen.width(longer) > RESULT_WIDTH) break;
      places = longer;
    }
    pen.txt(places, 96, 226, C.bone);
    const end = view.history.at(-1);
    if (own === undefined || own.assets === null) pen.txt(end?.type === "ended" ? WORDS.ended[end.reason] : "", 96, 240, C.boneD);
    else {
      // what the show gives for assets like these: pieces, and its prize token
      const assets = own.assets;
      const pieces = latest.rules.awards.filter((from) => assets >= from).length;
      const award = [pieces > 0 ? WORDS.result.award(pieces) : "", assets >= latest.rules.prizeAssets ? WORDS.result.prize : ""].filter((each) => each !== "").join(" · ");
      const mine = WORDS.result.mine(WORDS.won(assets));
      // where both do not fit, what was won is said alone: the assets are in the list beside the table
      const whole = award === "" ? mine : `${mine} · ${WORDS.result.won(award)}`;
      pen.txt(pen.fit(pen.width(whole) <= RESULT_WIDTH ? whole : WORDS.result.won(award), RESULT_WIDTH), 96, 240, award === "" ? C.boneD : C.brass);
    }
    if (noteT > 0) pen.txt(note, 96, 254, C.amber);
    else pen.txt(starting ? WORDS.standing.sending : host ? WORDS.result.hostNext : handlers.out() ? WORDS.result.waitHostOut : WORDS.result.waitHost, 96, 254, C.boneD);
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
    const [words, colour] = standing();
    pen.txt(pen.fit(words, W - 12), 6, 225, colour);
    const own = view.mine;
    const stock = chosen();
    if (own === null) {
      // someone watching has nothing to trade with: where the buttons would be, what the game is and what its players are doing
      pen.txt(pen.fit(WORDS.sheet.brief.goal, W - 12), 6, 240, C.boneD);
      pen.txt(pen.fit(WORDS.sheet.brief.play, W - 12), 6, 254, C.boneD);
      return;
    }
    if (stock === undefined) return;
    const live = atWork() && sent === null;
    if (mode === "piece" && live) {
      button(THIRD_RECT, WORDS.button.peek, false, true);
      button(SECOND_RECT, WORDS.button.cash, false, true);
      button(LAST_RECT, WORDS.button.cancel, false, true);
      return;
    }
    if (mode !== "trade" && live) {
      button(SECOND_RECT, mode === "secret" ? WORDS.button.use : WORDS.button.finish, true, true);
      button(LAST_RECT, WORDS.button.cancel, false, true);
      return;
    }
    const [x, y, w, h] = pad ? FIGURES_RECT : SHARES_RECT;
    pen.px(x, y, w, h, live ? C.amberD : C.steelDD);
    pen.px(x + 1, y + 1, w - 2, h - 2, C.ink);
    // with its thousands apart where that fits, and as it was typed where it does not
    const entered = typed === "" ? "" : pen.width(grouped(shares())) <= w - 6 ? grouped(shares()) : `${shares()}`;
    pen.txt(entered, x + w - 4, y + 8, live ? C.bone : C.dim, "right");
    // a mark where the next figure goes, while nothing is entered
    if (live && typed === "" && Math.sin(time * 6) > 0) pen.px(x + w - 6, y + 8, 2, 12, C.amber);
    if (pad) {
      // the figures, the one that takes a figure back, and the one that puts the pad away with the number as it stands
      PAD_CODES.forEach((code, index) => {
        const label = code === "Backspace" ? WORDS.button.erase : code === "Enter" ? WORDS.button.enter : code.slice(-1);
        button(padRect(index), label, code === "Enter", live);
      });
      return;
    }
    button(MINUS_RECT, "-", false, live);
    button(PLUS_RECT, "+", false, live);
    button(MAX_RECT, WORDS.button.max, false, live && mostBought() !== null);
    button(ALL_RECT, WORDS.button.all, false, live && own.shares[stock.id] > 0);
    button(BUY_RECT, WORDS.button.buy, false, live);
    button(SELL_RECT, WORDS.button.sell, false, live && own.shares[stock.id] > 0);
    button(SECRET_RECT, WORDS.button.secret, false, live && own.secret);
    button(PIECE_RECT, WORDS.button.piece, false, live && own.pieces > 0 && view.round <= latest.rules.pieceRounds);
    button(DONE_RECT, WORDS.button.done, false, live);
  }

  function drawHelp(): void {
    if (latest === null) return;
    const rules = latest.rules;
    const lines = WORDS.help({
      stocks: STOCKS.length,
      rounds: rules.rounds,
      roundMinutes: Math.round(rules.roundSeconds / 60),
      startCash: rules.startCash,
      startPrice: rules.startPrice,
      floorPrice: rules.floorPrice,
      revealRounds: rules.revealRounds,
      secretRounds: rules.secretRounds,
      pieceCash: rules.pieceCash,
      pieceRounds: rules.pieceRounds,
      rulebook: latest.view.rulebook,
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
    // a key held down is one press, but for the arrows that step through the stocks and the shares
    if (!event.repeat || event.code.startsWith("Arrow")) keys.push(event.code);
    if (event.code === "Space" || event.code === "Backspace" || event.code.startsWith("Arrow")) event.preventDefault();
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
  void document.fonts?.load("12px Galmuri11");

  return {
    update,
    verdict,
    refused(reason: string): void {
      starting = false;
      sent = null;
      takeBack();
      mode = "trade";
      say(WORDS.refused[reason] ?? WORDS.refusedOther);
      sfx.deny();
    },
    lost(): void {
      starting = false;
      sent = null;
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
