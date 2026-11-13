/**
 * Telling, on the page's side, a connection that has died without a word
 * from one that is only quiet.
 *
 * A network that drops or a phone that changes from Wi-Fi to its carrier
 * closes nothing: the socket stays "open" for as long as the system takes to
 * give up, which can be minutes, and everything the player presses in that
 * time goes nowhere. The room answers every ping at once, without waking
 * (`PING`, `PONG`), so a ping that is not answered is the sign.
 *
 * Pure functions over plain values: the page tells what it sent and heard,
 * looks once a second, and does what {@link look} says.
 */

/** The numbers this goes by; they are among the room's settings (`room-config.json`). */
export interface LivenessConfig {
  /** Seconds between two pings while nothing is waited for. */
  pingSeconds: number;
  /** Pings in a row that may go unanswered; when the next is due the connection is taken for dead. */
  missedPings: number;
  /** Seconds after something was sent, with nothing heard since, before a ping asks whether the connection lives. */
  askAfterSeconds: number;
  /** Seconds that ping has to be answered in. */
  deadAfterSeconds: number;
  /** Seconds a page that is not on show goes on trying to open a connection that is down. */
  hiddenRetrySeconds: number;
}

/** What the page knows of its connection. Times are in ms. */
export interface Liveness {
  /** When the last ping went. */
  pingedAt: number;
  /** Pings gone since anything was heard. */
  unanswered: number;
  /** When the first thing sent since anything was heard went; `null` when nothing is waited for. */
  waitingSince: number | null;
  /** When a ping went to ask whether the connection lives; `null` when none has since anything was heard. */
  askedAt: number | null;
}

/** A connection just opened at `now`: nothing sent, nothing owed, the first ping a full wait away. */
export function opened(now: number): Liveness {
  return { pingedAt: now, unanswered: 0, waitingSince: null, askedAt: null };
}

/** Something came from the room, a message or the answer to a ping: the connection lives. */
export function heard(state: Liveness): Liveness {
  return { ...state, unanswered: 0, waitingSince: null, askedAt: null };
}

/** Something went to the room at `now`. Whatever it was, a living connection is heard from soon after. */
export function sent(state: Liveness, now: number): Liveness {
  return state.waitingSince !== null ? state : { ...state, waitingSince: now };
}

/**
 * The page has reason to doubt its connection at `now` (it was brought back
 * to the front, or the network came back): the next {@link look} asks.
 */
export function doubted(state: Liveness, now: number, config: LivenessConfig): Liveness {
  if (state.askedAt !== null) return state;
  return { ...state, waitingSince: now - config.askAfterSeconds * 1000 };
}

/** What a look at the connection comes to. */
export interface Looked {
  state: Liveness;
  /** Send a ping now. */
  ping: boolean;
  /** The connection is dead: open a new one. */
  dead: boolean;
}

/**
 * Looks at the connection at `now`: whether a ping is due, and whether the
 * connection is to be taken for dead. The caller sends the ping it is told
 * to; a dead connection is closed and opened anew, and starts from
 * {@link opened}.
 */
export function look(state: Liveness, now: number, config: LivenessConfig): Looked {
  // asked, and no answer in the time an answer takes
  if (state.askedAt !== null) {
    return { state, ping: false, dead: now - state.askedAt >= config.deadAfterSeconds * 1000 };
  }
  // something was sent and nothing has come back for a while: ask
  if (state.waitingSince !== null && now - state.waitingSince >= config.askAfterSeconds * 1000) {
    return { state: { ...state, askedAt: now, pingedAt: now, unanswered: state.unanswered + 1 }, ping: true, dead: false };
  }
  // the ping that tells the room this page is still there
  if (now - state.pingedAt >= config.pingSeconds * 1000) {
    if (state.unanswered >= config.missedPings) return { state, ping: false, dead: true };
    return { state: { ...state, pingedAt: now, unanswered: state.unanswered + 1 }, ping: true, dead: false };
  }
  return { state, ping: false, dead: false };
}

/**
 * Whether a connection that has been down since `downSince` (`null`: it is
 * up) is left alone at `now`, tried no more until the page is looked at
 * again. A page on show is never left without its tries: someone may be
 * waiting on it. A page that is not (`hidden`: a tab behind another, a
 * window put away, a phone with another app in front) goes on trying for
 * `hiddenRetrySeconds`, which mends a line that dropped for a moment under a
 * player waiting for a turn in another tab, and then stops. A tab forgotten
 * there would else ask for a new connection every few seconds for as long as
 * it stayed open, and every one of those counts against what the game has
 * for a day.
 */
export function givenUp(downSince: number | null, now: number, hidden: boolean, config: LivenessConfig): boolean {
  return hidden && downSince !== null && now - downSince >= config.hiddenRetrySeconds * 1000;
}
