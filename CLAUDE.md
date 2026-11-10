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
- **A game is shown under the name the show gives it.** Players see each game
  by the name it has in the show: "러시안 룰렛", not a name made up here (the
  first builds were titled "빈 약실 / Empty Chamber", which the user replaced).
  The user set this on 2026-11-11: "게임이름자체는 데블스플랜이랑 동일하게하자
  그래두 규칙에추가해". It is about the game's name. The rest of what was
  agreed stays: the rules are used exactly as documented, and the show's own
  title, logo, cast, set and screen layout are not used.
  *Assistant's own limit, not the user's rule:* a name that is an everyday term
  ("러시안 룰렛", "양자택일") is used as it is; a name the show coined for its
  game ("무거운 13", "미스터리 거래소") is not copied by the assistant, which
  gives a plain name instead and says so in its report.
  Code names are not shown to players and stay as they are (`empty-chamber` in
  `wrangler.jsonc`, `package.json` and the browser's storage keys): the
  deployed Worker and its address go by that name.
- **The lobby is a list of rooms.** Before making a room a player sees the
  open rooms and can join one, make one, or enter a code. The user, on
  2026-11-11: "내가말한로비는 여러방리스트가 있는 로비말한거야". A screen with
  only a nickname and a code is not the lobby.

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
