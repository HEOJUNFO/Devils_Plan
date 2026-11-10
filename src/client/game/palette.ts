/**
 * The table's colours. Design: design/game-brief.md (Look and references):
 * amber for the lamp and whoever's turn it is, crimson for a live round and
 * danger, teal for an empty chamber and safety, ink-navy for the room, bone
 * for text.
 */
export const C = {
  ink: "#0a0b14",
  night: "#0d1020",
  bar: "#0b0d19",
  wall: "#151a30",
  wallD: "#0f1326",
  floor: "#221d2c",
  floorD: "#1a1623",
  rug: "#3a1822",
  rugL: "#52232f",
  rugD: "#2a1119",
  wood: "#6b4428",
  woodH: "#8a5c36",
  woodD: "#4a2e1b",
  woodDD: "#2f1c10",
  steel: "#7c8296",
  steelH: "#aab0c2",
  steelD: "#4b5066",
  steelDD: "#2c3044",
  hatch: "#353a50",
  brass: "#d9a441",
  brassH: "#ffe39a",
  brassD: "#8c5c1c",
  amber: "#ffb43c",
  amberD: "#b8741f",
  crim: "#e23b4a",
  crimD: "#8f1f30",
  teal: "#3fd0b6",
  tealD: "#1c7d73",
  bone: "#efe6cc",
  boneD: "#a8a08a",
  dim: "#7d7a8c",
  btn: "#171a2a",
  btnH: "#262b40",
} as const;

/** The same colour, darker (`factor` under 1) or lighter. */
export function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * factor)));
  return `#${((1 << 24) | (channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).slice(1)}`;
}
