/**
 * The table's sounds, made in the browser with Web Audio: no audio files.
 * Sound starts on the player's first input, as browsers require, and M mutes.
 */

/** How loud everything is, 0 to 1. */
const VOLUME = 0.5;

let context: AudioContext | null = null;
let output: GainNode | null = null;
let muted = false;
/** The noise's own sequence, so a shot sounds the same every time. */
let hiss = 12345;

/** Starts sound; call from a key press or a click. */
export function startAudio(): void {
  if (context === null) {
    context = new AudioContext();
    output = context.createGain();
    output.gain.value = muted ? 0 : VOLUME;
    output.connect(context.destination);
  }
  if (context.state === "suspended") void context.resume();
}

/** Whether sound is muted. */
export function isMuted(): boolean {
  return muted;
}

/** Mutes or unmutes everything. */
export function setMuted(value: boolean): void {
  muted = value;
  if (output !== null) output.gain.value = value ? 0 : VOLUME;
}

function tone(freq: number, seconds: number, type: OscillatorType = "square", volume = 0.3, at = 0, slideTo = 0): void {
  if (context === null || output === null || muted) return;
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
  if (context === null || output === null || muted) return;
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
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, "triangle", 0.2, i * 0.11)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.22, "sawtooth", 0.14, i * 0.16)),
};
