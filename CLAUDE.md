# Claude Code Game Studios -- Game Studio Agent Architecture

Indie game development managed through 49 coordinated Claude Code subagents.
Each agent owns a specific domain, enforcing separation of concerns and quality.

## Technology Stack

- **Engine**: [CHOOSE: Web / Godot 4 / Unity / Unreal Engine 5]
- **Language**: [CHOOSE: TypeScript / GDScript / C# / C++ / Blueprint]
- **Version Control**: Git with trunk-based development
- **Build System**: [SPECIFY after choosing engine]
- **Asset Pipeline**: [SPECIFY after choosing engine]

> **Note**: Engine-specialist agents exist for Godot, Unity, and Unreal with
> dedicated sub-specialists. Use the set matching your engine.

## Project Rules (Devils_Plan)

Rules the user set for this project. Where they differ from the framework's
defaults in this file, these win.

- **Multiplayer is the product; bots are a test aid.** Real users are only ever
  offered games against other people. Build bots and single-player only as far
  as tests and development need: one basic bot per game that makes legal moves
  and can finish a game. No skill levels, no opponent reading or bluffing, no
  bot personalities, no big tuning tables, no single-player screens or polish.
  Bots that seem dull or weak are not a defect: leave them and spend the time
  on multiplayer. Full rule and its reason: `.claude/rules/bots.md`.
  *A game that one person can play may be started alone.* The user, on
  2026-11-11: "혼자하기가능한것들 혼자하기활성화해줘 지금
  게임시작버튼이비활성화되는경우있는듯 혼자하기가능한게임인데", and then:
  "잔디깔기는혼자하기기능없어야할듯 이걸어케혼자해
  러시안룰렛이랑같이혼자하기버튼이아예없으면될듯". So 큐브 세기 and 네모
  세기 start with one player in the room, and 잔디 깔기 and 러시안 룰렛 have
  no way to be played alone. A game started alone has no bots in it, and the
  rest of this rule stands.
  *Assistant's reading, not the user's words:* the games "that can be played
  alone" are the two counting games, where a player has a problem to solve
  with nobody to race; a new game gets a start for one player only when the
  user says so or it is plainly of that kind, and the report says which.
- **A game is shown under the name the show gives it.** Players see each game
  by the name it has in the show: "러시안 룰렛", not a name made up here (the
  first builds were titled "빈 약실 / Empty Chamber", which the user replaced).
  The user set this on 2026-11-11: "게임이름자체는 데블스플랜이랑 동일하게하자
  그래두 규칙에추가해". It is about the game's name. The rest of what was
  agreed stays: the rules are used exactly as documented, and the show's own
  title, logo, cast, set and screen layout are not used.
  It holds for every game, also where the name is one the show made up for
  that game ("무거운 13", "미스터리 거래소"). The user said so on 2026-11-11,
  when the sixth game had been built under a name made up here ("13 미만"):
  "이름은 무거운13으로해 룰에 게임이름은 방송이름따라하기로했짜나". An earlier
  version of this rule carried a limit the assistant had set for itself, a
  plain name in place of a name the show coined; the user had not asked for
  it, and it is withdrawn. No game is given a name of the assistant's own.
  Game ids (`russian-roulette`, `lay-the-grass`) are not shown to players and
  stay as they are. The Worker's name is shown, as the address: the user chose
  `game-plan` for it on 2026-11-11 ("game-plan으로하자"), in place of
  `empty-chamber`, the name of the first build. `wrangler.jsonc`,
  `package.json` and the browser's storage keys carry it; the folder
  `prototypes/empty-chamber/` keeps its name.
- **The game is read in Korean and in English.** Every sentence a player
  reads is there in both languages. The user, on 2026-11-11:
  "우리프프로젝트 영어지원 하게업데이트하고 프로젝트룰에추가핮".
  *How it is built (the assistant's choices, not the user's words):* a
  screen's sentences are in a `words.ts` beside it, Korean and English side
  by side, taken through `words()` of `src/client/lang.ts`; none is written
  in the markup or in a screen's code. The type check holds the two to one
  shape, so a sentence missing in one language does not compile. A game's
  name and summary are in `src/shared/games.json`, by language. The room
  sends reasons and events, never sentences, so players of one room each
  read it in their own. A new game, or a new sentence, comes with both.
  The page opens in the language its address asks for (`?lang=en`), else the
  one last chosen in that browser, else the browser's, else English; the
  lobby has the button that changes it, which loads the page again.
  *Assistant's reading, not the user's words:* Korean is still the language
  a sentence is written in first, and the English follows it. In English a
  game has the name the show's English release gives it where one can be
  found ("Count the Rectangles", "Count the Cubes", "Lay the Grass"), and its
  terms likewise ("Piece", "Selection", "Monopolize"); where none can be
  found the assistant translates plainly and says so in its report. What
  players type (nicknames, chat) is shown as typed. The screen is a fixed 480
  by 270 pixels, so an English sentence is looked at on the screen it is on,
  not only type-checked. Bots keep their Korean names ("봇 1"): they are a
  test aid (`.claude/rules/bots.md`).
- **The lobby is a list of rooms.** Before making a room a player sees the
  open rooms and can join one, make one, or enter a code. The user, on
  2026-11-11: "내가말한로비는 여러방리스트가 있는 로비말한거야". A screen with
  only a nickname and a code is not the lobby.
- **Check what was changed, not everything.** No whole-project checks: no run
  of the entire test suite, no mutation run over a whole list, no walk through
  every screen. After a change, check the part that was changed: the tests of
  the files touched, the screen that was touched. The user, on 2026-11-11,
  while waiting for a deploy that such runs were holding up: "전체검사는하지마
  앞으로도계속 수정한부분에대한 부분검사해 프로젝트룰에추가". Where this differs
  from the testing standards in this file, this wins.
  *Assistant's reading, not the user's words:* the type check stays, because
  it is one command of a few seconds that cannot be pointed at a part; the
  whole suite still runs on every push, in CI, which is the pipeline's doing
  and not a run made here. What was not checked is said in the commit and in
  the report, never passed over.

## Project Structure

@.claude/docs/directory-structure.md

## Engine Version Reference

<!-- ENGINE-REFERENCE-IMPORT: the line under this comment is engine-specific,
     and there is none until an engine is set. /setup-engine, the grow's record
     step and /project-settings (engine.name) write
     @docs/engine-reference/<engine>/VERSION.md here for the chosen engine. Skills
     that need the pinned version read that file on demand either way. -->


## Technical Preferences

`project.yaml` at the repo root is the primary config store — engine, specialists,
naming, platform, performance, modes. Skills resolve it via `resolve_config`
(see `.claude/docs/config-resolution.md`).

`.claude/docs/technical-preferences.md` is the **legacy fallback**, read on demand
when a key is absent from `project.yaml`. It is not imported here: before
`/setup-engine` runs it is almost entirely `[TO BE CONFIGURED]` placeholders, and
after it runs `project.yaml` holds the real values.

## Coordination Rules

@.claude/docs/coordination-rules.md

## Collaboration Protocol

**User-driven collaboration, not autonomous execution.**
Every task follows: **Question -> Options -> Decision -> Draft -> Approval**

- Agents MUST ask "May I write this to [filepath]?" before using Write/Edit tools
  (exempt: `active.md` appends, agent memory, a subagent's new file at the path
  its orchestrating skill named; see `.claude/rules/agent-memory.md`)
- Agents MUST show drafts or summaries before requesting approval
- Multi-file changes require explicit approval for the full changeset
- No commits without user instruction
- A skipped or dismissed question is not an answer: act on nothing, re-ask in
  plain text and wait
- Started outside this file's folder? Warn first: hooks, deny rules and the
  ask-first mode load only when Claude Code starts here

See `docs/COLLABORATIVE-DESIGN-PRINCIPLE.md` for full protocol and examples.

> **First session?** Say "make me a game" (`/prototype`), or run `/start` to begin
> the guided onboarding flow.

## Coding Standards

@.claude/docs/coding-standards.md

## Context Management

Read `.claude/docs/context-management.md` on demand — it is a reference, not
session context. Two of its conventions are load-bearing and cited by name
elsewhere in the repo, so they are restated here rather than lost:

- **`production/session-state/active.md` is the session checkpoint.** The file is
  the memory, not the conversation. Read it first after any compaction, crash, or
  `/clear`.
- **Helpers in `.claude/scripts/` emit observations, never verdicts.** A script
  that scores or judges will eventually contradict a mode or override it cannot
  see. (Cited by `artifact-check.sh` and `adr-dep-graph.sh`.)
