/**
 * Russian Roulette as a room hosts it: `session.ts` with the shipped config
 * put in, in the shape every game gives the room (`hosting.ts`).
 */
import type { GameHost } from "../hosting";
import roomConfig from "../room-config.json";
import {
  sessionAction,
  sessionPresence,
  sessionSnapshot,
  sessionTimeout,
  startSession,
  type MoveRefusal,
  type Session,
  type SessionConfig,
  type StartRefusal,
} from "../session";
import botConfig from "./bot-config.json";
import hostConfig from "./host-config.json";
import { parseAction } from "./rules";
import rulesConfig from "./rules-config.json";
import tableSizes from "./table-sizes.json";

const config: SessionConfig = {
  rules: rulesConfig,
  sizes: tableSizes,
  bots: botConfig,
  awayTurnSeconds: roomConfig.awayTurnSeconds,
  standSeconds: hostConfig.standSeconds,
  passSeconds: hostConfig.passSeconds,
};

/** The version of a stored game this code can carry on with. */
const VERSION = 2;

/** Russian Roulette, for a room to host. */
export const rouletteHost: GameHost<Session, StartRefusal | MoveRefusal> = {
  start: (current, players, request, presence) =>
    startSession(
      current,
      players,
      { by: request.by, bots: request.bots },
      { allowBots: request.allowBots, seed: request.seed, now: request.now, chance: request.chance },
      presence,
      // the length of a turn is the room's own setting; the rest of the rules are the game's
      { ...config, rules: { ...config.rules, turnSeconds: request.turnSeconds } },
    ),
  act: (session, token, raw, presence, now) => {
    const action = parseAction(raw);
    if (action === null) return { ok: false, reason: "bad-action" };
    return sessionAction(session, token, action, presence, now, config);
  },
  tick: (session, presence, now) => sessionTimeout(session, presence, now, config),
  attend: (session, presence, now) => sessionPresence(session, presence, now, config),
  view: sessionSnapshot,
  running: (session) => session.state.phase !== "ended",
  holdsPlace: (session, token) => session.tokens.includes(token),
  // the awaited move's own clock, or the end of the pause before the room passes for a player with no credits
  deadline: (session) => {
    const passAt = session.passAt ?? null;
    if (session.deadline === null) return passAt;
    return passAt === null ? session.deadline : Math.min(session.deadline, passAt);
  },
  // a number of the room's is used up only as a pause is set, so the pauses tell of those as well
  same: (current, next) =>
    current.state === next.state &&
    current.deadline === next.deadline &&
    current.awaySince === next.awaySince &&
    current.turnStartedAt === next.turnStartedAt &&
    (current.desertedAt ?? null) === (next.desertedAt ?? null) &&
    (current.passAt ?? null) === (next.passAt ?? null),
  usable: (stored) =>
    typeof stored === "object" && stored !== null && (stored as Partial<Session>).state?.version === VERSION,
};
