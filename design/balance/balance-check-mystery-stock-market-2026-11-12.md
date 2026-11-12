## Balance Check: 미스터리 거래소

Date: 2026-11-12. Run by `/balance-check` through a subagent; nothing in the repository was changed by it. The scripts and their output are not in the repository (they were written to the session's scratch folder).

**Method.**
- The scripts import the game's own `prices.ts`, `rulebook.ts`, `logo.ts`, `rules.ts` and `config.json`, bundled with `esbuild` and run with node.
- **Light simulator**: built on the game's own `nextPrices()`, fast enough to search with. Checked against the real engine two ways: 80 random-plan games (both rulebooks) with 0 mismatches in final assets, and 29 of the best plans found replayed through `createGame`/`applyAction`/`moveOn`, all 29 identical.
- **Real engine**: the steel and CoyoTech scenarios below ran in `rules.ts` itself.
- **Search**: the "best found" numbers come from a hill-climb over per-round, per-stock actions (3 restarts of 1,500 steps a seed). It is a heuristic: a lower bound, not a proven best.
- **The large numbers assume a player who knows the rules from round 1.** Real players learn them at rounds 5, 10, 15 and 20, and play much more weakly before that (see Progression).

### Data Sources Analyzed
- `src/shared/games/mystery-stock-market/config.json`: FOUND
- `src/shared/games/mystery-stock-market/rules.ts`, `prices.ts`, `rulebook.ts`, `logo.ts`: FOUND
- `design/games/mystery-stock-market.md`: FOUND ("Rules as shown", "판마다 새 규칙", "What the show does not give a room", "Known limits", "Checked")
- `design/registry/entities.yaml`: FOUND, with no entry for this game
- `design/balance/` (before this file), `design/gdd/`: ABSENT
- Also read: `host.ts`, `bot-config.json`, `src/shared/room-config.json`, the pace code of `src/server/room.ts`, `src/client/games/mystery-stock-market/screen.ts` (awards)

### Health Summary: CRITICAL ISSUES

Both first-match triggers apply.
- **Degenerate strategies**: a player who knows the rules dominates every other choice.
- **No sink**: a sale is paid by the exchange, not by another player, so every sale above a purchase price makes cash, and nothing takes cash out.

Some findings follow from the show's own sentences and some from values this project filled in. Each is marked.

### Outliers Detected
| Item/Value | Expected Range | Actual | Issue |
|---|---|---|---|
| (none against a stated range) | | | |

- The show's numbers match the design record's "Rules as shown" (read, not simulated): 24 rounds, 300 s a round, 100,000 to start, start price 10,000, floor 100, reveals at 5/10/15/20, secrets for 2 rounds, a piece 10,000 until round 20, awards at 1.5M/3M/6M, prize at 10M, and the seven rules' numbers.
- The drawn ranges match the table of "판마다 새 규칙" (read).
- The design record states ranges for inputs only and no target for outcomes, so the extremes below are findings, not outliers.

### Degenerate Strategies Found

1. **The steel floor (the show's own sentence; already in the design record's known limits).**
   - Mechanism (read): the price is 10,000 minus 200 a share held, until it is held at 100. From there every share sold adds 200, so the price climbs far above where it began.
   - Real engine, the show's rules, seed 7: the others each put all their cash into steel in round 1; one player holding cash buys 1,300 at 100 in round 2, sells half in round 3 and the rest in round 4.

     | Players | What happens |
     |---|---|
     | 2, 3, 4 | Steel falls only to 7,400, 4,800 or 2,200. The floor is not reached and the waiting player stays at 130,000. |
     | 5, 6, 16 | Four or more all-in buyers take steel to 100. Its price then goes 100, 130,100, 260,100. The waiting player ends with **84,630,000** (651 times the start) and passes the 10M prize at the start of round 4. Each of the others ends with 3,381,300. |
   - If nobody pushes the price down, nothing happens: everyone waiting for the floor stays at 130,000.

2. **CoyoTech, waiting and then selling and buying back (the show's own sentence; real engine).**
   - Mechanism: with nobody buying, the price falls 700 a round to about 200 by round 15. The player buys 1,300 there, then each round sells and buys back the same shares so that its bought count beats 후자전자's. The show has no fee and no limit on quantity, so this costs nothing.
   - Result, seed 7, with 2, 6 and 16 players, the others holding cash: 130,000 to **9,230,000** (71 times) by round 24: first place, the 6M award, just under the 10M prize.

3. **The floor in the default rulebook, "판마다 새 규칙" (values this project filled in).**
   - Why it is large: the drawn steps in won are 800 to 2,000 a round up and 500 to 1,500 down, against a floor of 100. A stock nobody trades sinks to 100, and a player who controls its rule's condition buys there and sees the price rise 9 to 20 times in one round. The condition can be met by selling and buying back the same shares, by holding, by buying one more share a round, or by the player's own secret.
   - Simulation, 300 seeds, a rule-aware search, 2 players, the other holding cash: 10M is reached in 300 of 300 seeds. Median 2.05e13, lowest 2.4e7. Without selling-and-buying-back, 299 of 300. Without that and without the secret, 299 of 300: no single lever is the cause.
   - Against others who trade:

     | Others | Seeds reaching 10M | Median of the best found |
     |---|---|---|
     | 1 like the test bot | 300 of 300 | 2.8e12 |
     | 5 like the test bot | 295 of 300 | 6.6e10 |
     | 15 like the test bot | 290 of 300 | 1.8e10 |
     | 5 all-in on one stock | 297 of 300 | 1.1e13 |
     | 15 all-in on one stock | 300 of 300 | 8.6e12 |
   - 10M is first reached at a median of round 15 (earliest 9).
   - A plain strategy with no search (hold one stock with everything; each round hold, buy one more, or sell and buy back): the best such per seed has a median of 629,200 and a highest of 10,333,687; 5 of 300 seeds reach ten times the start. This is the careful lower figure.

4. **Numbers past what the engine counts exactly (simulated and read).** Prices and cash are plain numbers with no cap. In 98 of 300 seeds the best play goes above 9.007e15, where sums stop being exact. How the screen, the room and the stored game behave there was not tried.

5. **Money comes in and never leaves (read from `rules.ts`).** A buy takes cash and a sale adds shares times price, with no other side to the trade. The fixed inflow is 3 pieces of 10,000 a player. There is no fee, tax or cap. The awards are a label on the results screen and feed nothing. A piece not turned into cash counts for nothing at the end, so turning in all three is always right.

6. **Stocks that only fall.** With nobody trading (300 fresh seeds, 2,100 stocks): 1,693 (81%) offer no gain from buying and selling, and 1,212 end at the floor. With a rule-aware player, only 42 of 2,100 (2%) offered none. So almost every stock can be lifted by someone who knows its rule, and most are a trap for someone who does not.

### Progression Analysis

The show's rules, seed 7, 2 players, the other holding cash (light simulator). Assets at the start of rounds 1, 5, 10, 15, 20, 24 and at the end:
- Holding cash: 130,000 throughout.
- Holding 후자전자: 130,000, 208,000, 305,500, 403,000, 500,500, 578,500, 598,000 (4.6 times).
- Best found: as holding until round 15 (403,000), then 24,082,500 at round 20 and 571,788,425,704 at round 24. It passes 10M at round 18.

Fresh rules, 300 seeds, the median of the best found:

| Round | Median assets |
|---|---|
| 1 | 130,000 |
| 5 | 183,495 |
| 10 | 328,900 |
| 15 | 16,141,488 |
| 20 | 2,300,866,118 |
| 24 | 1,998,741,256,200 |

How simple strategies spread (300 fresh seeds each):

| Others | Median of holding one stock (mean of the 7) | Median of the best of the 7 holds | Median of the best found |
|---|---|---|---|
| Holding cash (any number) | 118,597 | 504,400 | 2.05e13 |
| 5 like the test bot | 139,310 | 504,400 | 6.6e10 |
| 15 like the test bot | 145,229 | 431,600 | 1.8e10 |
| 15 all-in on one stock | 107,059 | 473,200 | 8.6e12 |

- Holding cash is exactly 130,000 everywhere.
- The worst of the seven holds has a median of 1,300: the stock sits at the floor.
- Others, with the searching player idle: players like the test bot end at a median of 86,000 to 100,000; a player all-in on one stock at 7,878 with six players and 3,900 with sixteen.

### Recommendations
| Priority | Issue | Suggested Fix | Impact |
|---|---|---|---|
| 1 | The floor in the fresh rules (steps of 800 to 2,000 up and 500 to 1,500 down against a floor of 100) | **Values this project filled in.** Make the won ranges smaller, or make a step a share of the current price. Also leave out the kinds one player can control alone (holding more than a stock nobody else holds, net buying, volume), or have them name a stock others trade too. | Takes most of the riskless loops out of the default rulebook. No rule of the show changes. |
| 2 | Money has no way out | **A rule of the show** ("no fee"). A fee, a limit on shares an order or a round, or a cap on a price changes the show's market: the user's decision. | Stops cash being made from nothing, at the cost of the show's market. |
| 3 | The steel floor | **A rule of the show** (its sentence and the floor). Leave as documented, or keep counting what the floor cut off so the price cannot jump from it. The user's decision. | Removes the one-move win in rooms of five or more. |
| 4 | Numbers above 9.007e15 | Neither the show's nor a filled-in value: an engineering guard (a cap, or exact integers). | Keeps sums exact. |
| 5 | Untraded stocks sink to the floor (81% of stocks) | **A value this project filled in** (the drawn range of steps down). Raise the start price or lower that range. | A stock is worth watching before round 15. |
| 6 | A piece is worth nothing unless turned into cash | **A rule of the show** (what a piece is worth) with this project's three pieces at the start. Leave, or count unused pieces. | Removes a choice that is always right. |

### Values That Need Attention
Every value is "no stated range — not judged" unless the design record gives a number it was checked against.
- `rounds`, `roundSeconds`, `startCash`, `startPrice`, `floorPrice`, `revealRounds`, `secretRounds`, `pieceCash`, `pieceRounds`, `awards`, `prizeAssets` and the seven `rules` numbers: copied from the show and equal to the design record. No range for outcomes is stated: not judged.
- `pieces` (3): the design record marks it guessed. No stated range — not judged.
- `logo.*`: guessed. No stated range — not judged. The path stays between 1,000 and 40,000 and is no part of the loops above.
- `draw.*`: guessed. The ranges equal the design record's table; no range for outcomes — not judged. The ones the findings turn on are `draw.wonUp`, `draw.wonDown`, `draw.selfPercent` (50) and the drawn kinds.

### Not checked
- People reacting to each other, or several rule-aware players at once.
- The room's limit on messages (80 moves in 10 s) against the trades these strategies need: read, not tried.
- What the screens, the stored game and the room do at very large numbers.
- Learning the hidden rules: every large number assumes the rules are known from round 1.
- No repository test was run by the check.
- The counts for the fresh rules come from a heuristic search over seeds 0 to 299: a lower bound, not a proof.

### Changes after the check (2026-11-12, same day; not committed with this file)

The user chose recommendation 1 ("추천하는대로해결해줘"). Only the drawn ranges of the fresh rules changed (`draw` in `config.json`); no rule of the show, no code, and the same nine kinds.

| Range | Was | Now |
|---|---|---|
| `wonUp` | 800 to 2,000 | 400 to 1,500 |
| `wonDown` | 500 to 1,500 | 100 to 300 |
| `percentUp` | 8 to 20 | 5 to 15 |
| `percentDown` | 5 to 15 | 3 to 8 |
| `perShare` | 100 to 300 | 1 to 2 |

Measured by a subagent with the same simulator and search, seeds 0 to 299 (the search is a lower bound and is not converged):

| | Before | After |
|---|---|---|
| Seeds reaching 10M, the other holding cash | 300 of 300 | 0 of 300 |
| Median, lowest, highest of the best found | 2.05e13, 2.4e7, over 1e84 | 1,691,800, 359,020, 7,019,900 |
| Seeds reaching 10M, 5 others like the test bot | 295 of 300 | 0 of 300 |
| A search eight times as long, 100 seeds: reaching 10M, median | not run | 1 of 100, 3.03M |
| Untraded stocks ending at the floor | 1,212 of 2,100 | 0 |
| Untraded stocks with no gain | 1,693 of 2,100 | 1,693 of 2,100 |
| Holding one stock, the best of seven, median | 504,400 | 442,000 |
| Largest number seen | over 1e84 | 13.2M |

Left as it was, and why:
- **Untraded stocks still only fall, eight in ten** (finding 6). The sentences say "otherwise it falls"; ranges change how far (median 5,200 instead of 100), not whether.
- **`per-share` is nearly still at 1 to 2 won** (a range of 13 won over a game with six bots). It is the one kind that stays explosive at any lively value: at 5 to 15 won some seeds still passed 10M by buying another stock to push this one down and back. Keeping it lively means taking it out of the drawn kinds, which changes the kinds and was not done.
- **The show's rulebook** (findings 1 and 2, the steel floor and CoyoTech), the missing sink (5), unused pieces, and exact integers (4, no longer reached in the fresh rules): untouched. The first three are the show's rules and the user's decision.

Checked: `isValidConfig` takes the block; 40 of 40 best plans replayed through the real engine gave the simulator's assets; the game's unit tests and `tests/integration/market` (429 tests) pass; the local smoke check's part for this game, 16 of 16. Not checked: the rule board on its screen with the new numbers (the widths are held by the `rule-words` test), several rule-aware players, people.

**Later the same day: `per-share` is no longer drawn** (the user: "추천하는대로해"; taking it out was the session's recommendation, because at 1 to 2 won the rule did not move). Eight kinds, six a game; `draw.perShare` is gone. Measured again by a subagent, seeds 0 to 299, the same search:

| | With `per-share` at 1 to 2 | Without it |
|---|---|---|
| Seeds reaching 10M, the other holding cash | 0 of 300 | 0 of 300 |
| Median, lowest, highest of the best found | 1,691,800, 359,020, 7,019,900 | 1,829,700, 464,364, 6,594,288 |
| Seeds reaching 10M, 5 others like the test bot | 0 of 300 | 1 of 300 (11.6M, at the last settlement) |
| A search eight times as long, 100 seeds: reaching 10M | 1 and 0 | 1 and 2 |
| Untraded stocks with no gain, at the floor | 1,693 and 0 of 2,100 | 1,673 and 0 |
| Holding one stock, the best of seven, median | 442,000 | 504,400 |
| Best plans replayed through the real engine | 40 of 40 | 800 of 800 |

Every seed past 10M does it by the emblem: the search knows the stock's whole path from round 1 and is all-in for each rising leg (the one such seed before the change was the same). The harness has no scripted attack for the eight kinds left, and the seeds are not the same games as before (taking a kind out changes every draw).

Re-run `/balance-check` after fixes to verify.
