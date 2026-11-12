import { describe, expect, it } from "vitest";
import shipped from "../../../src/shared/sound-config.json";
import { firstVolume, gainOf, stepped, volumeFrom, volumeText, withMute, type Volume, type VolumeConfig } from "../../../src/shared/volume";

/** Three levels to hear and silence, starting on the middle one. */
const CONFIG: VolumeConfig = { gains: [0, 0.25, 0.5, 1], start: 2 };
const SILENT = 0;
const QUIET = 1;
const LOUDEST = CONFIG.gains.length - 1;

/** A choice of `level`, never muted. */
function at(level: number): Volume {
  return { level, loud: level };
}

describe("firstVolume", () => {
  it("is the level the config starts on", () => {
    expect(firstVolume(CONFIG)).toEqual(at(CONFIG.start));
  });
});

describe("stepped", () => {
  it("goes one louder", () => {
    expect(stepped(at(QUIET), CONFIG)).toEqual(at(QUIET + 1));
  });

  it("goes from the loudest to silence, remembering the loudest", () => {
    expect(stepped(at(LOUDEST), CONFIG)).toEqual({ level: SILENT, loud: LOUDEST });
  });

  it("goes from silence to the quietest", () => {
    expect(stepped({ level: SILENT, loud: LOUDEST }, CONFIG)).toEqual(at(QUIET));
  });

  it("comes round to where it began after as many steps as there are levels", () => {
    const begun = at(CONFIG.start);
    let volume = begun;
    for (let i = 0; i < CONFIG.gains.length; i++) volume = stepped(volume, CONFIG);

    expect(volume).toEqual(begun);
  });
});

describe("withMute", () => {
  it("is silence, and comes back to the level it had", () => {
    const muted = withMute(at(LOUDEST), true);

    expect(muted.level).toBe(SILENT);
    expect(withMute(muted, false)).toEqual(at(LOUDEST));
  });

  it("changes nothing when unmuting what was not muted", () => {
    expect(withMute(at(QUIET), false)).toEqual(at(QUIET));
  });
});

describe("gainOf", () => {
  it("is the gain of the level", () => {
    expect(gainOf(at(QUIET), CONFIG)).toBe(CONFIG.gains[QUIET]);
    expect(gainOf({ level: SILENT, loud: QUIET }, CONFIG)).toBe(0);
  });
});

describe("volumeFrom", () => {
  it("reads back what volumeText wrote", () => {
    for (const volume of [at(QUIET), at(LOUDEST), { level: SILENT, loud: QUIET }]) {
      expect(volumeFrom(volumeText(volume), CONFIG)).toEqual(volume);
    }
  });

  it("is the first choice with nothing kept", () => {
    expect(volumeFrom(null, CONFIG)).toEqual(firstVolume(CONFIG));
  });

  it("is the first choice for what is not a choice", () => {
    const beyond = CONFIG.gains.length;
    for (const stored of ["", "1", "a,b", "1,2,3", "-1,1", "1.5,1", `${beyond},${beyond}`, "0,0", `${QUIET},${LOUDEST}`]) {
      expect(volumeFrom(stored, CONFIG), stored).toEqual(firstVolume(CONFIG));
    }
  });
});

describe("the shipped config", () => {
  it("begins with silence, grows louder, and starts on a level that is heard", () => {
    const gains: readonly number[] = shipped.gains;

    expect(gains[0]).toBe(0);
    expect([...gains].sort((a, b) => a - b)).toEqual([...gains]);
    expect(Math.max(...gains)).toBeLessThanOrEqual(1);
    expect(shipped.start).toBeGreaterThan(0);
    expect(shipped.start).toBeLessThan(gains.length);
  });
});
