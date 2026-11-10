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
