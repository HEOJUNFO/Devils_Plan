import { describe, expect, it } from "vitest";
import {
  MAX_CLIENT_MESSAGE_LENGTH,
  parseClientMessage,
  parseServerMessage,
} from "../../../src/shared/protocol";

/** A well-formed join request as the browser sends it. */
function joinJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "join",
    token: "player-token-0001",
    nick: "ann",
    create: false,
    ...overrides,
  });
}

describe("parseClientMessage", () => {
  it("reads a join with its token, nickname and create flag", () => {
    expect(parseClientMessage(joinJson({ create: true }))).toEqual({
      type: "join",
      token: "player-token-0001",
      nick: "ann",
      create: true,
    });
  });

  it("treats a join without a create flag as not creating", () => {
    const raw = JSON.stringify({ type: "join", token: "player-token-0001", nick: "ann" });

    expect(parseClientMessage(raw)).toMatchObject({ create: false });
  });

  it("treats any create value other than true as not creating", () => {
    expect(parseClientMessage(joinJson({ create: "1" }))).toMatchObject({ create: false });
  });

  it("rejects a join whose token is not a string", () => {
    expect(parseClientMessage(joinJson({ token: 12345 }))).toBeNull();
  });

  it("rejects a join without a nickname", () => {
    expect(parseClientMessage(JSON.stringify({ type: "join", token: "t" }))).toBeNull();
  });

  it("drops fields the protocol does not define", () => {
    expect(parseClientMessage(JSON.stringify({ type: "leave", slot: 3 }))).toEqual({
      type: "leave",
    });
  });

  it("rejects a message of an unknown type", () => {
    expect(parseClientMessage(JSON.stringify({ type: "shoot" }))).toBeNull();
  });

  it("rejects text that is not JSON", () => {
    expect(parseClientMessage("join please")).toBeNull();
  });

  it("rejects JSON that is not an object", () => {
    expect(parseClientMessage('["join"]')).toBeNull();
  });

  it("rejects binary data", () => {
    expect(parseClientMessage(new ArrayBuffer(8))).toBeNull();
  });

  it("accepts a message exactly at the length limit", () => {
    const base = joinJson({ nick: "" });
    const raw = joinJson({ nick: "n".repeat(MAX_CLIENT_MESSAGE_LENGTH - base.length) });

    expect(raw).toHaveLength(MAX_CLIENT_MESSAGE_LENGTH);
    expect(parseClientMessage(raw)).not.toBeNull();
  });

  it("rejects a message one character over the length limit", () => {
    const base = joinJson({ nick: "" });
    const raw = joinJson({ nick: "n".repeat(MAX_CLIENT_MESSAGE_LENGTH - base.length + 1) });

    expect(parseClientMessage(raw)).toBeNull();
  });
});

describe("parseServerMessage", () => {
  it("reads an error with its reason", () => {
    const raw = JSON.stringify({ type: "error", reason: "full" });

    expect(parseServerMessage(raw)).toEqual({ type: "error", reason: "full" });
  });

  it("rejects a message of an unknown type", () => {
    expect(parseServerMessage(JSON.stringify({ type: "hello" }))).toBeNull();
  });
});
