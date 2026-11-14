/**
 * Notes what goes wrong in this page, for whoever makes the game
 * (`src/shared/fault.ts`): an error the page's script threw and nothing
 * caught, or a promise rejected with one and left so.
 *
 * What is noted waits in this browser until the lobby is connected, which
 * is where it is sent from (`main.ts`): a page that went wrong in a room has
 * no connection to the list of rooms, and is as likely to be loaded again as
 * to be gone back from. Listening starts when this file is first read, which
 * is before the page's own script runs, so that an error in the page's first
 * moments is noted too.
 */
import directoryConfig from "../shared/directory-config.json";
import { BUILD } from "../shared/build";
import { browserOf, faultOf, parseWaiting, sameFault, waitingWith, type Fault, type FaultConfig, type RawFault, type WaitingFault } from "../shared/fault";
import { storageKey } from "./storage";

const config: FaultConfig = directoryConfig.faults;
/** Where the faults wait in this browser. */
const KEY = storageKey("faults");

/** Which screen is up, as the page says once it can; the lobby until then. */
let screenUp: () => string = () => "lobby";
/** Told when a fault has been noted: the page sends it now if it can. */
let whenNoted: () => void = () => undefined;
/** The faults this page has noted since it was loaded: the same one is noted once, and no more than a page sends. */
const mine: Fault[] = [];

/** The faults waiting in this browser; none where the browser keeps nothing. */
function waiting(): WaitingFault[] {
  try {
    return parseWaiting(localStorage.getItem(KEY), config);
  } catch {
    return [];
  }
}

/** Notes what the browser handed the page of an error, where it is a fault of the game and not one this page has noted already. */
function note(raw: RawFault): void {
  if (mine.length >= config.each) return;
  let where = "lobby";
  try {
    where = screenUp();
  } catch {
    // asked before the page knows which screen is up: it is the lobby's, or nothing's yet
  }
  const fault = faultOf(raw, where, browserOf(navigator.userAgent), config);
  if (fault === null || mine.some((other) => sameFault(other, fault))) return;
  mine.push(fault);
  try {
    localStorage.setItem(KEY, JSON.stringify(waitingWith(waiting(), fault, BUILD, config)));
  } catch {
    // a browser that keeps nothing: the fault is not told
    return;
  }
  try {
    whenNoted();
  } catch {
    // what is noted waits; nothing thrown on the way to sending it is noted in its turn
  }
}

addEventListener("error", (event) => {
  const error: unknown = event.error;
  note({
    message: event.message !== "" ? event.message : error instanceof Error ? `${error.name}: ${error.message}` : "",
    source: event.filename,
    line: event.lineno,
    column: event.colno,
    stack: error instanceof Error ? error.stack : undefined,
  });
});

addEventListener("unhandledrejection", (event) => {
  // a promise rejected with something that is no error says nothing of where it was: not noted
  const reason: unknown = event.reason;
  if (reason instanceof Error) note({ message: `${reason.name}: ${reason.message}`, stack: reason.stack });
});

/**
 * Tells this file which screen is up (`lobby`, `room`, or the id of the game
 * being played) and what to do when a fault has been noted.
 */
export function watchFaults(where: () => string, noted: () => void): void {
  screenUp = where;
  whenNoted = noted;
}

/** The faults waiting in this browser, which wait no longer: whoever takes them sends them. */
export function takeWaiting(): WaitingFault[] {
  const taken = waiting();
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing was kept, so nothing was taken
  }
  return taken;
}
