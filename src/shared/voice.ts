/**
 * Voice chat in a room: who may have it, and what players pass through the
 * room to reach each other.
 *
 * The sound itself never touches the room: players in voice connect to each
 * other directly (WebRTC) and the room only passes along the short messages
 * they need to find each other. A direct connection shows each player's
 * network address to the others, which is fine among friends and not among
 * strangers: so voice is offered in rooms reached by their code, and in rooms
 * on the list only where `listedRooms` says so.
 */

/** Tunable voice values. Loaded from `voice-config.json`. */
export interface VoiceConfig {
  /** Whether rooms on the list of rooms offer voice too. Off: only rooms reached by their code do. */
  listedRooms: boolean;
  /** Servers that tell a browser its own address as others see it, so two browsers can find each other. */
  stunUrls: string[];
  /** Longest session description passed on, in characters. */
  maxSdpLength: number;
  /** Longest candidate line passed on, in characters. */
  maxCandidateLength: number;
  /** Longest media id passed on with a candidate, in characters. */
  maxMidLength: number;
  /**
   * How voices are asked to be sent (see {@link frugalSdp}). A player in voice
   * is connected to every other one, so in a room of sixteen each sends their
   * voice fifteen times over: `dtx` asks that nothing be sent while a player
   * is silent, which is most of the time for most of them, and
   * `maxAverageBitrate` is the most bits a second a voice is sent at (0: as
   * the browser likes). Speech is clear well below what browsers use unasked.
   */
  opus: { dtx: boolean; maxAverageBitrate: number };
}

/** A player in the room's voice chat, as everyone in the room may see them. */
export interface VoiceMember {
  slot: number;
  /** Whether they have switched their microphone off. */
  muted: boolean;
}

/** How a player stands in the voice chat, for the mark beside their name. */
export type VoiceMark = "out" | "in" | "muted" | "speaking";

/**
 * What one player in voice sends another, through the room, so the two can
 * connect directly. The room checks its shape and size and reads nothing
 * else of it.
 */
export type RtcSignal =
  | { kind: "offer" | "answer"; sdp: string }
  | { kind: "ice"; candidate: string; mid: string | null; line: number | null };

/** Whether a room offers voice: one reached by its code always, one on the list only if configured so. */
export function voiceOffered(listed: boolean, config: VoiceConfig): boolean {
  return !listed || config.listedRooms;
}

/**
 * The description `sdp` of the other end of a connection, changed to ask what
 * `config.opus` says of how voice is sent to that end: applied in place of
 * the description as it came, it makes this page send its voice that way.
 * Only the line of the voice codec (Opus) is touched, and added when there
 * is none; a description without that codec comes back as it is.
 */
export function frugalSdp(sdp: string, config: VoiceConfig): string {
  const asked: [string, string][] = [];
  if (config.opus.dtx) asked.push(["usedtx", "1"]);
  if (config.opus.maxAverageBitrate > 0) asked.push(["maxaveragebitrate", `${config.opus.maxAverageBitrate}`]);
  if (asked.length === 0) return sdp;
  // the lines and what ends each, so that the description keeps its own line endings
  const parts = sdp.split(/(\r?\n)/);
  for (let at = 0; at < parts.length; at += 2) {
    const codec = /^a=rtpmap:(\d+) opus\//i.exec(parts[at]);
    if (codec === null) continue;
    const start = `a=fmtp:${codec[1]} `;
    let line = -1;
    for (let other = 0; other < parts.length; other += 2) if (parts[other].startsWith(start)) line = other;
    if (line < 0) {
      // right after the line that names the codec, ended as that line is
      parts.splice(at + 2, 0, `${start}${asked.map(([name, value]) => `${name}=${value}`).join(";")}`, parts[at + 1] ?? "\r\n");
      continue;
    }
    const said = parts[line].slice(start.length).split(";").map((each) => each.trim()).filter((each) => each !== "");
    for (const [name, value] of asked) {
      const found = said.findIndex((each) => each.split("=")[0] === name);
      if (found >= 0) said[found] = `${name}=${value}`;
      else said.push(`${name}=${value}`);
    }
    parts[line] = `${start}${said.join(";")}`;
  }
  return parts.join("");
}

/** Checks a signal, returning `null` for anything malformed or oversized. Only the known fields are kept. */
export function parseRtcSignal(raw: unknown, config: VoiceConfig): RtcSignal | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (data.kind === "offer" || data.kind === "answer") {
    if (typeof data.sdp !== "string" || data.sdp.length === 0 || data.sdp.length > config.maxSdpLength) return null;
    return { kind: data.kind, sdp: data.sdp };
  }
  if (data.kind === "ice") {
    if (typeof data.candidate !== "string" || data.candidate.length > config.maxCandidateLength) return null;
    const mid = data.mid ?? null;
    if (mid !== null && (typeof mid !== "string" || mid.length > config.maxMidLength)) return null;
    const line = data.line ?? null;
    if (line !== null && (typeof line !== "number" || !Number.isInteger(line) || line < 0 || line > 255)) return null;
    return { kind: "ice", candidate: data.candidate, mid, line };
  }
  return null;
}
