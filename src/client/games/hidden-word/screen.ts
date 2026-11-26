/**
 * The screen of 히든 워드: an envelope to choose a hidden word from, the
 * clues of a setter with their scores, a box to type a clue or an answer in,
 * and the answers shown together.
 *
 * Design: design/games/hidden-word.md. The room decides everything; this
 * screen shows what it sends and asks it to take a word. No list of words
 * and no score is worked out here: a browser that had the list could find a
 * hidden word from one clue.
 *
 * A word is typed in a box of the page laid over the scene (a `<form>` with
 * an `<input>` and a submit button, put after the canvas and taken away
 * with the screen), because a canvas has no keyboard of a phone and no
 * Hangul composition. What is typed is read when the form is submitted, so
 * the Enter that ends a syllable being composed submits nothing. Everything
 * else can be done with the pointer; the keys are another way to the same.
 */
import type { Clue, HiddenEvent } from "../../../shared/games/hidden-word/rules";
import { hits, type Box, type Press, type Reach } from "../../../shared/frame";
import type { ServerMessage } from "../../../shared/protocol";
import type { VoiceMark } from "../../../shared/voice";
import { hiddenWaits } from "../../../shared/waits";
import { BAR_Y, H, PANEL_X, Pen, SCENE_W, VOICE_MARK_W, W, drawSpeech, drawVoiceMark, speechLines, speechSeconds } from "../../game/draw";
import { C } from "../../game/palette";
import { AGAIN_REACH, LOBBY_REACH, RESULTS_PRESS_HOLD, watchPointer } from "../../game/pointer";
import { isMuted, setMuted, sfx, startAudio } from "../../game/sound";
import { TOUCH } from "../../touch";
import { WORDS as PAGE } from "../../words";
import { LOG_PITCH, PANEL_WIDTH, entryAt, isCrowded, panelLayout } from "../panel";
import { WORDS } from "./words";

/** What the room sends about a game of 히든 워드. */
export type HiddenMessage = Extract<ServerMessage, { type: "game"; game: "hidden-word" }>;

/** What the screen asks of whoever owns the connection. */
export interface HiddenHandlers {
  /** The player asked something of the game. Returns whether it could be sent. */
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
export interface HiddenScreen {
  update(message: HiddenMessage): void;
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

/** What the box over the scene is for now: a clue, or an answer. */
type BoxUse = "clue" | "answer";

/** One step of the screen's clock, in seconds. */
const STEP = 1 / 60;
/** The line over the scene, right of the page's buttons. */
const TOP_Y = 16;
/** The two columns of the scene, under the page's own buttons, and how far apart their lines are. */
const LEFT_X = 14;
const LEFT_W = 136;
const RIGHT_X = 162;
const RIGHT_W = SCENE_W - RIGHT_X - 6;
const HEAD_Y = 34;
const ROWS_Y = 48;
const ROW = 13;
/** How many lines a column has, over the box a word is typed in. */
const ROWS = 10;
/** The words of the envelope, one under another. */
const CARD_W = 124;
const CARD_H = 20;
const CARD_PITCH = 24;
const cardBox = (index: number): Box => [LEFT_X, ROWS_Y + index * CARD_PITCH, CARD_W, CARD_H];
/** The widest a name is drawn in the list of players and in a line of the log, in pixels. */
const NAME_WIDTH = 86;
const LOG_NAME = 60;
/** With this many seconds or fewer left, the clock turns red, and a player the game is waiting on hears each of them ticked. */
const HURRY_FROM = 10;
/** With this many ms left to answer, what is written and not submitted is sent: time enough for it to reach the room. */
const SEND_BEFORE_MS = 1500;
/** Seconds the results are on show before Enter starts another game: the host may have been pressing Enter to submit. */
const RESULTS_HOLD = 1.5;
/** How wide the lines of the results may be, beside the verdict and before the buttons. */
const RESULT_WIDTH = 280;
/** The colour of what was right. */
const RIGHT = "#2fae78";

/** The buttons of the bar. */
const MAIN_RECT: Box = [364, 238, 112, 28];
const PIECE_RECT: Box = [232, 238, 128, 28];
const AGAIN_RECT: Box = [386, 225, 90, 15];
const LOBBY_RECT: Box = [386, 250, 90, 15];

const inRect = (p: { x: number; y: number }, r: Box): boolean => p.x >= r[0] && p.x < r[0] + r[2] && p.y >= r[1] && p.y < r[1] + r[3];

/** A clock that has `ms` left, as minutes and seconds. */
function clockOf(ms: number): string {
  const all = Math.ceil(ms / 1000);
  return `${Math.floor(all / 60)}:${`${all % 60}`.padStart(2, "0")}`;
}

/** What was typed as the room will read it: without spaces, composed the one way; `null` for what is no word of Hangul. */
function wordOf(typed: string, length: number): string | null {
  const word = typed.normalize("NFC").replace(/\s+/g, "");
  return word.length >= 1 && word.length <= length && /^[가-힣]+$/.test(word) ? word : null;
}

/** Makes `canvas` the game screen. Nothing is drawn until the first {@link HiddenScreen.update}. */
export function createHiddenScreen(canvas: HTMLCanvasElement, handlers: HiddenHandlers): HiddenScreen {
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2D drawing in this browser");
  const ctx: CanvasRenderingContext2D = context;
  const pen = new Pen(ctx);

  // ---- The box a word is typed in ---------------------------------------------------------------------
  const form = document.createElement("form");
  form.id = "word-form";
  form.hidden = true;
  form.noValidate = true;
  const label = document.createElement("label");
  label.htmlFor = "word-input";
  const row = document.createElement("div");
  const input = document.createElement("input");
  input.id = "word-input";
  input.type = "text";
  input.lang = "ko";
  input.autocomplete = "off";
  input.autocapitalize = "off";
  input.spellcheck = false;
  input.setAttribute("autocorrect", "off");
  input.enterKeyHint = "send";
  // (longer than any word the room takes: a syllable being composed is not cut off, and what is too long is said)
  input.maxLength = 24;
  const submit = document.createElement("button");
  submit.type = "submit";
  row.append(input, submit);
  form.append(label, row);
  canvas.after(form);

  let latest: HiddenMessage | null = null;
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
  /** The word of the envelope the player is at: the one a word is scored against, and the one Enter hides. */
  let picked: string | null = null;
  /** The answers written and not submitted yet, and whether a Piece is to buy the second. */
  let draft: string[] = [];
  let piece = false;
  /** What the box was last set up for. */
  let boxUse: BoxUse | null = null;
  let boxLabel = "";
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
  /** The words of the player's envelope that are still to be set. */
  const unused = (): string[] => latest?.view.hand?.words.filter((word) => !latest?.view.hand?.used.includes(word)) ?? [];
  /** Whether this player is choosing their hidden word. */
  function choosing(): boolean {
    if (latest === null || latest.frozen) return false;
    const view = latest.view;
    return view.phase === "choose" && view.hand !== null && view.hand.chosen === null;
  }
  /** Whether this player is the setter and is giving clues. */
  const cluing = (): boolean => latest !== null && !latest.frozen && latest.view.phase === "clue" && latest.view.setter === me() && me() !== null;
  /** Whether this player is writing an answer. */
  function answering(): boolean {
    if (latest === null || latest.frozen) return false;
    const view = latest.view;
    return view.phase === "answer" && view.you !== null && view.setter !== view.you && view.answer === null;
  }
  /** What the box is for now; `null` when there is nothing to type. */
  function boxNow(): BoxUse | null {
    if (latest === null || help || canvas.hidden) return null;
    if (cluing()) return "clue";
    return answering() ? "answer" : null;
  }
  /** How many Pieces this player has left, and whether one may be spent on this hidden word. */
  const piecesLeft = (): number => latest?.view.pieces.find((each) => each.player === me())?.left ?? 0;
  const mayPiece = (): boolean => piecesLeft() > 0 && !(latest?.view.pieced.includes(me() ?? -1) ?? true);
  /** The clues of the stage being played, and those of the stages before it. */
  const cluesNow = (): Clue[] => latest?.view.clues.filter((clue) => clue.stage === latest?.view.stage) ?? [];
  const cluesBefore = (): Clue[] => latest?.view.clues.filter((clue) => clue.stage !== latest?.view.stage) ?? [];

  function say(text: string): void {
    note = text;
    noteT = 2.5;
  }

  function deny(text: string): void {
    say(text);
    sfx.deny();
  }

  /** Shows one thing that happened: a sound, and a word in the bar. What this player did themselves was heard when they did it. */
  function show(event: HiddenEvent): void {
    const mine = me();
    if (event.type === "round") {
      if (event.round > 1) sfx.swap();
    } else if (event.type === "turn") {
      if (event.setter === mine) {
        say(WORDS.say.yourTurn);
        sfx.turn();
      } else sfx.swap();
    } else if (event.type === "clue") {
      if (event.setter !== mine || event.room) sfx.chip();
    } else if (event.type === "clues-over") {
      const threshold = latest?.rules.threshold ?? 0;
      if (mine !== null && event.setter !== mine) {
        say(WORDS.say.answerNow);
        sfx.turn();
      } else say(event.reason === "reached" ? WORDS.say.reached(threshold) : event.reason === "count" ? WORDS.say.count : WORDS.say.time);
    } else if (event.type === "answered") {
      if (event.player !== mine) sfx.chip();
    } else if (event.type === "scored") {
      sfx.pick();
    } else if (event.type === "ended") {
      const own = latest?.view.places?.find((each) => each.player === mine);
      if (own !== undefined && own.place === 1) sfx.win();
      else sfx.turn();
    }
  }

  /** Asks the room for the next game, once: a press made again before the room answers is the same press. */
  function askAgain(): void {
    if (starting) return;
    starting = handlers.again();
    if (!starting) say(WORDS.notSent);
  }

  function update(message: HiddenMessage): void {
    // the next game has begun: what was asked for is here
    if (message.view.phase !== "ended") starting = false;
    const fresh = latest === null || latest.startedAt !== message.startedAt;
    if (fresh) {
      // a game met part-way is shown as it stands; only what happens from here on is played out
      seen = message.view.events;
      speech.clear();
      if (latest !== null) sfx.turn();
    }
    if (message.view.phase === "ended" && (fresh || latest?.view.phase !== "ended")) endedAt = time;
    const before = latest?.view;
    const moved = before === undefined || before.phase !== message.view.phase || before.round !== message.view.round || before.setter !== message.view.setter || before.stage !== message.view.stage;
    // another step: what was written for the last is put away
    if (fresh || moved) {
      draft = [];
      piece = false;
      input.value = "";
      if (fresh || before?.round !== message.view.round) picked = null;
    }
    // the room marks the game it sends in answer to what this page asked; a game that has gone on waits for nothing
    if (message.answer === true || fresh || moved) pending = false;
    latest = message;
    receivedAt = performance.now();
    offline = false;
    handlers.crowded(isCrowded(message.players.length));
  }

  // ---- Input -----------------------------------------------------------------------------------------
  /** Asks the room for `action`. Returns whether it went. */
  function send(action: unknown): boolean {
    if (latest === null || pending) return false;
    pending = handlers.act(action);
    if (!pending) say(WORDS.notSent);
    return pending;
  }

  /** Hides the word of the envelope the player is at. */
  function choose(): void {
    if (picked === null) return deny(WORDS.say.pickFirst);
    if (send({ type: "choose", word: picked })) sfx.pick();
  }

  /** Submits the answers written. */
  function sendAnswer(): void {
    if (draft.length === 0) return deny(WORDS.say.writeFirst);
    if (send({ type: "answer", words: piece ? draft : draft.slice(0, 1) })) sfx.pick();
  }

  /** Spends a Piece on a second answer, or takes that back. */
  function togglePiece(): void {
    if (!piece && !mayPiece()) return deny(WORDS.refused[piecesLeft() > 0 ? "piece-used" : "no-pieces"]);
    piece = !piece;
    if (!piece) draft = draft.slice(0, 1);
    say(piece ? WORDS.say.pieceOn : WORDS.say.pieceOff);
    sfx.move();
  }

  /** The word in the box is entered: given as a clue, or written as an answer. With the box empty, what the Enter key does anyway. */
  function entered(): void {
    if (latest === null || boxUse === null) return;
    if (input.value.trim() === "") {
      if (boxUse === "answer" && draft.length > 0) sendAnswer();
      return;
    }
    const word = wordOf(input.value, latest.rules.wordLength);
    if (word === null) return deny(WORDS.say.notHangul);
    if (boxUse === "clue") {
      if (send({ type: "clue", word })) {
        input.value = "";
        sfx.pick();
      }
    } else {
      // one answer, or two for a Piece: a word more than there is room for takes the place of the last
      const room = piece ? 2 : 1;
      if (!draft.includes(word)) draft = [...draft.slice(0, room - 1), word];
      input.value = "";
      sfx.move();
    }
  }

  /** Sets the box up for what there is to type, or puts it away. */
  function setBox(): void {
    const use = boxNow();
    const text =
      use === "clue"
        ? WORDS.box.clue
        : use === "answer"
          ? piece && draft.length >= 1
            ? WORDS.box.answerSecond
            : WORDS.box.answer
          : "";
    if (text !== boxLabel) {
      boxLabel = text;
      label.textContent = text;
    }
    if (use === boxUse) return;
    const had = boxUse;
    boxUse = use;
    form.hidden = use === null;
    if (use === null) {
      // the keys are the game's again
      if (document.activeElement === input) input.blur();
      return;
    }
    submit.textContent = use === "clue" ? WORDS.box.doClue : WORDS.box.doAnswer;
    // with keys, the box is ready to type in unless the player is typing elsewhere (the chat); under a finger it
    // waits to be pressed, so that no keyboard comes up over the screen unasked
    const elsewhere = document.activeElement !== null && document.activeElement !== document.body && document.activeElement !== input;
    if (!TOUCH && had === null && !elsewhere) input.focus({ preventScroll: true });
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
    if (pending) return;
    if (choosing()) {
      const words = unused();
      if (picked === null || !words.includes(picked)) picked = words[0] ?? null;
      for (const code of keys) {
        const at: number = picked === null ? -1 : words.indexOf(picked);
        if (code === "ArrowUp" && words.length > 0) picked = words[(at + words.length - 1) % words.length];
        else if (code === "ArrowDown" && words.length > 0) picked = words[(at + 1) % words.length];
        else if (code === "Enter" || code === "NumpadEnter") choose();
        if (code.startsWith("Arrow")) sfx.move();
        if (pending) return;
      }
      for (const p of clicks) {
        if (pending) return;
        if (hits(p, MAIN_RECT)) choose();
        else {
          const all = view.hand?.words ?? [];
          all.forEach((word, index) => {
            if (hits(p, cardBox(index), 2) && words.includes(word) && picked !== word) {
              picked = word;
              sfx.move();
            }
          });
        }
      }
      return;
    }
    if (answering()) {
      if (pressed("Enter", "NumpadEnter")) sendAnswer();
      for (const p of clicks) {
        if (pending) return;
        if (hits(p, MAIN_RECT)) sendAnswer();
        else if (hits(p, PIECE_RECT)) togglePiece();
        else {
          // a word of the draft is taken out again by pressing it
          draft.forEach((word, index) => {
            if (hits(p, draftBox(index), 2)) {
              draft = draft.filter((each) => each !== word);
              sfx.back();
            }
          });
        }
      }
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
      // my own time is nearly up: a tick a second, and an answer written is submitted before it is
      const mine = choosing() || cluing() || answering() ? left(latest.clock.turn) : null;
      const second = mine === null ? null : Math.ceil(mine / 1000);
      if (second === null || second > HURRY_FROM) ticked = -1;
      else if (second !== ticked) {
        ticked = second;
        if (second > 0) sfx.move();
      }
      if (answering() && mine !== null && mine <= SEND_BEFORE_MS && !pending) {
        // (a word still in the box counts as written)
        const typed = wordOf(input.value, latest.rules.wordLength);
        if (typed !== null && !draft.includes(typed) && draft.length < (piece ? 2 : 1)) draft = [...draft, typed];
        if (draft.length > 0 && send({ type: "answer", words: piece ? draft : draft.slice(0, 1) })) say(WORDS.say.autoSent);
      }
    }
    stepInput();
    setBox();
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

  function button(rect: Box, text: string, lit: boolean, live: boolean): void {
    const [x, y, w, h] = rect;
    pen.px(x, y, w, h, lit ? C.amberD : C.steelDD);
    pen.px(x + 1, y + 1, w - 2, h - 2, lit ? "#3a2a12" : live && inRect(mouse, rect) ? C.btnH : C.btn);
    if (text !== "") pen.txt(pen.fit(text, w - 4), x + Math.round(w / 2), y + Math.round((h - 13) / 2), lit ? C.amber : live ? C.bone : C.dim, "center");
  }

  /** A ring round the box at (`x`, `y`), `thick` wide. */
  function ring(x: number, y: number, w: number, h: number, thick: number, colour: string): void {
    pen.px(x - thick, y - thick, w + 2 * thick, thick, colour);
    pen.px(x - thick, y + h, w + 2 * thick, thick, colour);
    pen.px(x - thick, y, thick, h, colour);
    pen.px(x + w, y, thick, h, colour);
  }

  /** Beside an answer: a ring where it was right, a cross where it was not. Said by shape as by colour. */
  function mark(x: number, y: number, right: boolean): void {
    pen.px(x, y, 11, 11, right ? RIGHT : C.crim);
    if (right) {
      pen.px(x + 3, y + 2, 5, 1, C.ink);
      pen.px(x + 3, y + 8, 5, 1, C.ink);
      pen.px(x + 2, y + 3, 1, 5, C.ink);
      pen.px(x + 8, y + 3, 1, 5, C.ink);
      return;
    }
    for (let i = 0; i < 7; i++) {
      pen.px(x + 2 + i, y + 2 + i, 1, 1, C.ink);
      pen.px(x + 8 - i, y + 2 + i, 1, 1, C.ink);
    }
  }

  const top = (words: string, colour: string): void => pen.txt(pen.fit(words, SCENE_W - 140), SCENE_W - 6, TOP_Y, colour, "right");

  /** A clue and its score, a line of a column `width` wide. */
  function clueRow(clue: Clue, x: number, y: number, width: number, best: boolean): void {
    if (latest === null) return;
    const reached = clue.score >= latest.rules.threshold;
    const colour = reached ? C.teal : best ? C.amber : C.bone;
    const score = WORDS.percent(clue.score);
    pen.txt(score, x + width, y, colour, "right");
    const tag = clue.room ? WORDS.scene.room : best && !reached ? WORDS.scene.best : "";
    let room = width - pen.width(score) - 6;
    if (tag !== "") {
      pen.txt(tag, x + room, y, C.dim, "right");
      room -= pen.width(tag) + 4;
    }
    pen.txt(pen.fit(clue.word, room), x, y, colour);
  }

  /** Where the `index`th word of the answer being written is. */
  function draftBox(index: number): Box {
    return [RIGHT_X, lowerTop(3) + ROW + 1 + index * ROW, RIGHT_W, ROW];
  }

  /** Where the lower block of the right column begins when it has `rows` lines under its heading. */
  const lowerTop = (rows: number): number => ROWS_Y + (ROWS - rows - 1) * ROW;

  /** The envelope while hidden words are chosen. */
  function drawChoose(): void {
    if (latest === null) return;
    const view = latest.view;
    const hand = view.hand;
    const live = choosing() && !pending;
    if (hand === null) {
      top(WORDS.top.watching, C.boneD);
      plate(WORDS.scene.ready(view.ready.length, view.players.length), 96, C.bone);
      return;
    }
    top(hand.chosen === null ? WORDS.top.choose : WORDS.top.chosen(hand.chosen), hand.chosen === null ? C.amber : C.teal);
    pen.txt(WORDS.scene.envelope, LEFT_X, HEAD_Y, C.boneD);
    hand.words.forEach((word, index) => {
      const [x, y, w, h] = cardBox(index);
      const spent = hand.used.includes(word);
      const mine = hand.chosen === word;
      const at = hand.chosen === null && picked === word;
      pen.px(x, y, w, h, C.steelDD);
      pen.px(x + 1, y + 1, w - 2, h - 2, spent ? C.night : live && !at && inRect(mouse, [x, y, w, h]) ? C.btnH : C.btn);
      pen.txt(pen.fit(word, w - (spent ? 66 : 12)), x + 6, y + 4, spent ? C.dim : mine ? C.teal : at ? C.amber : C.bone);
      if (spent) pen.txt(WORDS.scene.used, x + w - 5, y + 4, C.dim, "right");
      if (mine) ring(x, y, w, h, 1, C.teal);
      else if (at) ring(x, y, w, h, 1, C.amber);
    });
    pen.txt(WORDS.scene.ready(view.ready.length, view.players.length), RIGHT_X + RIGHT_W, ROWS_Y + (ROWS - 1) * ROW, C.boneD, "right");
  }

  /** A setter's turn: the clues with their scores at the left; at the right the clues of the stages before, and the answers. */
  function drawTurn(): void {
    if (latest === null) return;
    const view = latest.view;
    const rules = latest.rules;
    const mine = me();
    const setter = view.setter;
    if (setter === null) return;
    const result = view.phase === "reveal" && view.result !== null && view.result.setter === setter && view.result.stage === view.stage ? view.result : null;
    // over the scene: whose word, and once the turn is over, the word
    if (result !== null && result.word !== null) top(WORDS.top.found(result.word), C.teal);
    else if (result !== null) top(WORDS.top.notFound(view.stage), C.amber);
    else if (setter === mine && view.hand?.chosen != null) top(WORDS.top.setter(view.hand.chosen, view.stage), C.teal);
    else top(WORDS.top.guess(pen.fit(nickOf(setter), 56), view.stage), C.bone);

    // the clues of this stage; once clues are over without one that reached the mark, the highest is pointed out
    const now = cluesNow();
    pen.txt(WORDS.scene.clues(view.stage, now.length, rules.clues), LEFT_X, HEAD_Y, C.boneD);
    const over = view.phase !== "clue";
    const highest = now.reduce<Clue | null>((best, clue) => (best === null || clue.score > best.score ? clue : best), null);
    if (now.length === 0) pen.txt(WORDS.scene.noClue, LEFT_X, ROWS_Y, C.dim);
    now.slice(0, ROWS).forEach((clue, i) => clueRow(clue, LEFT_X, ROWS_Y + i * ROW, LEFT_W, over && clue === highest));

    // the lower block of the right column: the answer being written, how many have answered, or the answers
    const guessing = mine !== null && mine !== setter && view.phase === "answer";
    const lower = result !== null ? result.answers.length : guessing ? 3 : view.phase === "answer" ? 1 : 0;
    const before = cluesBefore();
    if (before.length > 0) {
      // the clues of the stages before, the highest first, as many as there is room for
      const room = ROWS - (lower > 0 ? lower + 2 : 0) - 1;
      pen.txt(WORDS.scene.earlier, RIGHT_X, HEAD_Y, C.boneD);
      const sorted = [...before].sort((a, b) => b.score - a.score);
      const shown = sorted.length > room ? sorted.slice(0, Math.max(0, room - 1)) : sorted;
      shown.forEach((clue, i) => clueRow(clue, RIGHT_X, ROWS_Y + i * ROW, RIGHT_W, false));
      if (shown.length < sorted.length) pen.txt(WORDS.scene.more(sorted.length - shown.length), RIGHT_X, ROWS_Y + shown.length * ROW, C.dim);
    }
    if (lower === 0) return;
    const y0 = lowerTop(lower);
    if (result !== null) {
      pen.txt(WORDS.scene.answers, RIGHT_X, y0, C.boneD);
      pen.txt(result.setterPoints > 0 ? WORDS.scene.setterGot(pen.fit(nickOf(setter), 60), result.setterPoints) : WORDS.scene.each(result.each), RIGHT_X + RIGHT_W, y0, C.amber, "right");
      result.answers.forEach((answer, i) => {
        const y = y0 + ROW + 1 + i * ROW;
        const name = pen.fit(nickOf(answer.player), 50);
        pen.txt(name, RIGHT_X, y, answer.player === mine ? C.amber : C.boneD);
        const words = answer.words.length === 0 ? WORDS.scene.noAnswer : answer.words.join(", ");
        pen.txt(pen.fit(words, RIGHT_W - 54 - 14), RIGHT_X + 54, y, answer.words.length === 0 ? C.dim : answer.right ? C.teal : C.bone);
        if (answer.words.length > 0) mark(RIGHT_X + RIGHT_W - 11, y + 1, answer.right);
      });
      return;
    }
    const guessers = view.players.length - 1;
    if (!guessing) {
      pen.txt(WORDS.scene.waitingAnswers(view.ready.length, guessers), RIGHT_X, y0 + ROW + 1, C.boneD);
      return;
    }
    const sent = view.answer;
    pen.txt(sent !== null ? WORDS.scene.sent : WORDS.scene.draft, RIGHT_X, y0, C.boneD);
    const words = sent ?? draft;
    if (words.length === 0) pen.txt(pen.fit(WORDS.scene.draftEmpty, RIGHT_W), RIGHT_X, y0 + ROW + 1, C.dim);
    words.forEach((word, index) => {
      const [x, y, w] = draftBox(index);
      pen.txt(pen.fit(`${index + 1}. ${word}`, w - 14), x, y, sent !== null ? C.teal : C.amber);
      // (a word not yet submitted is taken out again by pressing it)
      if (sent === null) pen.txt("×", x + w, y, inRect(mouse, [x, y, w, ROW]) ? C.bone : C.dim, "right");
    });
  }

  /** The turns of a game that is over: whose word each was, and what came of it. */
  function drawPast(): void {
    if (latest === null) return;
    const view = latest.view;
    top(WORDS.top.results, C.boneD);
    view.past.slice(-12).forEach((turn, i) => {
      const y = HEAD_Y + i * 14;
      const outcome = turn.stage === 0 ? WORDS.scene.turnPassed : turn.right.length > 0 ? WORDS.scene.turnRight(turn.right.length) : WORDS.scene.turnNone(turn.setterPoints);
      pen.txt(outcome, SCENE_W - 6, y, turn.right.length > 0 ? C.teal : C.boneD, "right");
      pen.txt(pen.fit(WORDS.scene.turn(turn.round, pen.fit(nickOf(turn.setter), 70), turn.word), SCENE_W - LEFT_X - pen.width(outcome) - 12), LEFT_X, y, C.bone);
    });
  }

  function drawScene(): void {
    if (latest === null) return;
    const view = latest.view;
    pen.px(0, 0, SCENE_W, BAR_Y, C.night);
    if (view.phase === "ended") drawPast();
    else if (view.phase === "choose") drawChoose();
    else drawTurn();
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
    if (pending) return [WORDS.standing.sending, C.boneD];
    const ms = left(latest.clock.turn);
    const clock = ms === null ? "" : clockOf(ms);
    const mine = me();
    if (view.phase === "choose") {
      if (view.hand === null) return [WORDS.standing.chooseOther(clock), C.bone];
      return view.hand.chosen === null ? [WORDS.standing.choose(clock), C.amber] : [WORDS.standing.chosen(clock), C.bone];
    }
    const setter = view.setter ?? -1;
    if (view.phase === "clue") {
      if (setter === mine) return [WORDS.standing.clueMine(latest.rules.clues - cluesNow().length, latest.rules.threshold, clock), C.amber];
      return [WORDS.standing.clueOther(pen.fit(nickOf(setter), 80), clock), C.bone];
    }
    if (view.phase === "answer") {
      if (mine === null) return [WORDS.standing.answerOther(clock), C.bone];
      if (setter === mine) return [WORDS.standing.answerSetter(clock), C.bone];
      return view.answer === null ? [WORDS.standing.answerMine(clock), C.amber] : [WORDS.standing.answered(clock), C.bone];
    }
    const result = view.result;
    if (result === null) return ["", C.bone];
    const right = result.answers.filter((each) => each.right).length;
    return right > 0 ? [WORDS.standing.revealFound(right, clock), C.teal] : [WORDS.standing.revealNone(pen.fit(nickOf(result.setter), 80), result.setterPoints, clock), C.amber];
  }

  function drawPanel(): void {
    if (latest === null) return;
    const view = latest.view;
    const x = PANEL_X;
    const mine = me();
    pen.px(SCENE_W, 0, W - SCENE_W, BAR_Y, C.night);
    pen.px(SCENE_W, 0, 1, BAR_Y, C.steelDD);
    pen.txt(WORDS.heading(view.round, latest.rules.rounds, latest.rules.multipliers[view.round - 1] ?? 1), x, 3, C.bone);
    const turn = left(latest.clock.turn);
    const hurried = choosing() || cluing() || answering();
    if (turn !== null) pen.txt(clockOf(turn), W - 5, 3, hurried && Math.ceil(turn / 1000) <= HURRY_FROM ? C.crim : C.boneD, "right");
    // while the game is played the players stand by their points, the most first; at its end, by their places
    const totalOf = (player: number): number => view.totals.find((each) => each.player === player)?.total ?? 0;
    const placeOf = (player: number): number | undefined => view.places?.find((each) => each.player === player)?.place;
    const order = [...view.players].sort((a, b) => (placeOf(a) ?? 0) - (placeOf(b) ?? 0) || totalOf(b) - totalOf(a) || a - b);
    const layout = panelLayout(order.length);
    if (!layout.crowded) pen.px(x, 16, PANEL_WIDTH, 1, C.steelDD);
    order.forEach((player, at) => {
      const { dx, y } = entryAt(layout, at);
      const ex = x + dx;
      let right = ex + layout.entryWidth - 1;
      const info = latest!.players.find((one) => one.id === player);
      const gone = info !== undefined && (info.left || !info.connected);
      const place = placeOf(player);
      const done = view.ready.includes(player);
      // who the game waits for, in amber; whose word it is, in teal
      const awaited =
        !(info?.left ?? false) && ((view.phase === "choose" && !done) || (view.phase === "clue" && view.setter === player) || (view.phase === "answer" && view.setter !== player && !done));
      if (awaited) pen.px(ex - 3, y + 2, 2, 9, C.amber);
      else if (view.setter === player && view.phase !== "ended") pen.px(ex - 3, y + 2, 2, 9, C.teal);
      const points = WORDS.points(totalOf(player));
      const pieces = view.pieces.find((each) => each.player === player)?.left ?? 0;
      const words = place !== undefined && !layout.crowded ? `${WORDS.result.verdict(true, place)} ${points}` : layout.crowded || place !== undefined ? points : `${WORDS.pieces(pieces)} · ${points}`;
      pen.txt(words, right, y, place === 1 ? C.brass : done ? C.teal : C.boneD, "right");
      right -= pen.width(words) + 4;
      const voice = info === undefined || info.bot || info.left ? "out" : handlers.voice(player);
      const room = right - ex - (voice !== "out" ? VOICE_MARK_W + 2 : 0);
      const name = pen.fit(info?.nick ?? "", Math.min(NAME_WIDTH, room));
      pen.txt(name, ex, y, gone ? C.dim : mine === player ? C.amber : C.bone);
      if (voice !== "out") drawVoiceMark(pen, ex + pen.width(name) + 2, y, voice, time);
    });
    pen.px(x, 86, PANEL_WIDTH, 1, C.steelDD);
    // the log: the latest of what was done
    const lines: [string, string][] = [];
    const short = (player: number): string => pen.fit(nickOf(player), LOG_NAME);
    for (const event of view.history) {
      if (event.type === "round") lines.push([WORDS.log.round(event.round), C.amber]);
      else if (event.type === "turn") lines.push([WORDS.log.turn(short(event.setter), event.stage), C.amber]);
      else if (event.type === "clue") lines.push([WORDS.log.clue(event.word, event.score), event.score >= latest.rules.threshold ? C.teal : C.bone]);
      else if (event.type === "clues-over") lines.push([WORDS.log.cluesOver[event.reason], C.boneD]);
      else if (event.type === "answered") lines.push([WORDS.log.answered(short(event.player), event.piece), C.boneD]);
      else if (event.type === "scored") lines.push(event.word !== null && event.right.length > 0 ? [WORDS.log.found(event.word, event.right.length), C.teal] : [WORDS.log.notFound(short(event.setter), event.setterPoints), C.bone]);
      else if (event.type === "passed") lines.push([WORDS.log.passed(short(event.setter)), C.boneD]);
      else if (event.type === "ended") lines.push([WORDS.ended[event.reason], C.amber]);
    }
    const from = Math.max(0, lines.length - layout.logRows);
    for (let i = from; i < lines.length; i++) pen.txt(pen.fit(lines[i][0], PANEL_WIDTH), x, layout.logTop + (i - from) * LOG_PITCH, lines[i][1]);
    // a chat line beside its speaker's name, over the edge of the scene
    for (const [player, line] of speech) {
      const at = order.indexOf(player);
      if (at >= 0) drawSpeech(pen, { label: { x: SCENE_W, y: entryAt(layout, at).y, align: "left" } }, line.lines);
    }
  }

  /** What this player came out of the game with, in the word the results lead with; `null` while it is being played, for someone who watched, and for a game cut short. */
  function verdict(): string | null {
    const mine = me();
    if (latest === null || latest.view.places === null || mine === null) return null;
    const own = latest.view.places.find((each) => each.player === mine);
    return own === undefined ? null : WORDS.result.verdict(true, own.place);
  }

  function drawResults(): void {
    if (latest === null) return;
    const view = latest.view;
    const mine = me();
    const places = [...(view.places ?? [])].sort((a, b) => a.place - b.place || a.player - b.player);
    const own = mine === null ? undefined : places.find((each) => each.player === mine);
    pen.txt(WORDS.result.verdict(own !== undefined, own?.place ?? null), 10, 234, own !== undefined && own.place === 1 ? C.teal : C.bone, "left", 24);
    const totalOf = (player: number): number => view.totals.find((each) => each.player === player)?.total ?? 0;
    const named = places.map((each) => WORDS.result.place(each.place, pen.fit(nickOf(each.player), 60), totalOf(each.player))).join(" · ");
    pen.txt(pen.fit(named, RESULT_WIDTH), 96, 226, C.bone);
    const how = view.ended === null ? "" : view.ended === "played" ? WORDS.result.how(latest.rules.firstPieces) : WORDS.ended[view.ended];
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
    const live = !pending;
    if (choosing()) {
      button(MAIN_RECT, WORDS.button.choose, live && picked !== null, live);
      pen.txt(pen.fit(TOUCH ? PAGE.menu.hint : WORDS.keys.choose, MAIN_RECT[0] - 12), 6, 246, C.dim);
      return;
    }
    if (answering()) {
      button(MAIN_RECT, WORDS.button.send, live && draft.length > 0, live);
      button(PIECE_RECT, WORDS.button.piece(piece, piecesLeft()), piece, live && (piece || mayPiece()));
      // (under a finger the two buttons leave no room for where the menu is: the line over them says what to do)
      if (!TOUCH) pen.txt(pen.fit(WORDS.keys.box, PIECE_RECT[0] - 12), 6, 246, C.dim);
      return;
    }
    pen.txt(pen.fit(cluing() && !TOUCH ? WORDS.keys.box : idle, W - 12), 6, 246, C.dim);
  }

  function drawHelp(): void {
    if (latest === null) return;
    const lines = WORDS.help(latest.rules);
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
    // a key typed into a text box (the chat, the game's own box) is not for the game, and neither is one pressed
    // on a button the player has gone to with the keyboard: that key is the button's
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLButtonElement) return;
    startAudio();
    if (!event.repeat || event.code.startsWith("Arrow")) keys.push(event.code);
    if (event.code === "Space" || event.code.startsWith("Arrow")) event.preventDefault();
  };
  /** In the game's own box: Esc gives the keys back to the game. */
  const onBoxKey = (event: KeyboardEvent): void => {
    // (a key that is part of composing a syllable is the input method's)
    if (event.isComposing || event.keyCode === 229) return;
    if (event.code === "Escape") input.blur();
  };
  const onSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    startAudio();
    if (!pending) entered();
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
  input.addEventListener("keydown", onBoxKey);
  form.addEventListener("submit", onSubmit);

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
    // a game that stands still waits on no one
    waits: (): boolean => latest !== null && !latest.frozen && hiddenWaits(latest.view),
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
      form.remove();
    },
  };
}
