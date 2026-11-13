/**
 * How two names on the table's picture share the room between them.
 *
 * At a table of six the far middle seat's name runs right from beside its
 * seat (the lamp hangs where it would otherwise go), onto the lines of the
 * name over the next seat round. Two long names there ran into each other.
 * Pure functions over plain numbers; `table.ts` does the drawing.
 */

/** A name as it will be drawn: its left end, its top, and how wide it is with whatever mark follows it. */
export interface LabelBox {
  x: number;
  y: number;
  width: number;
}

/** What the picture gives its names. */
export interface LabelRoom {
  /** The pixels kept clear between the end of one name and the start of the next, the mark before a name among them. */
  gap: number;
  /** The height a name takes with the line under it: two names less than this apart are on the same lines. */
  lines: number;
  /** Where the picture ends on the right: no name is moved past it. */
  edge: number;
}

/**
 * What it takes for the name `far`, which runs right, to clear the name
 * `next`: how many pixels `next` moves right (`shift`, as far as the picture's
 * edge lets it) and how many `far` then still has to give up (`cut`). Both are
 * 0 where the two do not meet: `next` is on other lines, or to the left.
 */
export function makeRoom(far: LabelBox, next: LabelBox, room: LabelRoom): { shift: number; cut: number } {
  const apart = { shift: 0, cut: 0 };
  if (Math.abs(next.y - far.y) >= room.lines) return apart;
  if (next.x + next.width <= far.x) return apart;
  const over = far.x + far.width + room.gap - next.x;
  if (over <= 0) return apart;
  const shift = Math.min(over, Math.max(0, room.edge - (next.x + next.width)));
  return { shift, cut: over - shift };
}
