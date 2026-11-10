import { env } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { Timers } from "../../../src/server/timers";

type Kind = "early" | "late";

const HOUR = 3_600_000;
/** A fixed time far in the future, so no alarm set here fires during the run. */
const T0 = Date.UTC(2100, 0, 1);

/** Runs `body` with a `Timers` over the storage of the object named `name`. */
function withTimers<T>(
  name: string,
  body: (timers: Timers<Kind>, storage: DurableObjectStorage) => Promise<T>,
): Promise<T> {
  return runInDurableObject(env.GameRoom.getByName(name), (_room, state) =>
    body(new Timers<Kind>(state.storage), state.storage),
  );
}

describe("Timers", () => {
  it("points the alarm at the earliest timer", async () => {
    const alarm = await withTimers("timers-earliest", async (timers, storage) => {
      await timers.set("late", T0 + 2 * HOUR);
      await timers.set("early", T0 + HOUR);
      return storage.getAlarm();
    });

    expect(alarm).toBe(T0 + HOUR);
  });

  it("keeps the earlier alarm when a later timer is added", async () => {
    const alarm = await withTimers("timers-later-added", async (timers, storage) => {
      await timers.set("early", T0 + HOUR);
      await timers.set("late", T0 + 2 * HOUR);
      return storage.getAlarm();
    });

    expect(alarm).toBe(T0 + HOUR);
  });

  it("moves the alarm to the next timer when the earliest is cleared", async () => {
    const alarm = await withTimers("timers-clear-earliest", async (timers, storage) => {
      await timers.set("early", T0 + HOUR);
      await timers.set("late", T0 + 2 * HOUR);
      await timers.clear("early");
      return storage.getAlarm();
    });

    expect(alarm).toBe(T0 + 2 * HOUR);
  });

  it("removes the alarm when the last timer is cleared", async () => {
    const alarm = await withTimers("timers-clear-last", async (timers, storage) => {
      await timers.set("early", T0 + HOUR);
      await timers.clear("early");
      return storage.getAlarm();
    });

    expect(alarm).toBeNull();
  });

  it("replaces the time of a timer that is set again", async () => {
    const result = await withTimers("timers-replace", async (timers, storage) => {
      await timers.set("early", T0 + HOUR);
      await timers.set("early", T0 + 3 * HOUR);
      return { due: timers.get("early"), alarm: await storage.getAlarm() };
    });

    expect(result).toEqual({ due: T0 + 3 * HOUR, alarm: T0 + 3 * HOUR });
  });

  it("reports a timer that is not set as null", async () => {
    const due = await withTimers("timers-unset", async (timers) => timers.get("late"));

    expect(due).toBeNull();
  });

  it("fires only the timers that are due and re-arms for the rest", async () => {
    const result = await withTimers("timers-fire-some", async (timers, storage) => {
      await timers.set("early", T0 + HOUR);
      await timers.set("late", T0 + 3 * HOUR);
      const ran: Kind[] = [];
      await timers.fire(T0 + 2 * HOUR, (kind) => void ran.push(kind));
      return {
        ran,
        early: timers.get("early"),
        late: timers.get("late"),
        alarm: await storage.getAlarm(),
      };
    });

    expect(result).toEqual({
      ran: ["early"],
      early: null,
      late: T0 + 3 * HOUR,
      alarm: T0 + 3 * HOUR,
    });
  });

  it("fires every due timer, earliest first, and leaves no alarm", async () => {
    const result = await withTimers("timers-fire-all", async (timers, storage) => {
      await timers.set("late", T0 + 2 * HOUR);
      await timers.set("early", T0 + HOUR);
      const ran: Kind[] = [];
      await timers.fire(T0 + 2 * HOUR, (kind) => void ran.push(kind));
      return { ran, alarm: await storage.getAlarm() };
    });

    expect(result).toEqual({ ran: ["early", "late"], alarm: null });
  });

  it("fires nothing before any timer is due and keeps the alarm", async () => {
    const result = await withTimers("timers-fire-none", async (timers, storage) => {
      await timers.set("early", T0 + HOUR);
      const ran: Kind[] = [];
      await timers.fire(T0, (kind) => void ran.push(kind));
      return { ran, alarm: await storage.getAlarm() };
    });

    expect(result).toEqual({ ran: [], alarm: T0 + HOUR });
  });

  it("keeps the new time when a timer's handler sets the same timer again", async () => {
    const result = await withTimers("timers-reset-in-handler", async (timers, storage) => {
      await timers.set("early", T0 + HOUR);
      await timers.fire(T0 + HOUR, () => timers.set("early", T0 + 4 * HOUR));
      return { due: timers.get("early"), alarm: await storage.getAlarm() };
    });

    expect(result).toEqual({ due: T0 + 4 * HOUR, alarm: T0 + 4 * HOUR });
  });

  it("keeps a timer whose handler failed, so it can fire again", async () => {
    const result = await withTimers("timers-handler-fails", async (timers) => {
      await timers.set("early", T0 + HOUR);
      const outcome = await timers
        .fire(T0 + HOUR, () => {
          throw new Error("handler failed");
        })
        .then(
          () => "resolved",
          () => "rejected",
        );
      return { outcome, due: timers.get("early") };
    });

    expect(result).toEqual({ outcome: "rejected", due: T0 + HOUR });
  });

  it("keeps timers across hibernation", async () => {
    const name = "timers-hibernate";
    await withTimers(name, (timers) => timers.set("late", T0 + 2 * HOUR));
    await evictDurableObject(env.GameRoom.getByName(name));

    const result = await withTimers(name, async (timers, storage) => ({
      due: timers.get("late"),
      alarm: await storage.getAlarm(),
    }));

    expect(result).toEqual({ due: T0 + 2 * HOUR, alarm: T0 + 2 * HOUR });
  });
});
