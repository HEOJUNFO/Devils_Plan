import { afterEach, describe, expect, it, vi } from "vitest";
import { mailReady, sendLetter, type MailEnv } from "../../../src/server/mail";

/** An environment with all a letter needs, made up for the test. */
const ENV: MailEnv = { RESEND_API_KEY: "key-for-a-test", FEEDBACK_TO: "reader@example.com" };
const LETTER = { subject: "a heading", text: "a text" };

/** A stand-in for the service: records what it was asked and answers with `status`. */
function service(status: number): { ask: typeof fetch; asked: { url: string; init: RequestInit }[] } {
  const asked: { url: string; init: RequestInit }[] = [];
  const ask = (async (url: RequestInfo | URL, init?: RequestInit) => {
    asked.push({ url: String(url), init: init ?? {} });
    return new Response(null, { status });
  }) as typeof fetch;
  return { ask, asked };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("mailReady", () => {
  it("is so with a key and an address", () => {
    expect(mailReady(ENV)).toBe(true);
  });

  it("is not so without the key, or without the address", () => {
    expect(mailReady({})).toBe(false);
    expect(mailReady({ RESEND_API_KEY: "key-for-a-test" })).toBe(false);
    expect(mailReady({ FEEDBACK_TO: "reader@example.com" })).toBe(false);
    expect(mailReady({ RESEND_API_KEY: "", FEEDBACK_TO: "" })).toBe(false);
  });
});

describe("sendLetter", () => {
  it("hands the letter to the service with the key, for the address set", async () => {
    const { ask, asked } = service(200);

    const sent = await sendLetter(ENV, LETTER, ask);

    expect(sent).toBe(true);
    expect(asked).toHaveLength(1);
    expect(asked[0].url).toBe("https://api.resend.com/emails");
    expect(asked[0].init.method).toBe("POST");
    expect(asked[0].init.headers).toMatchObject({ authorization: "Bearer key-for-a-test" });
    expect(JSON.parse(String(asked[0].init.body))).toEqual({
      from: "Brain Survival <onboarding@resend.dev>",
      to: ["reader@example.com"],
      subject: "a heading",
      text: "a text",
    });
  });

  it("sends from the sender named, where one is", async () => {
    const { ask, asked } = service(200);

    await sendLetter({ ...ENV, FEEDBACK_FROM: "Game <game@example.com>" }, LETTER, ask);

    expect(JSON.parse(String(asked[0].init.body)).from).toBe("Game <game@example.com>");
  });

  it("asks nothing where no letter can be sent from", async () => {
    const { ask, asked } = service(200);

    const sent = await sendLetter({}, LETTER, ask);

    expect(sent).toBe(false);
    expect(asked).toEqual([]);
  });

  it("says the letter did not go when the service refuses it, and logs neither the letter nor the address", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { ask } = service(403);

    const sent = await sendLetter(ENV, LETTER, ask);

    expect(sent).toBe(false);
    const said = warned.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(said).toContain("403");
    expect(said).not.toContain("reader@example.com");
    expect(said).not.toContain("a text");
  });

  it("says the letter did not go when the service cannot be reached", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ask = (async () => {
      throw new Error("no network");
    }) as unknown as typeof fetch;

    expect(await sendLetter(ENV, LETTER, ask)).toBe(false);
  });
});
