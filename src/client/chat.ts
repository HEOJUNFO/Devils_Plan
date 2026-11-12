/**
 * The chat of the room this page is in: the lines said since the page came
 * in, and a box to say one.
 *
 * The room keeps no lines (see `src/shared/chat.ts`), so what was said before
 * is only what this tab itself heard: it is kept for the tab, by room, so a
 * reload does not empty the chat.
 */

import { isQuickWord, type QuickWord } from "../shared/chat";

/**
 * Something the page itself says in the chat. It is kept as what happened and
 * put into words when it is shown: a tab that comes back to a room in the
 * other language reads its old notes in that language, as it does every
 * other sentence (CLAUDE.md, Project Rules).
 */
export type ChatNote =
  /** Someone came into the room, or went. */
  | { kind: "came" | "went"; nick: string }
  /** The host sent someone out of the room. */
  | { kind: "kicked"; nick: string }
  /** Someone became the host: the host passed the room on, or was away when everyone else was ready. */
  | { kind: "host"; nick: string }
  /** The host made the room one for another game: which, by its id (its name is put in when the note is shown). */
  | { kind: "game"; game: string }
  /** A line could not be sent, or was sent too soon after the last; the voice chat was joined, joined without a microphone, or is not to be had here. */
  | { kind: "not-sent" | "too-fast" | "voice-joined" | "voice-listen-only" | "voice-not-here" }
  /** The room is for a game this player has not played here: where its rules are. */
  | { kind: "first-time" };

/** The kinds of note that name a player, and those that do not. */
const NAMED_NOTES: readonly string[] = ["came", "went", "host", "kicked"];
const PLAIN_NOTES: readonly string[] = ["not-sent", "too-fast", "voice-joined", "voice-listen-only", "voice-not-here", "first-time"];

/** One line as shown: something a player said, or a note from the page itself. */
interface Line {
  /** Who said it; absent for a note. */
  who?: string;
  /** Whether this player said it. */
  mine?: boolean;
  /** What was said. A note has none: it has `note`. (A note kept by an earlier build of the page has its words here.) */
  text?: string;
  /** Said with one press: which of the words, put in the page's language when the line is shown. Such a line has no `text`. */
  quick?: QuickWord;
  note?: ChatNote;
}

/** Whether `value` is a line as this module keeps them: read back from the tab's store, where anything may be. */
function isLine(value: unknown): value is Line {
  if (typeof value !== "object" || value === null) return false;
  const line = value as { text?: unknown; note?: unknown; quick?: unknown; who?: unknown };
  if (typeof line.text === "string") return true;
  if (line.quick !== undefined) return isQuickWord(line.quick) && typeof line.who === "string";
  if (typeof line.note !== "object" || line.note === null) return false;
  const note = line.note as { kind?: unknown; nick?: unknown; game?: unknown };
  if (note.kind === "game") return typeof note.game === "string";
  return typeof note.kind === "string" && (PLAIN_NOTES.includes(note.kind) || (NAMED_NOTES.includes(note.kind) && typeof note.nick === "string"));
}

/** The chat on the page. */
export interface Chat {
  /** Starts the chat of the room `code`, with what this tab heard there before. */
  open(code: string): void;
  /** Ends it: nothing is shown and nothing more is kept. */
  close(): void;
  /** A player said a line. */
  said(who: string, text: string, mine: boolean): void;
  /** This player says one of the words that take one press. */
  sayQuick(word: QuickWord): void;
  /** A player said one of them. */
  saidQuick(who: string, word: QuickWord, mine: boolean): void;
  /** Something worth a line happened: someone came or went, a line was refused. */
  note(note: ChatNote): void;
  /** Whether a note of `kind` is among the lines on show. */
  noted(kind: ChatNote["kind"]): boolean;
  /** The connection to the room went: the lines on their way are not coming back. */
  lost(): void;
  /** Puts the cursor in the box. */
  focus(): void;
  /** Scrolls to the last line; for when the chat comes back on show. */
  toEnd(): void;
}

/** Lines kept per room, for the tab. */
const KEEP = 60;

/**
 * Makes the chat out of its elements. `options.send` is given each line the
 * player types. A line is in the chat for good only when it comes back from
 * the room, so everyone sees them in the same order; until then the player's
 * own line is shown under the others, faint, from the moment it is sent: the
 * room is a moment away, and a box that empties onto nothing reads as a line
 * lost.
 */
export function createChat(
  elements: { log: HTMLOListElement; form: HTMLFormElement; input: HTMLInputElement; button: HTMLButtonElement },
  options: {
    maxLength: number;
    storagePrefix: string;
    /**
     * What the box's button says: `send` with something typed, which it
     * sends, and `quick` with the box empty, when a press of it asks for the
     * words that take one press instead.
     */
    labels: { send: string; quick: string };
    /** The button was pressed with the box empty. */
    quickAsked(): void;
    /** Sends a line; says whether it went. */
    send(text: string): boolean;
    /** Sends one of the words that take one press; says whether it went. */
    sendQuick(word: QuickWord): boolean;
    /** Such a word, in the language the page is read in. */
    quickOf(word: QuickWord): string;
    /** The player's own name, as the room shows it beside their lines. */
    me(): string;
    /** A note in words, in the language the page is read in. */
    wordsOf(note: ChatNote): string;
  },
): Chat {
  const { log, form, input, button } = elements;
  let lines: Line[] = [];
  let key: string | null = null;
  /** The player's own lines sent and not yet back from the room, oldest first: shown, not kept. One said with a press has no text to give back. */
  let waiting: { text: string | null; item: HTMLLIElement }[] = [];

  input.maxLength = options.maxLength;

  /** Whether there is anything in the box to send. */
  const typed = (): boolean => input.value.trim() !== "";

  /** Puts `text` in the box, and on its button what a press of it now does. */
  function fill(text: string): void {
    input.value = text;
    label();
  }

  function label(): void {
    button.textContent = typed() ? options.labels.send : options.labels.quick;
  }

  label();
  input.addEventListener("input", label);
  // A press of the button with nothing typed. Enter in the empty box presses it too, as far as the browser
  // is concerned: that one comes from no pointer and with the keys still in the box, and does nothing, as it did.
  button.addEventListener("click", (event) => {
    if (typed()) return;
    event.preventDefault();
    if (event.detail > 0 || document.activeElement === button) options.quickAsked();
  });

  function row(line: Line): HTMLLIElement {
    const item = document.createElement("li");
    if (line.who === undefined) {
      item.className = "note";
      item.textContent = line.note === undefined ? (line.text ?? "") : options.wordsOf(line.note);
      return item;
    }
    const who = document.createElement("span");
    who.className = line.mine === true ? "who mine" : "who";
    who.textContent = line.who;
    item.append(who, ` ${line.quick === undefined ? (line.text ?? "") : options.quickOf(line.quick)}`);
    return item;
  }

  function add(line: Line): void {
    // someone reading further up is not pulled down, unless they are the one speaking
    const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 14;
    lines.push(line);
    // above the lines still on their way, which are the last to have been said
    log.insertBefore(row(line), waiting[0]?.item ?? null);
    if (lines.length > KEEP) {
      lines = lines.slice(-KEEP);
      log.firstElementChild?.remove();
    }
    if (atEnd || line.mine === true) log.scrollTop = log.scrollHeight;
    if (key !== null) {
      try {
        sessionStorage.setItem(key, JSON.stringify(lines));
      } catch {
        // a full or closed store only means a reload starts with an empty chat
      }
    }
  }

  form.addEventListener("submit", (event) => {
    // The line is read when the form is sent, not on a key: by then a Korean
    // syllable still being composed has been finished, so it is sent whole and once.
    event.preventDefault();
    if (!typed()) return;
    // a line that did not go stays in the box, to be sent when it can
    const text = input.value.trim();
    if (!options.send(input.value)) return add({ note: { kind: "not-sent" } });
    fill("");
    onItsWay(text, row({ who: options.me(), text, mine: true }));
  });

  /** Shows the player's own line faint under the others, as one on its way to the room. */
  function onItsWay(text: string | null, item: HTMLLIElement): void {
    item.classList.add("waiting");
    waiting.push({ text, item });
    log.append(item);
    log.scrollTop = log.scrollHeight;
  }

  /** Takes the oldest line on its way off the screen: the room answers them in the order they were sent. Its text, if it was typed. */
  function settle(): string | null {
    const first = waiting.shift();
    first?.item.remove();
    return first?.text ?? null;
  }

  return {
    open(code: string): void {
      key = `${options.storagePrefix}.${code}`;
      lines = [];
      try {
        const stored: unknown = JSON.parse(sessionStorage.getItem(key) ?? "[]");
        if (Array.isArray(stored)) lines = stored.filter(isLine).slice(-KEEP);
      } catch {
        lines = [];
      }
      waiting = [];
      log.replaceChildren(...lines.map(row));
      log.scrollTop = log.scrollHeight;
      fill("");
    },
    close(): void {
      key = null;
      lines = [];
      waiting = [];
      log.replaceChildren();
      fill("");
    },
    said(who: string, text: string, mine: boolean): void {
      // the player's own line is back: it takes its place among the others as the room has it
      if (mine) settle();
      add({ who, text, mine });
    },
    sayQuick(word: QuickWord): void {
      if (!options.sendQuick(word)) return add({ note: { kind: "not-sent" } });
      onItsWay(null, row({ who: options.me(), quick: word, mine: true }));
    },
    saidQuick(who: string, word: QuickWord, mine: boolean): void {
      if (mine) settle();
      add({ who, quick: word, mine });
    },
    note(note: ChatNote): void {
      if (note.kind === "too-fast") {
        // the room did not take the line: it goes back in the box, unless another is being typed there
        const text = settle();
        if (text !== null && input.value === "") fill(text);
      }
      add({ note });
    },
    noted(kind: ChatNote["kind"]): boolean {
      return lines.some((line) => line.note?.kind === kind);
    },
    lost(): void {
      if (waiting.length === 0) return;
      while (waiting.length > 0) settle();
      add({ note: { kind: "not-sent" } });
    },
    focus(): void {
      input.focus();
    },
    toEnd(): void {
      log.scrollTop = log.scrollHeight;
    },
  };
}
