/**
 * The national flags of 만국기 (Flags Around the World).
 *
 * Design: design/games/flags-around-the-world.md. A flag is known by the two
 * letters of its country (ISO 3166-1). `flags.json` lists them: the 193
 * member states of the United Nations, and no other flag. Their pictures are
 * one sheet (`public/flags-v1.png`, drawn by `tools/flag-sprite.mjs` in the
 * order of the list), a cell a flag, so a flag's place in the list is its
 * place on the sheet. The show's own pictures are not used.
 *
 * Two pairs of flags cannot be told apart at this size (`twins`): a round
 * never has both flags of a pair in it.
 */
import flagsJson from "./flags.json";

/** Every flag there is, by the letters of its country, in the order of the sheet. */
export const FLAG_IDS: readonly string[] = flagsJson.ids;

/** How large a flag is on the sheet, in pixels: every one four by three, whatever the flag's own proportions. */
export const FLAG_CELL: readonly [width: number, height: number] = [flagsJson.cell[0], flagsJson.cell[1]];

/** Where the sheet is served from. */
export const FLAG_SHEET: string = flagsJson.sheet;

/** The pairs of flags that look the same. */
export const FLAG_TWINS: readonly (readonly string[])[] = flagsJson.twins;

const PLACE = new Map(FLAG_IDS.map((id, at) => [id, at]));

/** Whether there is a flag `id`. */
export const isFlag = (id: unknown): id is string => typeof id === "string" && PLACE.has(id);

/** Where the flag `id` is on the sheet: the left and top of its cell, in pixels; `null` for a flag there is not. */
export function flagSpot(id: string): [x: number, y: number] | null {
  const at = PLACE.get(id);
  if (at === undefined) return null;
  return [(at % flagsJson.columns) * FLAG_CELL[0], Math.floor(at / flagsJson.columns) * FLAG_CELL[1]];
}

/** The flags that look the same as `id`: none for most. */
export function twinsOf(id: string): string[] {
  return FLAG_TWINS.filter((pair) => pair.includes(id)).flatMap((pair) => pair.filter((each) => each !== id));
}
