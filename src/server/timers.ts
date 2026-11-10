/**
 * Named timers for one Durable Object.
 *
 * A Durable Object has a single alarm. This keeps any number of named timers
 * in SQLite and keeps that one alarm pointed at whichever is due first, so
 * "clear the empty room" and "end this player's turn" can both be pending
 * without overwriting each other.
 *
 * Nothing is held in memory, so timers survive hibernation as they are.
 */
export class Timers<Kind extends string> {
  constructor(private readonly storage: DurableObjectStorage) {
    storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS timers (kind TEXT PRIMARY KEY, due_at INTEGER NOT NULL)",
    );
  }

  /** When `kind` is due, in milliseconds since the epoch, or `null` if it is not set. */
  get(kind: Kind): number | null {
    const rows = this.storage.sql
      .exec<{ due_at: number }>("SELECT due_at FROM timers WHERE kind = ?", kind)
      .toArray();
    return rows[0]?.due_at ?? null;
  }

  /** Sets `kind` to fire at `dueAt`, replacing any earlier time for the same kind. */
  async set(kind: Kind, dueAt: number): Promise<void> {
    this.storage.sql.exec(
      "INSERT INTO timers (kind, due_at) VALUES (?, ?) ON CONFLICT(kind) DO UPDATE SET due_at = excluded.due_at",
      kind,
      Math.floor(dueAt),
    );
    await this.arm();
  }

  /** Cancels `kind`. Does nothing if it is not set. */
  async clear(kind: Kind): Promise<void> {
    this.storage.sql.exec("DELETE FROM timers WHERE kind = ?", kind);
    await this.arm();
  }

  /**
   * Runs `run` for every timer due at or before `now`, earliest first, then
   * points the alarm at the next one. Call this from the alarm handler.
   *
   * A timer is removed only after `run` returns for it. If `run` throws, the
   * timer stays and the platform's alarm retry fires it again, so `run` must
   * be safe to repeat. `run` may set the same kind again (a turn timer starting
   * the next turn's timer); that new time is kept.
   */
  async fire(now: number, run: (kind: Kind) => void | Promise<void>): Promise<void> {
    const due = this.storage.sql
      .exec<{ kind: string; due_at: number }>(
        "SELECT kind, due_at FROM timers WHERE due_at <= ? ORDER BY due_at, kind",
        now,
      )
      .toArray();
    for (const timer of due) {
      await run(timer.kind as Kind);
      // Only the time that fired is removed; a time set by `run` is different.
      this.storage.sql.exec(
        "DELETE FROM timers WHERE kind = ? AND due_at = ?",
        timer.kind,
        timer.due_at,
      );
    }
    await this.arm();
  }

  /** Points the object's alarm at the earliest timer, or removes it if none is set. */
  private async arm(): Promise<void> {
    const next = this.storage.sql
      .exec<{ next: number | null }>("SELECT MIN(due_at) AS next FROM timers")
      .one().next;
    const current = await this.storage.getAlarm();
    if (next === null) {
      if (current !== null) await this.storage.deleteAlarm();
    } else if (current !== next) {
      await this.storage.setAlarm(next);
    }
  }
}
