/**
 * Chat in a room: what a line may be and how fast one player may talk.
 *
 * The room passes lines on and keeps none: a line reaches whoever is in the
 * room when it is said. Pure functions over plain data.
 */
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

/** How much one player has said lately: `count` lines in the window that began at `since`. */
export interface ChatPace {
  count: number;
  /** Milliseconds since the epoch. */
  since: number;
}

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
export function paceChat(pace: ChatPace | undefined, now: number, config: ChatConfig): { ok: boolean; pace: ChatPace } {
  if (pace === undefined || now - pace.since >= config.windowSeconds * 1000 || now < pace.since) {
    return { ok: true, pace: { count: 1, since: now } };
  }
  if (pace.count < config.burst) return { ok: true, pace: { count: pace.count + 1, since: pace.since } };
  return { ok: false, pace };
}
