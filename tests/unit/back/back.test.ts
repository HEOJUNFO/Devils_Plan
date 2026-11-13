import { describe, expect, it } from "vitest";
import { backTrail, heldAt, type Held, type Screens, type Trail } from "../../../src/shared/back";

/** One place in a browser's history: what the page kept with it, and the address it was at. */
interface Place {
  state: unknown;
  address: string;
}

/**
 * One tab's history as far as a page can tell, and a page in it. A move the
 * page or the player asked for arrives later, when `arrive` is called, as a
 * browser's does. `open` is what is on show over the lobby, the last opened
 * on top; a thing named "game" asks before it is closed, as a game does.
 */
function tab(first: Place = { state: null, address: "/" }) {
  const places: Place[] = [first];
  let at = 0;
  /** Moves asked for and not yet made. */
  const due: number[] = [];
  /** Whether the tab has left the page for whatever was before it. */
  let left = false;
  let touched = false;
  /** The room the page is in. */
  let room = "";
  const open: string[] = [];
  const closed: string[] = [];
  /** How often the game asked whether to leave. */
  let asked = 0;

  const address = (): string => (room === "" ? "/" : `/#${room}`);
  const trail: Trail = {
    state: () => places[at].state,
    hold: (held: Held) => {
      places.splice(at + 1);
      places.push({ state: held, address: address() });
      at++;
    },
    go: (by) => {
      due.push(by);
    },
    settle: () => {
      places[at].address = address();
    },
    touched: () => touched,
  };
  const screens: Screens = {
    depth: () => open.length,
    step: () => {
      const top = open.at(-1);
      if (top === "game" && asked === 0) {
        asked++;
        return;
      }
      if (top === undefined) return;
      closed.push(top);
      open.pop();
      // out of the game is out of its room too, to the lobby
      if (top === "game") {
        closed.push(open.pop() ?? "");
        room = "";
      }
      if (top === "room") room = "";
    },
  };
  const back = backTrail(trail, screens);

  /** A move that was asked for is made, and the page told: says whether the tab is still on the page. */
  const arrive = (): boolean => {
    const by = due.shift();
    if (by === undefined) throw new Error("no move was asked for");
    if (at + by < 0) {
      left = true;
      return false;
    }
    at = Math.min(places.length - 1, at + by);
    // the browser moved the page: what was pressed before counts for nothing
    touched = false;
    back.arrived();
    return true;
  };

  return {
    back,
    trail,
    open,
    closed,
    arrive,
    /** The player presses the browser's back (-1) or forward (1) button, and the browser moves. */
    press: (by: -1 | 1): boolean => {
      due.push(by);
      return arrive();
    },
    /** The player presses something on the page, which opens, closes or enters what `change` says. */
    touch: (change: () => void = () => undefined) => {
      touched = true;
      change();
      back.sync();
    },
    /** Something changes on the page that the player did not press: a room answers, a game starts. */
    happen: (change: () => void) => {
      change();
      back.sync();
    },
    enter: (code: string) => {
      room = code;
    },
    asked: () => asked,
    waiting: () => due.length,
    left: () => left,
    at: () => at,
    places: () => places.map((place) => `${place.address} ${heldAt(place.state)}`),
  };
}

describe("heldAt", () => {
  it("reads how far up a place is from what was kept with it", () => {
    expect(heldAt({ back: 1 })).toBe(1);
    expect(heldAt({ back: 3 })).toBe(3);
    // what a browser hands back is a copy, never the object itself
    expect(heldAt(JSON.parse(JSON.stringify({ back: 2 })))).toBe(2);
  });

  it("takes anything the page did not put there for its first place", () => {
    expect(heldAt(null)).toBe(0);
    expect(heldAt(undefined)).toBe(0);
    expect(heldAt("back")).toBe(0);
    expect(heldAt({})).toBe(0);
    expect(heldAt({ back: true })).toBe(0);
    expect(heldAt({ back: 0 })).toBe(0);
    expect(heldAt({ back: -1 })).toBe(0);
    expect(heldAt({ back: 1.5 })).toBe(0);
  });
});

describe("backTrail", () => {
  it("holds no place in the lobby with nothing open: a press back leaves the page", () => {
    const t = tab();
    t.touch();
    expect(t.places()).toEqual(["/ 0"]);
    expect(t.press(-1)).toBe(false);
  });

  it("holds one place for each thing that is open", () => {
    const t = tab();
    t.touch(() => t.open.push("new room"));
    expect(t.places()).toEqual(["/ 0", "/ 1"]);
    t.touch(() => t.open.push("rules"));
    // told again with nothing changed: nothing is added
    t.back.sync();
    expect(t.places()).toEqual(["/ 0", "/ 1", "/ 2"]);
    expect(t.at()).toBe(2);
  });

  it("takes each press back as one step to the screen before, and the last as the way out", () => {
    const t = tab();
    t.touch(() => t.open.push("new room"));
    t.touch(() => t.open.push("rules"));

    expect(t.press(-1)).toBe(true);
    expect(t.closed).toEqual(["rules"]);
    expect(t.at()).toBe(1);
    expect(t.press(-1)).toBe(true);
    expect(t.closed).toEqual(["rules", "new room"]);
    expect(t.at()).toBe(0);
    // the page asked the browser for nothing along the way
    expect(t.waiting()).toBe(0);
    expect(t.press(-1)).toBe(false);
  });

  it("steps off the place of a thing closed on the page itself, asking once", () => {
    const t = tab();
    t.touch(() => t.open.push("rules"));
    // the sheet's own button
    t.touch(() => t.open.pop());
    expect(t.waiting()).toBe(1);
    // something else changes before the browser has moved: no second move is asked for
    t.back.sync();
    expect(t.waiting()).toBe(1);
    t.arrive();
    expect(t.at()).toBe(0);
    // the move was the page's own: no step back was taken for it
    expect(t.closed).toEqual([]);
    expect(t.press(-1)).toBe(false);
  });

  it("steps off as many places as were closed at once", () => {
    const t = tab();
    t.touch(() => t.open.push("room"));
    t.touch(() => t.open.push("options"));
    // the room let the player go: the sheet over it goes with it
    t.happen(() => t.open.splice(0));
    t.arrive();
    expect(t.at()).toBe(0);
    expect(t.closed).toEqual([]);
  });

  it("adds no place for what the player did not press, until they press something", () => {
    const t = tab();
    t.touch(() => {
      t.enter("ABCD");
      t.open.push("room");
    });
    expect(t.places()).toEqual(["/ 0", "/#ABCD 1"]);
    // the browser moved the page since (a press forward and back again, say): nothing has been pressed on it
    t.press(-1);
    expect(t.closed).toEqual(["room"]);
    // an invitation's room answers by itself
    t.happen(() => {
      t.enter("WXYZ");
      t.open.push("room");
    });
    expect(t.at()).toBe(0);
    // the first press in the room makes the place up
    t.touch();
    expect(t.at()).toBe(1);
    expect(t.places()[1]).toBe("/#WXYZ 1");
  });

  it("steps back from a room to the lobby, with the lobby's address", () => {
    const t = tab({ state: null, address: "/#ABCD" });
    // opened by an invitation: the first place has the room in its address
    t.happen(() => {
      t.enter("ABCD");
      t.open.push("room");
    });
    t.touch();
    expect(t.places()).toEqual(["/#ABCD 0", "/#ABCD 1"]);

    expect(t.press(-1)).toBe(true);
    expect(t.closed).toEqual(["room"]);
    expect(t.places()[0]).toBe("/ 0");
    expect(t.press(-1)).toBe(false);
  });

  it("writes the lobby's address on the first place when the room is left by its own button", () => {
    const t = tab({ state: null, address: "/#ABCD" });
    t.happen(() => {
      t.enter("ABCD");
      t.open.push("room");
    });
    t.touch();
    t.touch(() => {
      t.open.pop();
      t.enter("");
    });
    t.arrive();
    expect(t.at()).toBe(0);
    // or the browser would say the address changed to a room, and the page would go back into it
    expect(t.places()[0]).toBe("/ 0");
  });

  it("asks before leaving a game, adds no place for the asking, and leaves at the next press", () => {
    const t = tab();
    t.touch(() => {
      t.enter("ABCD");
      t.open.push("room");
    });
    t.touch(() => t.open.push("game"));
    expect(t.places()).toEqual(["/ 0", "/#ABCD 1", "/#ABCD 2"]);

    expect(t.press(-1)).toBe(true);
    expect(t.asked()).toBe(1);
    // still in the game, one place lower than it is deep, and nothing added that a browser would pass over
    expect(t.open).toEqual(["room", "game"]);
    expect(t.at()).toBe(1);

    expect(t.press(-1)).toBe(true);
    expect(t.open).toEqual([]);
    expect(t.at()).toBe(0);
    expect(t.places()[0]).toBe("/ 0");
    expect(t.press(-1)).toBe(false);
  });

  it("makes the game's place up again when the player goes on playing after being asked", () => {
    const t = tab();
    t.touch(() => {
      t.enter("ABCD");
      t.open.push("room");
    });
    t.touch(() => t.open.push("game"));
    t.press(-1);
    expect(t.at()).toBe(1);
    // a move in the game
    t.touch();
    expect(t.at()).toBe(2);
    expect(t.places()).toEqual(["/ 0", "/#ABCD 1", "/#ABCD 2"]);
  });

  it("does nothing with a press forward onto a place it once held, and steps back off it", () => {
    const t = tab();
    t.touch(() => t.open.push("rules"));
    t.press(-1);
    expect(t.closed).toEqual(["rules"]);

    t.press(1);
    // nothing was opened or closed by it, and the page asked to be moved back
    expect(t.open).toEqual([]);
    expect(t.closed).toEqual(["rules"]);
    expect(t.waiting()).toBe(1);
    t.arrive();
    expect(t.at()).toBe(0);
  });

  it("keeps the places it finds when the page is loaded again as deep as it was", () => {
    // loaded again in a room: the browser kept both places and what was kept with them
    const t = tab();
    t.enter("ABCD");
    t.trail.hold({ back: 1 });
    t.happen(() => t.open.push("room"));
    t.touch();
    expect(t.places()).toEqual(["/ 0", "/#ABCD 1"]);
    expect(t.waiting()).toBe(0);
  });

  it("steps off the places it finds when the page is loaded again with nothing open", () => {
    const t = tab();
    t.trail.hold({ back: 1 });
    t.trail.hold({ back: 2 });
    t.back.sync();
    t.arrive();
    expect(t.at()).toBe(0);
    expect(t.closed).toEqual([]);
  });

  it("looks again once its own move has arrived, at what was opened meanwhile", () => {
    const t = tab();
    t.touch(() => t.open.push("new room"));
    // the form is put away and the room asked for
    t.touch(() => t.open.pop());
    // the room answers before the browser has moved
    t.happen(() => {
      t.enter("ABCD");
      t.open.push("room");
    });
    t.arrive();
    expect(t.closed).toEqual([]);
    expect(t.at()).toBe(0);
    // nothing was pressed since the browser moved the page: the place is made up at the next press
    t.touch();
    // the first place has the room's address meanwhile, as where the page is; a step back out of the room writes the lobby's on it
    expect(t.places()).toEqual(["/#ABCD 0", "/#ABCD 1"]);
    t.press(-1);
    expect(t.places()[0]).toBe("/ 0");
  });
});
