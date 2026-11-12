import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QUICK_WORDS } from "../../../src/shared/chat";
import chatConfig from "../../../src/shared/chat-config.json";
import type { ClientMessage } from "../../../src/shared/protocol";
import { advanceClock, closeAll, connect, join, roomOf, type TestClient } from "../support";

/** Connects to `room` and joins as player `player`. */
function open(room: string, player: number, create = false): Promise<TestClient> {
  return join(room, { player, create });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("GameRoom: chat", () => {
  it("passes a line on to everyone in the room, the speaker included", async () => {
    const clients = await roomOf("CAAAA", 3);

    clients[1].say("안녕하세요");

    const seen = await Promise.all(clients.map((client) => client.nextOf("chat")));
    for (const line of seen) {
      expect(line).toMatchObject({ type: "chat", room: "CAAAA", from: 1, nick: "p1", text: "안녕하세요" });
    }
    closeAll(clients);
  });

  it("stamps a line with when the room got it", async () => {
    const clients = await roomOf("CAAAB", 1);
    const before = Date.now();

    clients[0].say("hi");

    const line = await clients[0].nextOf("chat");
    expect(line.at).toBeGreaterThanOrEqual(before);
    expect(line.at).toBeLessThanOrEqual(Date.now());
    closeAll(clients);
  });

  it("names the speaker by their slot and nickname, whatever the line claims", async () => {
    const clients = await roomOf("CAAAC", 2);

    clients[1].send({ type: "chat", text: "hi", from: 0, nick: "p0" } as ClientMessage);

    expect(await clients[0].nextOf("chat")).toMatchObject({ from: 1, nick: "p1", text: "hi" });
    closeAll(clients);
  });

  it("cleans a line before passing it on", async () => {
    const clients = await roomOf("CAAAD", 2);

    clients[0].say("  여러\n줄\u0000  ");

    expect((await clients[1].nextOf("chat")).text).toBe("여러 줄");
    closeAll(clients);
  });

  it("cuts a line that is too long", async () => {
    const clients = await roomOf("CAAAE", 2);

    clients[0].say("가".repeat(chatConfig.maxLength + 30));

    expect((await clients[1].nextOf("chat")).text).toBe("가".repeat(chatConfig.maxLength));
    closeAll(clients);
  });

  it("passes on nothing for a line with nothing in it", async () => {
    const clients = await roomOf("CAAAF", 2);

    clients[0].say("   ");
    clients[0].say("real");

    expect((await clients[1].nextOf("chat")).text).toBe("real");
    closeAll(clients);
  });

  it("keeps the lines in the order they were said", async () => {
    const clients = await roomOf("CAAAG", 2);

    clients[0].say("one");
    clients[0].say("two");
    clients[0].say("three");

    const texts = [
      (await clients[1].nextOf("chat")).text,
      (await clients[1].nextOf("chat")).text,
      (await clients[1].nextOf("chat")).text,
    ];
    expect(texts).toEqual(["one", "two", "three"]);
    closeAll(clients);
  });

  it("refuses a player who sends lines too fast, and tells only them", async () => {
    const clients = await roomOf("CAAAH", 2);

    for (let n = 0; n <= chatConfig.burst; n++) clients[0].say(`line ${n}`);

    expect(await clients[0].nextOf("refused")).toEqual({ type: "refused", reason: "chat-too-fast" });
    clients[1].say("from the other");
    const heard: string[] = [];
    for (;;) {
      const line = await clients[1].nextOf("chat");
      heard.push(line.text);
      if (line.from === 1) break;
    }
    expect(heard).toEqual([...Array.from({ length: chatConfig.burst }, (_, n) => `line ${n}`), "from the other"]);
    expect(clients[1].raw.join("\n")).not.toContain("refused");
    closeAll(clients);
  });

  it("lets a player speak again once the window has passed", async () => {
    const clients = await roomOf("CAAAJ", 2);
    for (let n = 0; n <= chatConfig.burst; n++) clients[0].say(`line ${n}`);
    await clients[0].nextOf("refused");
    advanceClock(chatConfig.windowSeconds * 1000 + 1);

    clients[0].say("after the wait");

    for (;;) {
      const line = await clients[1].nextOf("chat");
      if (line.text === "after the wait") break;
    }
    closeAll(clients);
  });

  it("counts each player's lines apart", async () => {
    const clients = await roomOf("CAAAK", 2);
    for (let n = 0; n <= chatConfig.burst; n++) clients[0].say(`line ${n}`);
    await clients[0].nextOf("refused");

    clients[1].say("mine");

    for (;;) {
      const line = await clients[0].nextOf("chat");
      if (line.from === 1) {
        expect(line.text).toBe("mine");
        break;
      }
    }
    closeAll(clients);
  });

  it("passes a word said with one press on to everyone, as which word it was", async () => {
    const clients = await roomOf("CAAAT", 3);
    const [word] = QUICK_WORDS;

    clients[1].send({ type: "quick", word });

    const seen = await Promise.all(clients.map((client) => client.nextOf("quick")));
    for (const said of seen) expect(said).toMatchObject({ type: "quick", room: "CAAAT", from: 1, nick: "p1", word });
    closeAll(clients);
  });

  it("passes on nothing for a word that is not one of them", async () => {
    const clients = await roomOf("CAAAU", 2);
    const [, word] = QUICK_WORDS;

    clients[0].send({ type: "quick", word: "a sentence of my own" } as unknown as ClientMessage);
    clients[0].send({ type: "quick", word });

    expect((await clients[1].nextOf("quick")).word).toBe(word);
    expect(clients[1].raw.join("\n")).not.toContain("a sentence of my own");
    closeAll(clients);
  });

  it("counts a word said with one press with the lines typed: the two together are no faster than lines alone", async () => {
    const clients = await roomOf("CAAAV", 2);
    const [word] = QUICK_WORDS;

    for (let n = 0; n < chatConfig.burst; n++) clients[0].say(`line ${n}`);
    clients[0].send({ type: "quick", word });

    expect(await clients[0].nextOf("refused")).toEqual({ type: "refused", reason: "chat-too-fast" });
    expect(clients[1].raw.join("\n")).not.toContain('"quick"');
    closeAll(clients);
  });

  it("says nothing to a connection that has not joined, and hears nothing from it", async () => {
    const clients = await roomOf("CAAAL", 1);
    const lurker = await connect("CAAAL");

    lurker.say("let me in");
    clients[0].say("hello");

    expect((await clients[0].nextOf("chat")).text).toBe("hello");
    expect(lurker.raw).toEqual([]);
    closeAll([...clients, lurker]);
  });

  it("keeps a line inside the room it was said in", async () => {
    const here = await roomOf("CAAAM", 1);
    const there = await roomOf("CAAAN", 1);

    here[0].say("only here");
    there[0].say("only there");

    expect((await here[0].nextOf("chat")).text).toBe("only here");
    expect((await there[0].nextOf("chat")).text).toBe("only there");
    expect(there[0].raw.join("\n")).not.toContain("only here");
    closeAll([...here, ...there]);
  });

  it("lets someone watching a game speak to the table", async () => {
    const clients = await roomOf("CAAAP", 1);
    clients[0].send({ type: "start", bots: true });
    await clients[0].nextOf("game");
    const watcher = await open("CAAAP", 7);
    await watcher.nextOf("game");

    watcher.say("구경 왔어요");

    expect(await clients[0].nextOf("chat")).toMatchObject({ from: 1, nick: "p7", text: "구경 왔어요" });
    closeAll([...clients, watcher]);
  });

  it("gives someone who comes in later nothing that was said before", async () => {
    const clients = await roomOf("CAAAQ", 1);
    clients[0].say("said before");
    await clients[0].nextOf("chat");

    const late = await open("CAAAQ", 1);
    await late.lobbyOf(2);
    clients[0].say("said after");

    expect((await late.nextOf("chat")).text).toBe("said after");
    expect(late.raw.join("\n")).not.toContain("said before");
    closeAll([...clients, late]);
  });

  it("stores nothing that is said", async () => {
    const stub = env.GameRoom.getByName("CAAAR");
    const clients = await roomOf("CAAAR", 1);

    clients[0].say("a secret plan");
    await clients[0].nextOf("chat");

    const stored = await runInDurableObject(stub, (_room, state) =>
      state.storage.sql.exec<{ v: string }>("SELECT v FROM room_state").toArray().map((row) => row.v),
    );
    expect(stored.join("\n")).not.toContain("a secret plan");
    closeAll(clients);
  });

  it("never sends a player anyone's token with a line", async () => {
    const clients = await roomOf("CAAAS", 2);

    clients[0].say("hi");
    await Promise.all(clients.map((client) => client.nextOf("chat")));

    const sent = clients.flatMap((client) => client.raw).join("\n");
    expect(sent).not.toContain("player-token");
    closeAll(clients);
  });
});
