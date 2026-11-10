import { describe, expect, it } from "vitest";
import type { RtcSignal } from "../../../src/shared/voice";
import voiceConfig from "../../../src/shared/voice-config.json";
import { closeAll, join, roomOf, type MessageOf, type TestClient } from "../support";

type VoiceMessage = MessageOf<"voice">;

/** A signal the size of a real one's first line; the room does not read what is in it. */
const OFFER: RtcSignal = { kind: "offer", sdp: "v=0 an offer" };
const ANSWER: RtcSignal = { kind: "answer", sdp: "v=0 an answer" };
const CANDIDATE: RtcSignal = { kind: "ice", candidate: "candidate:1 1 udp 1 192.0.2.1 9 typ host", mid: "0", line: 0 };

/** Connects to `room` and joins as player `player`. */
function open(room: string, player: number, create = false, listed = false): Promise<TestClient> {
  return join(room, { player, create, listed });
}

/** Brings players into voice one after another and waits until everyone has the list of them. */
async function intoVoice(clients: TestClient[], who: number[]): Promise<void> {
  for (const n of who) clients[n].send({ type: "voice", on: true, muted: false });
  await Promise.all(clients.map((client) => client.voiceWhere((voice) => voice.members.length === who.length)));
}

const slots = (voice: VoiceMessage): number[] => voice.members.map((member) => member.slot);

describe("GameRoom: voice", () => {
  it("offers voice in a room reached by its code, and says so to its players", async () => {
    const a = await open("VAAAA", 0, true);

    expect(await a.nextOf("lobby")).toMatchObject({ voice: true });
    a.close();
  });

  it("tells someone who comes in that nobody is in voice yet", async () => {
    const a = await open("VAAAB", 0, true);

    expect(await a.nextOf("voice")).toEqual({ type: "voice", room: "VAAAB", members: [] });
    a.close();
  });

  it("tells everyone in the room when a player comes into voice", async () => {
    const clients = await roomOf("VAAAC", 3);

    clients[1].send({ type: "voice", on: true, muted: false });

    const seen = await Promise.all(clients.map((client) => client.voiceWhere((voice) => voice.members.length === 1)));
    for (const voice of seen) expect(voice).toEqual({ type: "voice", room: "VAAAC", members: [{ slot: 1, muted: false }] });
    closeAll(clients);
  });

  it("lists the players in voice in the order of their slots", async () => {
    const clients = await roomOf("VAAAD", 3);

    clients[2].send({ type: "voice", on: true, muted: false });
    clients[0].send({ type: "voice", on: true, muted: true });

    const voice = await clients[1].voiceWhere((seen) => seen.members.length === 2);
    expect(voice.members).toEqual([
      { slot: 0, muted: true },
      { slot: 2, muted: false },
    ]);
    closeAll(clients);
  });

  it("says when a player switches their microphone off and on", async () => {
    const clients = await roomOf("VAAAE", 2);
    await intoVoice(clients, [0]);

    clients[0].send({ type: "voice", on: true, muted: true });
    const off = await clients[1].voiceWhere((voice) => voice.members[0]?.muted === true);
    clients[0].send({ type: "voice", on: true, muted: false });
    const on = await clients[1].voiceWhere((voice) => voice.members[0]?.muted === false);

    expect(off.members).toEqual([{ slot: 0, muted: true }]);
    expect(on.members).toEqual([{ slot: 0, muted: false }]);
    closeAll(clients);
  });

  it("takes a player out of voice when they ask", async () => {
    const clients = await roomOf("VAAAF", 2);
    await intoVoice(clients, [0, 1]);

    clients[0].send({ type: "voice", on: false, muted: false });

    expect(slots(await clients[1].voiceWhere((voice) => voice.members.length === 1))).toEqual([1]);
    closeAll(clients);
  });

  it("takes a player out of voice when their connection drops", async () => {
    const clients = await roomOf("VAAAG", 2);
    await intoVoice(clients, [0, 1]);

    clients[0].close();

    expect(slots(await clients[1].voiceWhere((voice) => voice.members.length === 1))).toEqual([1]);
    clients[1].close();
  });

  it("takes a player out of voice when they leave the room", async () => {
    const clients = await roomOf("VAAAH", 2);
    await intoVoice(clients, [0, 1]);

    clients[0].send({ type: "leave" });

    expect(slots(await clients[1].voiceWhere((voice) => voice.members.length === 1))).toEqual([1]);
    clients[1].close();
  });

  it("tells someone who comes in later who is in voice", async () => {
    const clients = await roomOf("VAAAJ", 2);
    await intoVoice(clients, [1]);

    const late = await open("VAAAJ", 2);

    expect((await late.nextOf("voice")).members).toEqual([{ slot: 1, muted: false }]);
    closeAll([...clients, late]);
  });

  it("passes a signal on to the player it is for, and to nobody else", async () => {
    const clients = await roomOf("VAAAK", 3);
    await intoVoice(clients, [0, 1, 2]);

    clients[0].send({ type: "rtc", to: 2, signal: OFFER });
    clients[2].send({ type: "rtc", to: 0, signal: ANSWER });
    clients[0].send({ type: "rtc", to: 2, signal: CANDIDATE });

    expect(await clients[2].nextOf("rtc")).toEqual({ type: "rtc", from: 0, signal: OFFER });
    expect(await clients[0].nextOf("rtc")).toEqual({ type: "rtc", from: 2, signal: ANSWER });
    expect(await clients[2].nextOf("rtc")).toEqual({ type: "rtc", from: 0, signal: CANDIDATE });
    expect(clients[1].raw.join("\n")).not.toContain('"rtc"');
    closeAll(clients);
  });

  it("says who a signal is from by the sender's own slot, whatever the signal claims", async () => {
    const clients = await roomOf("VAAAL", 3);
    await intoVoice(clients, [0, 1, 2]);

    clients[1].sendRaw(JSON.stringify({ type: "rtc", to: 2, from: 0, signal: OFFER }));

    expect(await clients[2].nextOf("rtc")).toEqual({ type: "rtc", from: 1, signal: OFFER });
    closeAll(clients);
  });

  it("passes nothing on from a player who is not in voice", async () => {
    const clients = await roomOf("VAAAM", 3);
    await intoVoice(clients, [1, 2]);

    clients[0].send({ type: "rtc", to: 2, signal: OFFER });
    clients[1].send({ type: "rtc", to: 2, signal: ANSWER });

    expect(await clients[2].nextOf("rtc")).toEqual({ type: "rtc", from: 1, signal: ANSWER });
    closeAll(clients);
  });

  it("passes nothing on to a player who is not in voice", async () => {
    const clients = await roomOf("VAAAN", 3);
    await intoVoice(clients, [0, 1]);

    clients[0].send({ type: "rtc", to: 2, signal: OFFER });
    clients[0].send({ type: "rtc", to: 1, signal: ANSWER });

    expect(await clients[1].nextOf("rtc")).toEqual({ type: "rtc", from: 0, signal: ANSWER });
    expect(clients[2].raw.join("\n")).not.toContain('"rtc"');
    closeAll(clients);
  });

  it("passes on nothing that is not a signal, or that is too large to be one", async () => {
    const clients = await roomOf("VAAAP", 2);
    await intoVoice(clients, [0, 1]);

    clients[0].sendRaw(JSON.stringify({ type: "rtc", to: 1, signal: { kind: "hangup" } }));
    clients[0].sendRaw(JSON.stringify({ type: "rtc", to: 1, signal: { kind: "offer", sdp: "x".repeat(voiceConfig.maxSdpLength + 1) } }));
    clients[0].sendRaw(JSON.stringify({ type: "rtc", to: "1", signal: OFFER }));
    clients[0].send({ type: "rtc", to: 1, signal: CANDIDATE });

    expect(await clients[1].nextOf("rtc")).toEqual({ type: "rtc", from: 0, signal: CANDIDATE });
    closeAll(clients);
  });

  it("keeps a signal inside the room it was sent in", async () => {
    const here = await roomOf("VAAAQ", 2);
    const there = await roomOf("VAAAR", 2);
    await intoVoice(here, [0, 1]);
    await intoVoice(there, [0, 1]);

    here[0].send({ type: "rtc", to: 1, signal: OFFER });

    expect(await here[1].nextOf("rtc")).toEqual({ type: "rtc", from: 0, signal: OFFER });
    expect(there[1].raw.join("\n")).not.toContain('"rtc"');
    closeAll([...here, ...there]);
  });

  it("does not offer voice in a room on the list, where strangers come in", async () => {
    const clients = await roomOf("VAAAS", 2, true);

    clients[0].send({ type: "voice", on: true, muted: false });

    expect(await clients[0].nextOf("refused")).toEqual({ type: "refused", reason: "voice-not-here" });
    expect(clients[1].raw.join("\n")).toContain('"voice":false');
    closeAll(clients);
  });

  it("passes no signals on in a room on the list", async () => {
    const clients = await roomOf("VAAAT", 2, true);
    clients[0].send({ type: "voice", on: true, muted: false });
    clients[1].send({ type: "voice", on: true, muted: false });
    await clients[1].nextOf("refused");

    clients[0].send({ type: "rtc", to: 1, signal: OFFER });
    clients[0].send({ type: "chat", text: "after the signal" });

    await clients[1].nextOf("chat");
    expect(clients[1].raw.join("\n")).not.toContain('"rtc"');
    closeAll(clients);
  });

  it("ends the voice chat when the room is put on the list", async () => {
    const clients = await roomOf("VAAAU", 2);
    await intoVoice(clients, [0, 1]);

    clients[0].send({ type: "listing", listed: true });

    expect((await clients[1].voiceWhere((voice) => voice.members.length === 0)).members).toEqual([]);
    clients[0].send({ type: "rtc", to: 1, signal: OFFER });
    clients[0].send({ type: "chat", text: "after the signal" });
    await clients[1].nextOf("chat");
    expect(clients[1].raw.join("\n")).not.toContain('"rtc"');
    closeAll(clients);
  });

  it("offers voice again when the room is taken off the list", async () => {
    const clients = await roomOf("VAAAV", 2, true);

    clients[0].send({ type: "listing", listed: false });
    await clients[1].voiceWhere((voice) => voice.members.length === 0);
    clients[1].send({ type: "voice", on: true, muted: false });

    expect(slots(await clients[0].voiceWhere((voice) => voice.members.length === 1))).toEqual([1]);
    closeAll(clients);
  });

  it("never sends a player anyone's token with the list or a signal", async () => {
    const clients = await roomOf("VAAAW", 2);
    await intoVoice(clients, [0, 1]);
    clients[0].send({ type: "rtc", to: 1, signal: OFFER });
    await clients[1].nextOf("rtc");

    const sent = clients.flatMap((client) => client.raw).join("\n");

    expect(sent).not.toContain("player-token");
    closeAll(clients);
  });
});
