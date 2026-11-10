/**
 * The chat of the room this page is in: the lines said since the page came
 * in, and a box to say one.
 *
 * The room keeps no lines (see `src/shared/chat.ts`), so what was said before
 * is only what this tab itself heard: it is kept for the tab, by room, so a
 * reload does not empty the chat.
 */

/** One line as shown: something a player said, or a note from the page itself. */
interface Line {
  /** Who said it; absent for a note. */
  who?: string;
  /** Whether this player said it. */
  mine?: boolean;
  text: string;
}

/** The chat on the page. */
export interface Chat {
  /** Starts the chat of the room `code`, with what this tab heard there before. */
  open(code: string): void;
  /** Ends it: nothing is shown and nothing more is kept. */
  close(): void;
  /** A player said a line. */
  said(who: string, text: string, mine: boolean): void;
  /** Something worth a line happened: someone came or went, a line was refused. */
  note(text: string): void;
  /** Puts the cursor in the box. */
  focus(): void;
  /** Scrolls to the last line; for when the chat comes back on show. */
  toEnd(): void;
}

/** Lines kept per room, for the tab. */
const KEEP = 60;

/**
 * Makes the chat out of its elements. `options.send` is given each line the
 * player types; lines are shown only when they come back from the room, so
 * everyone sees them in the same order.
 */
export function createChat(
  elements: { log: HTMLOListElement; form: HTMLFormElement; input: HTMLInputElement },
  options: {
    maxLength: number;
    storagePrefix: string;
    /** Sends a line; says whether it went. */
    send(text: string): boolean;
    /** What the chat says when a line could not be sent. */
    notSent: string;
  },
): Chat {
  const { log, form, input } = elements;
  let lines: Line[] = [];
  let key: string | null = null;

  input.maxLength = options.maxLength;

  function row(line: Line): HTMLLIElement {
    const item = document.createElement("li");
    if (line.who === undefined) {
      item.className = "note";
      item.textContent = line.text;
      return item;
    }
    const who = document.createElement("span");
    who.className = line.mine === true ? "who mine" : "who";
    who.textContent = line.who;
    item.append(who, ` ${line.text}`);
    return item;
  }

  function add(line: Line): void {
    // someone reading further up is not pulled down, unless they are the one speaking
    const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 14;
    lines.push(line);
    log.append(row(line));
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
    if (input.value.trim() === "") return;
    // a line that did not go stays in the box, to be sent when it can
    if (options.send(input.value)) input.value = "";
    else add({ text: options.notSent });
  });

  return {
    open(code: string): void {
      key = `${options.storagePrefix}.${code}`;
      lines = [];
      try {
        const stored: unknown = JSON.parse(sessionStorage.getItem(key) ?? "[]");
        if (Array.isArray(stored)) {
          lines = stored
            .filter((line): line is Line => typeof line === "object" && line !== null && typeof (line as Line).text === "string")
            .slice(-KEEP);
        }
      } catch {
        lines = [];
      }
      log.replaceChildren(...lines.map(row));
      log.scrollTop = log.scrollHeight;
      input.value = "";
    },
    close(): void {
      key = null;
      lines = [];
      log.replaceChildren();
      input.value = "";
    },
    said(who: string, text: string, mine: boolean): void {
      add({ who, text, mine });
    },
    note(text: string): void {
      add({ text });
    },
    focus(): void {
      input.focus();
    },
    toEnd(): void {
      log.scrollTop = log.scrollHeight;
    },
  };
}
