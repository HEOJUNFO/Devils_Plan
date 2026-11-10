import { describe, expect, it } from "vitest";
import { parseRtcSignal, voiceOffered, type VoiceConfig } from "../../../src/shared/voice";

/** Small limits, so each is reached with a short text. */
function voiceConfig(overrides: Partial<VoiceConfig> = {}): VoiceConfig {
  return { listedRooms: false, stunUrls: [], maxSdpLength: 20, maxCandidateLength: 10, maxMidLength: 4, ...overrides };
}

describe("voiceOffered", () => {
  it("offers voice in a room reached by its code", () => {
    expect(voiceOffered(false, voiceConfig())).toBe(true);
    expect(voiceOffered(false, voiceConfig({ listedRooms: true }))).toBe(true);
  });

  it("does not offer voice in a room on the list, where strangers come in", () => {
    expect(voiceOffered(true, voiceConfig())).toBe(false);
  });

  it("offers voice in a room on the list when configured to", () => {
    expect(voiceOffered(true, voiceConfig({ listedRooms: true }))).toBe(true);
  });
});

describe("parseRtcSignal", () => {
  it("reads an offer and an answer", () => {
    expect(parseRtcSignal({ kind: "offer", sdp: "v=0" }, voiceConfig())).toEqual({ kind: "offer", sdp: "v=0" });
    expect(parseRtcSignal({ kind: "answer", sdp: "v=0" }, voiceConfig())).toEqual({ kind: "answer", sdp: "v=0" });
  });

  it("reads a candidate with where it belongs", () => {
    const signal = { kind: "ice", candidate: "candidate", mid: "0", line: 0 };

    expect(parseRtcSignal(signal, voiceConfig())).toEqual(signal);
  });

  it("reads a candidate that does not say where it belongs", () => {
    expect(parseRtcSignal({ kind: "ice", candidate: "c" }, voiceConfig())).toEqual({ kind: "ice", candidate: "c", mid: null, line: null });
  });

  it("reads the empty candidate that ends a list", () => {
    expect(parseRtcSignal({ kind: "ice", candidate: "", mid: "0", line: 0 }, voiceConfig())).toEqual({
      kind: "ice",
      candidate: "",
      mid: "0",
      line: 0,
    });
  });

  it("keeps only the fields of a signal", () => {
    const parsed = parseRtcSignal({ kind: "offer", sdp: "v=0", token: "secret", to: 3 }, voiceConfig());

    expect(parsed).toEqual({ kind: "offer", sdp: "v=0" });
  });

  it("accepts a description exactly as long as allowed, and refuses one longer", () => {
    const config = voiceConfig();

    expect(parseRtcSignal({ kind: "offer", sdp: "s".repeat(config.maxSdpLength) }, config)).not.toBeNull();
    expect(parseRtcSignal({ kind: "offer", sdp: "s".repeat(config.maxSdpLength + 1) }, config)).toBeNull();
  });

  it("accepts a candidate exactly as long as allowed, and refuses one longer", () => {
    const config = voiceConfig();

    expect(parseRtcSignal({ kind: "ice", candidate: "c".repeat(config.maxCandidateLength) }, config)).not.toBeNull();
    expect(parseRtcSignal({ kind: "ice", candidate: "c".repeat(config.maxCandidateLength + 1) }, config)).toBeNull();
  });

  it.each([
    ["a kind nobody has heard of", { kind: "hangup" }],
    ["no kind", { sdp: "v=0" }],
    ["an offer without a description", { kind: "offer" }],
    ["an offer with an empty description", { kind: "offer", sdp: "" }],
    ["a description that is not text", { kind: "answer", sdp: 5 }],
    ["a candidate that is not text", { kind: "ice", candidate: 5 }],
    ["a media id that is not text", { kind: "ice", candidate: "c", mid: 5 }],
    ["a media id that is too long", { kind: "ice", candidate: "c", mid: "audio" }],
    ["a line that is not a whole number", { kind: "ice", candidate: "c", line: 0.5 }],
    ["a line below zero", { kind: "ice", candidate: "c", line: -1 }],
    ["a line that is text", { kind: "ice", candidate: "c", line: "0" }],
    ["text", "offer"],
    ["nothing", null],
  ])("refuses %s", (_what, raw) => {
    expect(parseRtcSignal(raw, voiceConfig())).toBeNull();
  });
});
