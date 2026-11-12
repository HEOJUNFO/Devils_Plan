/**
 * Chat in a room: what a line may be and how fast one player may talk.
 *
 * The room passes lines on and keeps none: a line reaches whoever is in the
 * room when it is said. Pure functions over plain data.
 */
import { pace, type Pace } from "./pace";
import { cleanLine, cutTo } from "./text";

/** Tunable chat values. Loaded from `chat-config.json`. */
export interface ChatConfig {
  /** Longest line, in characters. Longer ones are cut. */
  maxLength: number;
  /** Lines one player may send within one window. */
  burst: number;
  /** Seconds a window lasts. */
  windowSeconds: number;
}

/**
 * What a player can say with one press, without typing: by name. The room
 * passes on which was said, never a sentence, and each page puts it in the
 * language it is read in (`src/client/words.ts`), so two players who share no
 * language read each other.
 */
export const QUICK_WORDS = ["hello", "nice", "thanks", "sorry", "wait", "go", "oops", "gg"] as const;

/** One of {@link QUICK_WORDS}. */
export type QuickWord = (typeof QUICK_WORDS)[number];

/** Whether `value` names one of the words that can be said with one press. */
export function isQuickWord(value: unknown): value is QuickWord {
  return typeof value === "string" && (QUICK_WORDS as readonly string[]).includes(value);
}

/** How much one player has said lately: `count` lines in the window that began at `since`. */
export type ChatPace = Pace;

/**
 * Cleans a chat line: one line of text with no control characters, cut to the
 * configured length. Returns `null` when nothing is left to say.
 */
export function normalizeChat(raw: string, config: ChatConfig): string | null {
  const line = cutTo(cleanLine(raw), config.maxLength);
  return line.length > 0 ? line : null;
}

/**
 * Whether a player whose pace so far is `pace` may say a line at `now`, and
 * their pace afterwards. A line that is refused does not count against them.
 */
export function paceChat(previous: ChatPace | undefined, now: number, config: ChatConfig): { ok: boolean; pace: ChatPace } {
  return pace(previous, now, config.burst, config.windowSeconds);
}
