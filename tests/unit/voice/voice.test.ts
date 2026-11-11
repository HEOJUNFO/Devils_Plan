import { describe, expect, it } from "vitest";
import { frugalSdp, parseRtcSignal, voiceOffered, type VoiceConfig } from "../../../src/shared/voice";

/** A rate no browser asks for by itself, so that it is seen to come from the config. */
const RATE = 23000;

/** Small limits, so each is reached with a short text. */
function voiceConfig(overrides: Partial<VoiceConfig> = {}): VoiceConfig {
  return {
    listedRooms: false,
    stunUrls: [],
    maxSdpLength: 20,
    maxCandidateLength: 10,
    maxMidLength: 4,
    opus: { dtx: true, maxAverageBitrate: RATE },
    ...overrides,
  };
}

/** A description as a browser writes it, cut down to the lines that matter here: `voice` is what it says of the voice codec. */
function description(voice: string[], end = "\r\n"): string {
  return ["v=0", "m=audio 9 UDP/TLS/RTP/SAVPF 111 63 9", "a=rtpmap:111 opus/48000/2", ...voice, "a=rtpmap:63 red/48000/2", "a=fmtp:63 111/111", "a=rtpmap:9 G722/8000", ""].join(end);
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

describe("frugalSdp", () => {
  it("asks that silence not be sent and that the voice be sent at the configured rate", () => {
    const sdp = description(["a=fmtp:111 minptime=10;useinbandfec=1"]);

    const asked = frugalSdp(sdp, voiceConfig());

    expect(asked).toBe(description([`a=fmtp:111 minptime=10;useinbandfec=1;usedtx=1;maxaveragebitrate=${RATE}`]));
  });

  it("says so in a line of its own when the description has none for the voice codec", () => {
    const asked = frugalSdp(description([]), voiceConfig());

    expect(asked).toBe(description([`a=fmtp:111 usedtx=1;maxaveragebitrate=${RATE}`]));
  });

  it("puts its own values in place of what the description says of the two", () => {
    const sdp = description(["a=fmtp:111 usedtx=0;minptime=10;maxaveragebitrate=510000"]);

    const asked = frugalSdp(sdp, voiceConfig());

    expect(asked).toBe(description([`a=fmtp:111 usedtx=1;minptime=10;maxaveragebitrate=${RATE}`]));
  });

  it("asks only for what is configured", () => {
    const sdp = description(["a=fmtp:111 minptime=10"]);

    expect(frugalSdp(sdp, voiceConfig({ opus: { dtx: true, maxAverageBitrate: 0 } }))).toBe(description(["a=fmtp:111 minptime=10;usedtx=1"]));
    expect(frugalSdp(sdp, voiceConfig({ opus: { dtx: false, maxAverageBitrate: RATE } }))).toBe(description([`a=fmtp:111 minptime=10;maxaveragebitrate=${RATE}`]));
    expect(frugalSdp(sdp, voiceConfig({ opus: { dtx: false, maxAverageBitrate: 0 } }))).toBe(sdp);
  });

  it("keeps the line endings the description came with", () => {
    const asked = frugalSdp(description(["a=fmtp:111 minptime=10"], "\n"), voiceConfig());

    expect(asked).toBe(description([`a=fmtp:111 minptime=10;usedtx=1;maxaveragebitrate=${RATE}`], "\n"));
  });

  it("leaves a description without the voice codec as it is", () => {
    const sdp = ["v=0", "m=audio 9 UDP/TLS/RTP/SAVPF 9", "a=rtpmap:9 G722/8000", ""].join("\r\n");

    expect(frugalSdp(sdp, voiceConfig())).toBe(sdp);
  });
});
