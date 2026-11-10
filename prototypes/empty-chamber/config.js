// PROTOTYPE - NOT FOR PRODUCTION
// Question: 문서 규칙 그대로에 빈칸만 채운 이 판이, 봇 다섯을 상대로도 고민할 거리가 있고 긴장되는가?
// Date: 2026-11-11
// Every tuning value lives here, each with value, min, max and step. The game reads them live
// through tune.<name> (index.html); the tweak panel, an add-on, writes them back here.
window.CONFIG = {
  seed: 28, // every gameplay random call reads rng(), seeded from this (or ?seed= in the address)
  // Rules as the source document gives them
  start_credits: { value: 16, min: 6, max: 30, step: 1 }, // credits each player starts with
  cost_public: { value: 1, min: 1, max: 6, step: 1 },     // credits: public investigation
  cost_private: { value: 2, min: 1, max: 6, step: 1 },    // credits: private investigation
  cost_rot1: { value: 3, min: 1, max: 8, step: 1 },       // credits: turn the muzzle 1 seat
  cost_rot2: { value: 4, min: 1, max: 8, step: 1 },       // credits: turn the muzzle 2 seats
  tamper_need: { value: 6, min: 2, max: 12, step: 1 },    // credits to gather for the swap
  tamper_max: { value: 3, min: 1, max: 6, step: 1 },      // most credits submitted to it in one turn
  bullets: { value: 2, min: 1, max: 4, step: 1 },         // live rounds in the six chambers
  end_out_count: { value: 3, min: 1, max: 5, step: 1 },   // players out of credits that end the game
  // Bots
  bot_think: { value: 0.9, min: 0.2, max: 3, step: 0.1 },            // seconds a bot waits before acting
  bot_mistake_normal: { value: 0.18, min: 0, max: 0.6, step: 0.02 }, // chance of a random move, normal bots
  bot_mistake_hard: { value: 0.02, min: 0, max: 0.6, step: 0.02 },   // the same, expert bots
  bot_private_pref: { value: 0.6, min: 0, max: 1, step: 0.05 },      // normal bots: chance to look privately
  bot_reserve_hard: { value: 4, min: 0, max: 8, step: 1 },           // credits an expert bot keeps back
  bot_flee_hard: { value: 0.3, min: 0, max: 1, step: 0.05 },         // expert bots: chance each turn to move a round it faces before time is short
  bot_stir_hard: { value: 0.6, min: 0, max: 1, step: 0.05 },         // expert bots: chance, when safe from any turn, to show the table where a round is
  // What the table shows
  show_credit_range: { value: 1, min: 0, max: 1, step: 1 }, // 1: under each bot, the credits it can have left, counted from what everyone saw
  // Pacing and look
  fast_mult: { value: 3, min: 1, max: 6, step: 0.5 },      // how much faster the bots' turns go with F on
  anim_time: { value: 0.7, min: 0.2, max: 2, step: 0.1 },  // seconds an action stays on show
  fire_gap: { value: 0.9, min: 0.3, max: 2.5, step: 0.1 }, // seconds between shots at the end
  deal_time: { value: 1.6, min: 0.4, max: 4, step: 0.2 },  // seconds the seat draw takes
  lamp_sway: { value: 3, min: 0, max: 10, step: 0.5 },     // pixels the lamp light swings
  volume: { value: 0.5, min: 0, max: 1, step: 0.05 },
};
