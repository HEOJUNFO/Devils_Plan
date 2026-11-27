/**
 * The screen of 비밀 코드: the 26 cards, the conditions of the round, the
 * four cards picked, the buzzer, and how everyone stands.
 *
 * Design: design/games/secret-code.md. The room decides everything; this
 * screen shows what it sends and asks it to take an answer. The round's code
 * is not sent until the round is over, so nothing hidden is here to be
 * drawn. Which cards are picked is this screen's own until the buzzer is
 * pressed. Everything can be done with the pointer; the keys are another
 * way to the same.
 */
import { letterOf, numberOf, type CodeEvent, type NobodyWhy } from "../../../shared/games/secret-code/rules";
import { hits, type Box, type Press, type Reach } from "../../../shared/frame";
import type { ServerMessage } from "../../../shared/protocol";
import type { VoiceMark } from "../../../shared/voice";
import { codeWaits } from "../../../shared/waits";
import { BAR_Y, H, PANEL_X, Pen, SCENE_W, VOICE_MARK_W, W, drawSpeech, drawVoiceMark, speechLines, speechSeconds } from "../../game/draw";
import { C } from "../../game/palette";
import { pixelFont } from "../../game/pixel-font";
import { AGAIN_REACH, LOBBY_REACH, RESULTS_PRESS_HOLD, watchPointer } from "../../game/pointer";
import { isMuted, setMuted, sfx, startAudio } from "../../game/sound";
import { TOUCH } from "../../touch";
import { WORDS as PAGE } from "../../words";
import { LOG_PITCH, PANEL_WIDTH, entryAt, isCrowded, panelLayout } from "../panel";
import { WORDS } from "./words";

/** What the room sends about a game of 비밀 코드. */
export type CodeMessage = Extract<ServerMessage, { type: "game"; game: "secret-code" }>;

/** What the screen asks of whoever owns the connection. */
export interface CodeHandlers {
  /** The player pressed the buzzer with four cards. Returns whether it could be sent. */
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
export interface CodeScreen {
  update(message: CodeMessage): void;
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
/** The cards: thirteen to a row under the page's own buttons, each this wide and this high, a pixel between them. */
const CARDS_X = 3;
const CARDS_Y = 32;
const CARD_COLUMNS = 13;
const CARD_W = 23;
const CARD_H = 29;
/** The conditions, under the cards: where the list begins, how wide a line may be, and how far a line is from the next. */
const LIST_X = 6;
const LIST_Y = 97;
const LIST_WIDTH = 292;
const LIST_PITCH = 13;
const LIST_ROWS = 9;
/** The buzzer, at the right of the bar; the lines of the bar end before it. */
const BUZZ_RECT: Box = [376, 238, 100, 28];
const BAR_TEXT = 364;
/** A card's face and its edge. */
const CARD = "#262b40";
const CARD_EDGE = "#3d4460";
/** The four colours a card's suit is drawn in, by their places in the room's list. The show names two of its colours, green and pink; the others are this screen's. */
const COLOURS = ["#57c27a", "#f078b4", "#5aa0f0", "#f0d050"];
/** The four suits, each as nine rows of nine pixels. The show names two of its suits, the circle and the star; the others are this screen's. */
const SUITS: string[][] = [
  ["..#####..", ".#######.", "#########", "#########", "#########", "#########", "#########", ".#######.", "..#####.."],
  ["....#....", "....#....", "...###...", "#########", ".#######.", "..#####..", ".###.###.", ".##...##.", "#.......#"],
  ["....#....", "....#....", "...###...", "...###...", "..#####..", "..#####..", ".#######.", ".#######.", "#########"],
  [".........", ".#######.", ".#######.", ".#######.", ".#######.", ".#######.", ".#######.", ".#######.", "........."],
];
/** The widest a name is drawn in the list of players, and the least of it a line of the log keeps, in pixels. */
const NAME_WIDTH = 76;
const LOG_NAME = 24;
/** With this many seconds or fewer left, the clock turns red, and a player who can still answer hears each of them ticked. */
const HURRY_FROM = 10;
/** Seconds the results are on show before Enter starts another game: the host may have been pressing Enter for the buzzer. */
const RESULTS_HOLD = 1.5;
/** How wide the lines of the results may be, beside the verdict and before the buttons. */
const RESULT_WIDTH = 280;

/** The buttons of the results. */
const AGAIN_RECT: Box = [386, 225, 90, 15];
const LOBBY_RECT: Box = [386, 250, 90, 15];

const inRect = (p: { x: number; y: number }, r: Box): boolean => p.x >= r[0] && p.x < r[0] + r[2] && p.y >= r[1] && p.y < r[1] + r[3];

/** `ms` as minutes and seconds, a part of a second counted as a whole one. */
function clockOf(ms: number): string {
  const all = Math.ceil(ms / 1000);
  return `${Math.floor(all / 60)}:${`${all % 60}`.padStart(2, "0")}`;
}

/** Makes `canvas` the game screen. Nothing is drawn until the first {@link CodeScreen.update}. */
export function createCodeScreen(canvas: HTMLCanvasElement, handlers: CodeHandlers): CodeScreen {
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2D drawing in this browser");
  const ctx: CanvasRenderingContext2D = context;
  const pen = new Pen(ctx);

  let latest: CodeMessage | null = null;
  /** When the latest message arrived, by the browser's own clock in ms: the room's clocks are counted from here in real time. */
  let receivedAt = 0;
  /** Seconds since the screen was made; drives what moves on it. */
  let time = 0;
  /** How many of the game's events have been shown. */
  let seen = 0;
  /** The last second of the player's own time that was ticked aloud. */
  let ticked = -1;
  /** The cards picked, in the order they were. */
  let picked: number[] = [];
  /** The round the picks are for: a new round begins with none. */
  let pickedIn = 0;
  /** The host has asked for the next game and the room has not answered yet. */
  let starting = false;
  /** The connection to the room is down; the next thing the room sends says it is back. */
  let offline = false;
  let host = false;
  let help = false;
  let note = "";
  let noteT = 0;
  /** The card the keys are at, and whether the keys have been used to move it: only then is it drawn. */
  let cursor = 0;
  let keyed = false;
  /** `time` when the game on show was first seen to be over. */
  let endedAt = 0;
  /** By player: a chat line beside their name. */
  const speech = new Map<number, { lines: string[]; t: number }>();

  /** What was pressed since the last step, in the order it was: a key's code, or `Click:` and which of `clicks` it is. */
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
  const standingOf = (player: number | null) => latest?.view.seats.find((each) => each.player === player);
  /** Whether this player can answer now: a round is played, and they are neither safe nor wrong in it. */
  function playing(): boolean {
    if (latest === null || latest.frozen || latest.view.phase !== "round" || latest.view.you === null) return false;
    const mine = standingOf(latest.view.you);
    return mine !== undefined && mine.safe === null && !mine.wrong && !mine.left;
  }
  /** The letters of `code`, with a space between them. */
  const lettersOf = (code: readonly number[]): string => code.map(letterOf).join(" ");
  /** The cards picked as a code: their letters in the order of the alphabet, and a line for each still to pick. */
  function pickedWord(): string {
    const length = latest?.rules.codeLength ?? 4;
    const letters = [...picked].sort((a, b) => a - b).map(letterOf);
    return [...letters, ...Array.from({ length: Math.max(0, length - letters.length) }, () => "_")].join(" ");
  }
  /** How the round on show ended, where it has: who was right, or why nobody was. */
  function outcome(): { who: number | null; why: NobodyWhy | null } {
    for (const event of [...(latest?.view.history ?? [])].reverse()) {
      if (event.type === "passed") return { who: event.player, why: null };
      if (event.type === "nobody") return { who: null, why: event.why };
      if (event.type === "round") break;
    }
    return { who: null, why: null };
  }

  // ---- Where things are -------------------------------------------------------------------------------
  /** The box of card `card`. */
  const cardRect = (card: number): Box => [CARDS_X + (card % CARD_COLUMNS) * CARD_W, CARDS_Y + Math.floor(card / CARD_COLUMNS) * (CARD_H + 1), CARD_W - 1, CARD_H];
  /** The card a press at (`x`, `y`) is on; `null` off the cards. */
  function cardAt(x: number, y: number): number | null {
    const count = latest?.view.cards.length ?? 0;
    for (let card = 0; card < count; card++) if (inRect({ x, y }, cardRect(card))) return card;
    return null;
  }

  function say(text: string): void {
    note = text;
    noteT = 2.5;
  }

  function deny(text: string): void {
    say(text);
    sfx.deny();
  }

  /** Shows one thing that happened: a sound, and a word in the bar. */
  function show(event: CodeEvent): void {
    const mine = me();
    if (event.type === "passed") {
      if (event.player === mine) sfx.win();
      else {
        say(WORDS.say.passedOther(pen.fit(nickOf(event.player), 120), lettersOf(event.code)));
        sfx.alarm();
      }
    } else if (event.type === "wrong") {
      if (event.player === mine) {
        deny(WORDS.say.wrongMine(lettersOf(event.code)));
        noteT = 4;
      } else say(WORDS.say.wrongOther(pen.fit(nickOf(event.player), 120), lettersOf(event.code)));
    } else if (event.type === "left") {
      say(WORDS.say.leftOther(pen.fit(nickOf(event.player), 120)));
      sfx.back();
    } else if (event.type === "round" || event.type === "nobody" || event.type === "ended") {
      sfx.turn();
    }
  }

  /** Asks the room for the next game, once: a press made again before the room answers is the same press. */
  function askAgain(): void {
    if (starting) return;
    starting = handlers.again();
    if (!starting) say(WORDS.notSent);
  }

  function update(message: CodeMessage): void {
    // the next game has begun: what was asked for is here
    if (message.view.phase !== "ended") starting = false;
    const fresh = latest === null || latest.startedAt !== message.startedAt;
    if (fresh) {
      // a game met part-way is shown as it stands; only what happens from here on is played out
      seen = message.view.events;
      speech.clear();
      keyed = false;
      cursor = 0;
      picked = [];
      pickedIn = message.view.round;
      if (latest !== null) sfx.turn();
    }
    if (message.view.phase === "ended" && (fresh || latest?.view.phase !== "ended")) endedAt = time;
    // a new round begins with no card picked
    if (message.view.round !== pickedIn) {
      picked = [];
      pickedIn = message.view.round;
    }
    latest = message;
    receivedAt = performance.now();
    offline = false;
    handlers.crowded(isCrowded(message.players.length));
  }

  // ---- Input -----------------------------------------------------------------------------------------
  /** Picks card `card`, or drops it where it is picked. */
  function pick(card: number): void {
    if (picked.includes(card)) {
      picked = picked.filter((each) => each !== card);
      sfx.back();
      return;
    }
    if (picked.length >= (latest?.rules.codeLength ?? 4)) return deny(WORDS.refused.full);
    picked = [...picked, card];
    sfx.pick();
  }

  /** The buzzer: the four cards picked are the answer. */
  function buzz(): void {
    if (picked.length !== (latest?.rules.codeLength ?? 4)) return deny(WORDS.refused["bad-code"]);
    if (!handlers.act({ type: "answer", code: [...picked].sort((a, b) => a - b) })) say(WORDS.notSent);
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
    if (!playing()) return;

    const count = view.cards.length;
    for (const code of keys) {
      if (code.startsWith("Click:")) {
        const p = clicks[Number(code.slice(6))];
        if (p === undefined) continue;
        keyed = false;
        if (hits(p, BUZZ_RECT)) buzz();
        else {
          const card = cardAt(p.x, p.y);
          if (card !== null) {
            cursor = card;
            pick(card);
          }
        }
        continue;
      }
      if (code === "ArrowLeft" && cursor > 0) cursor -= 1;
      else if (code === "ArrowRight" && cursor < count - 1) cursor += 1;
      else if (code === "ArrowUp" && cursor >= CARD_COLUMNS) cursor -= CARD_COLUMNS;
      else if (code === "ArrowDown" && cursor + CARD_COLUMNS < count) cursor += CARD_COLUMNS;
      else if (code === "Space") pick(cursor);
      else if (code === "Enter" || code === "NumpadEnter") buzz();
      else if (code === "Backspace" || code === "Delete") {
        if (picked.length > 0) {
          picked = picked.slice(0, -1);
          sfx.back();
        }
      } else if (!code.startsWith("Arrow")) continue;
      keyed = true;
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
      const view = latest.view;
      const fresh = Math.min(view.events - seen, view.history.length);
      seen = view.events;
      for (const event of fresh > 0 ? view.history.slice(-fresh) : []) show(event);
      // the round's time is nearly up: a tick a second
      const mine = playing() ? left(latest.clock.turn) : null;
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

  /** The edge of the box at (`x`, `y`), `w` by `h`, a pixel thick. */
  function frame(x: number, y: number, w: number, h: number, colour: string): void {
    pen.px(x, y, w, 1, colour);
    pen.px(x, y + h - 1, w, 1, colour);
    pen.px(x, y, 1, h, colour);
    pen.px(x + w - 1, y, 1, h, colour);
  }

  /** Card `card`: its letter with its suit beside it in its colour, and its number under them. `how` says whether it is picked, part of the code on show, or neither. */
  function drawCard(card: number, how: "plain" | "picked" | "code"): void {
    if (latest === null) return;
    const [x, y, w, h] = cardRect(card);
    const face = latest.view.cards[card];
    pen.px(x, y, w, h, how === "picked" ? C.amber : how === "code" ? C.teal : CARD_EDGE);
    pen.px(x + 1, y + 1, w - 2, h - 2, how === "picked" ? "#3a2a12" : how === "code" ? "#173a36" : CARD);
    pen.txt(letterOf(card), x + 2, y + 1, C.bone);
    pen.txt(`${numberOf(card)}`, x + Math.round(w / 2), y + 14, C.boneD, "center");
    const rows = SUITS[face.suit % SUITS.length];
    const [sx, sy] = [x + w - 11, y + 3];
    rows.forEach((row, dy) => {
      // each row of a suit is one run of pixels, or two for the legs of the star
      let from = -1;
      for (let dx = 0; dx <= row.length; dx++) {
        const on = row[dx] === "#";
        if (on && from < 0) from = dx;
        if (!on && from >= 0) {
          pen.px(sx + from, sy + dy, dx - from, 1, COLOURS[face.color % COLOURS.length]);
          from = -1;
        }
      }
    });
  }

  /** `text` in lines no wider than `width`, broken at its spaces. */
  function wrapped(text: string, width: number): string[] {
    const lines: string[] = [];
    let line = "";
    for (const word of text.split(" ")) {
      const longer = line === "" ? word : `${line} ${word}`;
      if (line !== "" && pen.width(longer) > width) {
        lines.push(line);
        line = word;
      } else line = longer;
    }
    if (line !== "") lines.push(line);
    return lines;
  }

  function drawScene(): void {
    if (latest === null) return;
    const view = latest.view;
    pen.px(0, 0, SCENE_W, BAR_Y, C.night);
    const shown = view.code ?? [];
    for (let card = 0; card < view.cards.length; card++) drawCard(card, shown.includes(card) ? "code" : view.phase === "round" && picked.includes(card) ? "picked" : "plain");
    if (playing()) {
      const over = keyed ? cursor : mouse.x >= 0 ? cardAt(mouse.x, mouse.y) : null;
      if (over !== null) {
        const [x, y, w, h] = cardRect(over);
        frame(x, y, w, h, C.bone);
      }
    }
    // the conditions, numbered, a long one on two lines
    const kinds = Math.max(...view.cards.map((card) => Math.max(card.color, card.suit))) + 1;
    let row = 0;
    view.conditions.forEach((condition, index) => {
      const lines = wrapped(WORDS.condition(condition, kinds), LIST_WIDTH - 14);
      lines.forEach((line, nth) => {
        if (row >= LIST_ROWS) return;
        if (nth === 0) pen.txt(`${index + 1}.`, LIST_X, LIST_Y + row * LIST_PITCH, C.amber);
        pen.txt(pen.fit(line, LIST_WIDTH - 14), LIST_X + 14, LIST_Y + row * LIST_PITCH, C.bone);
        row += 1;
      });
    });
    if (latest.frozen && view.phase !== "ended") {
      // the game's own clock stands still; this one runs, and ends the game at nought
      const stand = latest.clock.stand === null ? null : Math.max(0, latest.clock.stand - (performance.now() - receivedAt));
      plate(WORDS.waitingBack(stand === null ? null : Math.ceil(stand / 1000)), 140, C.boneD);
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
    if (view.phase === "show") {
      const { who, why } = outcome();
      return [WORDS.standing.shown(lettersOf(view.code ?? []), who === null ? null : pen.fit(nickOf(who), 120), why), C.teal];
    }
    const ms = left(latest.clock.turn);
    const clock = ms === null ? "" : clockOf(ms);
    if (view.you === null) return [WORDS.standing.watching(clock), C.bone];
    const mine = standingOf(view.you);
    if (mine?.safe != null) return [WORDS.standing.safe(view.passed.indexOf(view.you) + 1, clock), C.teal];
    if (mine?.wrong === true) return [WORDS.standing.locked(clock), C.crim];
    return [WORDS.standing.play(pickedWord(), clock), C.amber];
  }

  /** The players in the order they are listed: by their places once the game is played to its end; before that those who passed first, then by their numbers. */
  function listed(): number[] {
    if (latest === null) return [];
    const view = latest.view;
    if (view.places !== null) return view.places.map((each) => each.player);
    return [...view.passed, ...view.players.filter((player) => !view.passed.includes(player))];
  }

  function drawPanel(): void {
    if (latest === null) return;
    const view = latest.view;
    const x = PANEL_X;
    const mine = me();
    pen.px(SCENE_W, 0, W - SCENE_W, BAR_Y, C.night);
    pen.px(SCENE_W, 0, 1, BAR_Y, C.steelDD);
    pen.txt(WORDS.heading(view.round, view.rounds), x, 3, C.bone);
    const turn = left(latest.clock.turn);
    if (turn !== null) pen.txt(clockOf(turn), W - 5, 3, Math.ceil(turn / 1000) <= HURRY_FROM ? C.crim : C.boneD, "right");
    const players = listed();
    const layout = panelLayout(players.length);
    if (!layout.crowded) pen.px(x, 16, PANEL_WIDTH, 1, C.steelDD);
    players.forEach((player, at) => {
      const { dx, y } = entryAt(layout, at);
      const ex = x + dx;
      let right = ex + layout.entryWidth - 1;
      const info = latest!.players.find((one) => one.id === player);
      const gone = info !== undefined && (info.left || !info.connected);
      const stands = standingOf(player);
      const status = stands === undefined ? "" : stands.safe !== null ? WORDS.status.safe(view.passed.indexOf(player) + 1) : stands.left ? WORDS.status.left : view.places !== null ? WORDS.status.failed : stands.wrong ? WORDS.status.wrong : "";
      // who can still answer in this round
      if (view.phase === "round" && stands !== undefined && stands.safe === null && !stands.left && !stands.wrong) pen.px(ex - 3, y + 2, 2, 9, C.amber);
      pen.txt(status, right, y, stands?.safe != null ? C.teal : stands?.wrong === true && view.places === null ? C.crim : C.dim, "right");
      right -= pen.width(status) + 4;
      const voice = info === undefined || info.bot || info.left ? "out" : handlers.voice(player);
      const room = right - ex - (voice !== "out" ? VOICE_MARK_W + 2 : 0);
      const name = pen.fit(info?.nick ?? "", Math.min(NAME_WIDTH, room));
      pen.txt(name, ex, y, gone ? C.dim : mine === player ? C.amber : C.bone);
      if (voice !== "out") drawVoiceMark(pen, ex + pen.width(name) + 2, y, voice, time);
    });
    pen.px(x, 86, PANEL_WIDTH, 1, C.steelDD);
    // the log: the latest of what happened
    const rows: [string, string][] = [];
    /** A line that names `player`, the name cut so that the rest of the line is there to be read. */
    const named = (player: number, line: (who: string) => string): string => line(pen.fit(nickOf(player), Math.max(LOG_NAME, PANEL_WIDTH - pen.width(line("")))));
    for (const event of view.history) {
      if (event.type === "round") rows.push([WORDS.log.round(event.round), C.dim]);
      else if (event.type === "passed") rows.push([named(event.player, (who) => WORDS.log.passed(who, event.code.map(letterOf).join(""), event.place)), C.teal]);
      else if (event.type === "wrong") rows.push([named(event.player, (who) => WORDS.log.wrong(who, event.code.map(letterOf).join(""))), C.boneD]);
      else if (event.type === "nobody") rows.push([WORDS.log.nobody(event.code.map(letterOf).join(""), event.why), C.boneD]);
      else if (event.type === "left") rows.push([named(event.player, (who) => WORDS.log.left(who)), C.boneD]);
      else rows.push([WORDS.ended[event.reason], C.amber]);
    }
    const from = Math.max(0, rows.length - layout.logRows);
    for (let i = from; i < rows.length; i++) pen.txt(pen.fit(rows[i][0], PANEL_WIDTH), x, layout.logTop + (i - from) * LOG_PITCH, rows[i][1]);
    // a chat line beside its speaker's name, over the edge of the scene
    for (const [player, line] of speech) {
      const at = players.indexOf(player);
      if (at >= 0) drawSpeech(pen, { label: { x: SCENE_W, y: entryAt(layout, at).y, align: "left" } }, line.lines);
    }
  }

  /** What this player came out of the game with, in the word the results lead with: passed or failed; `null` while it is played, for someone who watched, and for a game cut short. */
  function verdict(): string | null {
    const mine = me();
    if (latest === null || latest.view.places === null || mine === null) return null;
    return standingOf(mine)?.safe != null ? WORDS.result.passed : WORDS.result.failed;
  }

  function drawResults(): void {
    if (latest === null) return;
    const view = latest.view;
    const own = verdict();
    const mine = standingOf(me());
    pen.txt(own ?? WORDS.result.over, 10, 234, own === WORDS.result.passed ? C.teal : C.bone, "left", 24);
    const first = view.passed[0];
    const named = view.places === null ? WORDS.ended[view.ended ?? "abandoned"] : first === undefined ? WORDS.result.nobody : WORDS.result.first(pen.fit(nickOf(first), 120));
    pen.txt(pen.fit(named, RESULT_WIDTH), 96, 226, C.bone);
    const how = mine === undefined ? "" : mine.safe !== null ? WORDS.result.place(view.passed.indexOf(mine.player) + 1, mine.safe) : WORDS.result.notPassed(mine.misses);
    pen.txt(pen.fit(how, RESULT_WIDTH), 96, 240, C.boneD);
    if (noteT > 0) pen.txt(pen.fit(note, RESULT_WIDTH), 96, 254, C.amber);
    else pen.txt(starting ? WORDS.result.sending : host ? WORDS.result.hostNext : handlers.out() ? WORDS.result.waitHostOut : WORDS.result.waitHost, 96, 254, C.boneD);
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
    const mine = playing();
    pen.txt(pen.fit(mine && !TOUCH ? WORDS.keys.play : idle, BAR_TEXT), 6, 240, C.dim);
    if (mine && !TOUCH) pen.txt(pen.fit(idle, BAR_TEXT), 6, 254, C.dim);
    if (mine) button(BUZZ_RECT, WORDS.button.buzz, picked.length === latest.rules.codeLength, true);
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
    if (!event.repeat || event.code.startsWith("Arrow")) keys.push(event.code);
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
      keys.push(`Click:${clicks.length - 1}`);
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
    // a game that stands still waits on no one
    waits: (): boolean => latest !== null && !latest.frozen && codeWaits(latest.view),
    refused(reason: string): void {
      starting = false;
      say(WORDS.refused[reason] ?? WORDS.refusedOther);
      sfx.deny();
    },
    lost(): void {
      starting = false;
      // whether what was sent reached the room is not known: the game the room sends on coming back will say
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
