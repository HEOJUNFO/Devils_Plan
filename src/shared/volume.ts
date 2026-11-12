/**
 * How loud the game's sounds are: one of a few levels the player steps
 * through, the first of which is silence, and what a mute comes back to.
 *
 * The page keeps the choice in the browser, so a player who turned the sound
 * down finds it down the next time. Pure functions over plain values.
 */

/** Tunable values. Loaded from `sound-config.json`. */
export interface VolumeConfig {
  /** How loud each level is, 0 to 1, quietest first. The first is silence. */
  gains: readonly number[];
  /** The level a player who never chose one hears. */
  start: number;
}

/** A player's choice. */
export interface Volume {
  /** Which of the levels is on; 0 is silence. */
  level: number;
  /** The level a mute comes back to: the last one that was not silence. */
  loud: number;
}

/** Whether `level` is one of the levels that can be heard. */
function heard(level: number, config: VolumeConfig): boolean {
  return Number.isInteger(level) && level > 0 && level < config.gains.length;
}

/** The choice of a player who never made one. */
export function firstVolume(config: VolumeConfig): Volume {
  return { level: config.start, loud: config.start };
}

/**
 * The choice kept as `stored` (`volumeText`). Anything that is not one, or
 * names a level there is not, is the choice of a player who never made one.
 */
export function volumeFrom(stored: string | null, config: VolumeConfig): Volume {
  const parts = (stored ?? "").split(",");
  if (parts.length !== 2 || parts.some((part) => !/^\d+$/.test(part))) return firstVolume(config);
  const [level, loud] = parts.map(Number);
  if (!heard(loud, config) || (level !== 0 && level !== loud)) return firstVolume(config);
  return { level, loud };
}

/** `volume` as it is kept in the browser. */
export function volumeText(volume: Volume): string {
  return `${volume.level},${volume.loud}`;
}

/** The next level after `volume`: one louder, and after the loudest, silence. */
export function stepped(volume: Volume, config: VolumeConfig): Volume {
  const level = (volume.level + 1) % config.gains.length;
  return { level, loud: level === 0 ? volume.loud : level };
}

/** `volume` muted, or brought back to the level it had before it was. */
export function withMute(volume: Volume, muted: boolean): Volume {
  return { level: muted ? 0 : volume.loud, loud: volume.loud };
}

/** How loud `volume` is, 0 to 1. */
export function gainOf(volume: Volume, config: VolumeConfig): number {
  return config.gains[volume.level] ?? 0;
}
