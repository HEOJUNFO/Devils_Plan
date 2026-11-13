/**
 * The table's sounds, made in the browser with Web Audio: no audio files.
 * Sound starts on the player's first input, as browsers require. M mutes, and
 * how loud it is (`src/shared/volume.ts`) is kept in the browser.
 */
import config from "../../shared/sound-config.json";
import { gainOf, stepped, volumeFrom, volumeText, withMute, type Volume } from "../../shared/volume";
import { storageKey } from "../storage";

/** Where the browser keeps how loud this player has it. */
const STORED = storageKey("sound");

let context: AudioContext | null = null;
let output: GainNode | null = null;
let chosen: Volume = volumeFrom(kept(), config);
/** The noise's own sequence, so a shot sounds the same every time. */
let hiss = 12345;

/** What the browser kept; nothing where it keeps nothing (a private window that refuses, the build's own read of this file). */
function kept(): string | null {
  try {
    return localStorage.getItem(STORED);
  } catch {
    return null;
  }
}

/** Makes `next` how loud it is from here on, and keeps it. */
function turnTo(next: Volume): void {
  chosen = next;
  if (output !== null) output.gain.value = gainOf(chosen, config);
  try {
    localStorage.setItem(STORED, volumeText(chosen));
  } catch {
    // not kept: it holds for this visit
  }
}

/** Starts sound; call from a key press or a click. */
export function startAudio(): void {
  if (context === null) {
    context = new AudioContext();
    output = context.createGain();
    output.gain.value = gainOf(chosen, config);
    output.connect(context.destination);
  }
  if (context.state === "suspended") void context.resume();
}

/** Whether sound is muted. */
export function isMuted(): boolean {
  return chosen.level === 0;
}

/** Mutes everything, or brings it back as loud as it was. */
export function setMuted(value: boolean): void {
  turnTo(withMute(chosen, value));
}

/** Which level the sound is at: 0 is silence, and each one after it is louder. */
export function soundLevel(): number {
  return chosen.level;
}

/** Turns the sound to its next level (after the loudest, silence), lets it be heard, and returns the level. */
export function stepSound(): number {
  turnTo(stepped(chosen, config));
  sfx.pick();
  return chosen.level;
}

function tone(freq: number, seconds: number, type: OscillatorType = "square", volume = 0.3, at = 0, slideTo = 0): void {
  if (context === null || output === null || chosen.level === 0) return;
  const t = context.currentTime + at;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(freq, t);
  if (slideTo > 0) oscillator.frequency.exponentialRampToValueAtTime(slideTo, t + seconds);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
  oscillator.connect(gain).connect(output);
  oscillator.start(t);
  oscillator.stop(t + seconds);
}

function noise(seconds: number, volume: number, lowpass: number): void {
  if (context === null || output === null || chosen.level === 0) return;
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    hiss = (hiss * 16807) % 2147483647;
    data[i] = (hiss / 1073741823.5 - 1) * (1 - i / length) ** 2;
  }
  const source = context.createBufferSource();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();
  source.buffer = buffer;
  filter.type = "lowpass";
  filter.frequency.value = lowpass;
  gain.gain.value = volume;
  source.connect(filter).connect(gain).connect(output);
  source.start();
}

/** One short sound per thing that happens at the table. */
export const sfx = {
  move: () => tone(520, 0.04, "square", 0.1),
  pick: () => tone(660, 0.06, "square", 0.14),
  back: () => tone(300, 0.06, "square", 0.1),
  deny: () => tone(150, 0.14, "sawtooth", 0.16),
  seat: (n: number) => tone(330 + n * 40, 0.05, "triangle", 0.16),
  turn: () => {
    tone(660, 0.07, "triangle", 0.22);
    tone(990, 0.13, "triangle", 0.2, 0.08);
  },
  look: () => {
    tone(420, 0.05, "square", 0.09);
    tone(560, 0.05, "square", 0.09, 0.07);
  },
  empty: () => tone(330, 0.2, "triangle", 0.2, 0.25),
  live: () => {
    tone(880, 0.09, "square", 0.18, 0.25);
    tone(196, 0.3, "sawtooth", 0.16, 0.33);
  },
  ratchet: (clicks: number) => {
    for (let i = 0; i < clicks; i++) tone(1400 - i * 70, 0.03, "square", 0.1, i * 0.07);
  },
  chip: () => {
    tone(1250, 0.04, "triangle", 0.18);
    tone(1650, 0.06, "triangle", 0.14, 0.05);
  },
  /** Credits that did not reach the mark: they stay where they are. */
  stored: () => tone(262, 0.12, "triangle", 0.12, 0.12),
  /** Someone made a hidden action: nothing in the sound says which. */
  hidden: () => {
    tone(294, 0.05, "triangle", 0.13);
    tone(294, 0.07, "triangle", 0.11, 0.1);
  },
  earn: () => {
    tone(520, 0.08, "square", 0.16);
    tone(780, 0.08, "square", 0.16, 0.09);
    tone(1040, 0.14, "square", 0.16, 0.18);
  },
  swap: () => {
    tone(300, 0.25, "sawtooth", 0.14, 0, 900);
    tone(900, 0.25, "sawtooth", 0.1, 0.05, 300);
  },
  out: () => tone(110, 0.35, "sine", 0.4),
  beat: () => {
    tone(62, 0.12, "sine", 0.5);
    tone(58, 0.14, "sine", 0.4, 0.18);
  },
  alarm: () => tone(220, 0.6, "sawtooth", 0.18, 0, 110),
  click: () => {
    tone(2100, 0.02, "square", 0.22);
    tone(420, 0.05, "triangle", 0.18, 0.02);
  },
  bang: () => {
    noise(0.5, 0.9, 2400);
    tone(140, 0.35, "sine", 0.6, 0, 40);
  },
  /** Something in the room is the player's to see, and their tab is behind others (`calling.ts`): two soft notes, rising. */
  call: () => {
    tone(784, 0.12, "triangle", 0.22);
    tone(1175, 0.2, "triangle", 0.2, 0.13);
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, "triangle", 0.2, i * 0.11)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.22, "sawtooth", 0.14, i * 0.16)),
};

/**
 * Makes a phone buzz, briefly, where the browser can (`navigator.vibrate`:
 * Android's browsers; Safari on a phone has none, and a desktop has nothing
 * to shake). For a turn that has become the player's, and for a room that
 * has come to wait on its host alone: a phone's sound is often off. The
 * pattern is `turnBuzz` of the sound's settings, on and off in ms. Not held
 * back by how loud the sound is set: someone who muted the game in a quiet
 * place is who this is for.
 */
export function buzz(): void {
  try {
    navigator.vibrate?.(config.turnBuzz);
  } catch {
    // a browser that refuses: the turn is still said on the screen and by its sound
  }
}
