/**
 * The room's voice chat, on this page: the microphone, one direct connection
 * to every other player in voice, and how loud each of them is.
 *
 * The room only says who is in voice and passes the players' signals to each
 * other (`src/shared/voice.ts`); the sound goes from browser to browser. Of
 * two players, the one in the lower slot calls and the other answers, so the
 * two never call each other at once.
 */
import type { RtcSignal, VoiceConfig, VoiceMark, VoiceMember } from "../shared/voice";

/** What this page sends the room about voice. */
type Outgoing = { type: "voice"; on: boolean; muted: boolean } | { type: "rtc"; to: number; signal: RtcSignal };

/** The room's voice chat as this page takes part in it. */
export interface Voice {
  /** Whether this page is in the voice chat. */
  readonly on: boolean;
  /** Whether this page's microphone is off. It is when the page has none. */
  readonly muted: boolean;
  /** Whether this page was given a microphone; without one it only listens. */
  readonly hasMic: boolean;
  /** Comes into the voice chat. Asks for the microphone; refused one, comes in to listen. Call from a click. */
  join(): Promise<void>;
  /** Goes out of it, hangs up on everyone and lets go of the microphone. */
  leave(): void;
  /** Says again to the room that this page is in voice: after the connection to the room came back. */
  announce(): void;
  setMuted(muted: boolean): void;
  /** The room said who is in voice. `me` is this player's own slot. */
  members(list: readonly VoiceMember[], me: number): void;
  /** Another player's signal, passed on by the room. */
  signal(from: number, signal: RtcSignal): void;
  /** How the player in `slot` stands in the voice chat right now. */
  mark(slot: number): VoiceMark;
}

interface Peer {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  /** Listens to how loud the other player is; there once their sound has arrived. */
  analyser: AnalyserNode | null;
  /** Candidates that came before the description they belong to. */
  early: RTCIceCandidateInit[];
}

/** How loud a voice has to be to count as speaking, of 1, and how long the mark stays after it, in ms. */
const SPEAKING_LEVEL = 0.02;
const SPEAKING_HOLD_MS = 350;
/** How long after a connection fails the caller tries again, in ms. */
const RETRY_MS = 2000;

/** Makes the page's part of the voice chat. Nothing is asked of the browser until {@link Voice.join}. */
export function createVoice(options: {
  config: VoiceConfig;
  send(message: Outgoing): void;
  /** Called when what the page shows about voice may have changed. */
  changed(): void;
  /** For development: a quiet tone instead of a microphone, so two tabs can be seen to connect. */
  fakeMic: boolean;
}): Voice {
  let on = false;
  let muted = false;
  let me = -1;
  let local: MediaStream | null = null;
  let context: AudioContext | null = null;
  let own: AnalyserNode | null = null;
  let known = new Map<number, boolean>();
  const peers = new Map<number, Peer>();
  const lastLoud = new Map<number, number>();
  const samples = new Uint8Array(256);

  function level(analyser: AnalyserNode | null): number {
    if (analyser === null) return 0;
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
    return Math.sqrt(sum / samples.length);
  }

  function listen(stream: MediaStream): AnalyserNode | null {
    if (context === null) return null;
    const analyser = context.createAnalyser();
    analyser.fftSize = samples.length;
    context.createMediaStreamSource(stream).connect(analyser);
    return analyser;
  }

  function hangUp(slot: number): void {
    const peer = peers.get(slot);
    if (peer === undefined) return;
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.close();
    peer.audio.srcObject = null;
    peers.delete(slot);
  }

  function connectTo(slot: number): Peer {
    hangUp(slot);
    const pc = new RTCPeerConnection({ iceServers: [{ urls: options.config.stunUrls }] });
    const audio = new Audio();
    audio.autoplay = true;
    const peer: Peer = { pc, audio, analyser: null, early: [] };
    peers.set(slot, peer);
    // with no microphone, still ask to hear
    if (local !== null) for (const track of local.getTracks()) pc.addTrack(track, local);
    else pc.addTransceiver("audio", { direction: "recvonly" });
    pc.onicecandidate = (event) => {
      const found = event.candidate;
      if (found === null) return;
      options.send({
        type: "rtc",
        to: slot,
        signal: { kind: "ice", candidate: found.candidate, mid: found.sdpMid, line: found.sdpMLineIndex },
      });
    };
    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      // a stream has to be playing in an element for its sound to reach the meter too
      audio.srcObject = stream;
      void audio.play().catch(() => undefined);
      peer.analyser = listen(stream);
    };
    pc.onconnectionstatechange = () => {
      // the caller tries again; the other side answers whatever comes
      if (pc.connectionState !== "failed" || peers.get(slot) !== peer) return;
      setTimeout(() => {
        if (on && peers.get(slot) === peer && known.has(slot) && me < slot) void call(slot);
      }, RETRY_MS);
    };
    return peer;
  }

  async function call(slot: number): Promise<void> {
    const peer = connectTo(slot);
    try {
      await peer.pc.setLocalDescription(await peer.pc.createOffer());
      const sdp = peer.pc.localDescription?.sdp;
      if (sdp !== undefined && peers.get(slot) === peer) options.send({ type: "rtc", to: slot, signal: { kind: "offer", sdp } });
    } catch {
      // a connection closed under us while it was being made: the next list of members calls again
    }
  }

  async function take(peer: Peer, candidate: RTCIceCandidateInit): Promise<void> {
    try {
      await peer.pc.addIceCandidate(candidate);
    } catch {
      // a candidate for a connection that has since been replaced
    }
  }

  async function answer(from: number, sdp: string): Promise<void> {
    // a new call from someone already connected replaces the old connection
    const peer = connectTo(from);
    try {
      await peer.pc.setRemoteDescription({ type: "offer", sdp });
      for (const candidate of peer.early.splice(0)) await take(peer, candidate);
      await peer.pc.setLocalDescription(await peer.pc.createAnswer());
      const local = peer.pc.localDescription?.sdp;
      if (local !== undefined && peers.get(from) === peer) options.send({ type: "rtc", to: from, signal: { kind: "answer", sdp: local } });
    } catch {
      hangUp(from);
    }
  }

  async function openMic(): Promise<MediaStream | null> {
    if (options.fakeMic && context !== null) {
      const tone = context.createOscillator();
      const quiet = context.createGain();
      const out = context.createMediaStreamDestination();
      tone.frequency.value = 330;
      quiet.gain.value = 0.2;
      tone.connect(quiet).connect(out);
      tone.start();
      return out.stream;
    }
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      // no microphone, or the player said no: they can still listen
      return null;
    }
  }

  function sync(): void {
    if (!on) return;
    for (const slot of [...peers.keys()]) if (!known.has(slot)) hangUp(slot);
    for (const slot of known.keys()) {
      if (slot === me || peers.has(slot)) continue;
      // the lower slot calls; the higher waits to be called
      if (me < slot) void call(slot);
    }
  }

  return {
    get on(): boolean {
      return on;
    },
    get muted(): boolean {
      return muted;
    },
    get hasMic(): boolean {
      return local !== null;
    },
    async join(): Promise<void> {
      if (on) return;
      context = new AudioContext();
      local = await openMic();
      own = local === null ? null : listen(local);
      muted = local === null;
      on = true;
      options.send({ type: "voice", on: true, muted });
      options.changed();
      sync();
    },
    leave(): void {
      if (!on) return;
      on = false;
      for (const slot of [...peers.keys()]) hangUp(slot);
      for (const track of local?.getTracks() ?? []) track.stop();
      local = null;
      own = null;
      void context?.close().catch(() => undefined);
      context = null;
      muted = false;
      lastLoud.clear();
      options.send({ type: "voice", on: false, muted: false });
      options.changed();
    },
    announce(): void {
      if (on) options.send({ type: "voice", on: true, muted });
    },
    setMuted(value: boolean): void {
      if (!on || local === null) return;
      muted = value;
      for (const track of local.getAudioTracks()) track.enabled = !value;
      options.send({ type: "voice", on: true, muted });
      options.changed();
    },
    members(list: readonly VoiceMember[], mine: number): void {
      me = mine;
      known = new Map(list.map((member) => [member.slot, member.muted]));
      sync();
      options.changed();
    },
    signal(from: number, signal: RtcSignal): void {
      if (!on || from === me) return;
      if (signal.kind === "offer") {
        void answer(from, signal.sdp);
        return;
      }
      const peer = peers.get(from);
      if (peer === undefined) return;
      if (signal.kind === "ice") {
        const candidate: RTCIceCandidateInit = { candidate: signal.candidate, sdpMid: signal.mid, sdpMLineIndex: signal.line };
        if (peer.pc.remoteDescription === null) peer.early.push(candidate);
        else void take(peer, candidate);
        return;
      }
      void peer.pc
        .setRemoteDescription({ type: "answer", sdp: signal.sdp })
        .then(async () => {
          for (const candidate of peer.early.splice(0)) await take(peer, candidate);
        })
        .catch(() => undefined);
    },
    mark(slot: number): VoiceMark {
      const isMuted = slot === me && on ? muted : known.get(slot);
      if (isMuted === undefined) return "out";
      if (isMuted) return "muted";
      // how loud others are is only known to a page that is in voice itself
      const analyser = slot === me ? own : (peers.get(slot)?.analyser ?? null);
      const now = performance.now();
      if (level(analyser) > SPEAKING_LEVEL) lastLoud.set(slot, now);
      return now - (lastLoud.get(slot) ?? -SPEAKING_HOLD_MS) < SPEAKING_HOLD_MS ? "speaking" : "in";
    },
  };
}
