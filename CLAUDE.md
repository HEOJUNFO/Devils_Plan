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

Rules the user set for this project, on 2026-11-11 unless a rule gives another
date. Where they differ from
the framework's defaults in this file, these win. The rule file named under a
rule has the user's own words, the history, and the detail. A part marked
*reading* is the assistant's reading, not the user's words.

- **Multiplayer is the product; bots are a test aid.** Real users are only
  offered games against other people. One basic bot per game that makes legal
  moves and can finish a game, and no more: no skill levels, no bot
  personalities, no single-player screens. Dull or weak bots are not a defect.
  큐브 세기 and 네모 세기 can be started by one player, with no bots; the
  other games cannot. *Reading:* a new game gets a start for one player only
  when the user says so or it is plainly a game one person can play, and the
  report says which. Detail: `.claude/rules/bots.md`.
- **A game is shown under the name the show gives it.** Also where the show
  made the name up ("무거운 13", "미스터리 거래소"). No game is given a name
  of the assistant's own. The rules are used as documented; the show's title,
  logo, cast, set and screen layout are not used. Game ids stay as they are,
  the project is `brain-survival`, and its address is
  `play.brain-survival.workers.dev`. Detail: `.claude/rules/game-names.md`.
- **The game is read in Korean and in English.** Every sentence a player
  reads is there in both; a new game or a new sentence comes with both. A
  screen's sentences are in the `words.ts` beside it, never in the markup or
  the screen's code, and the room sends reasons and events, never sentences.
  *Reading:* English names and terms are those of the show's English release
  where one can be found, else a plain translation that the report names; an
  English sentence is looked at on its 480 by 270 screen, not only
  type-checked. Detail: `.claude/rules/languages.md`.
- **The lobby is a list of rooms.** Before making a room a player sees the
  open rooms and can join one, make one, or enter a code. The user:
  "내가말한로비는 여러방리스트가 있는 로비말한거야". A screen with only a
  nickname and a code is not the lobby.
- **Check what was changed, not everything.** After a change, run the tests
  of the files touched and look at the screen touched. No run of the entire
  test suite, no mutation run over a whole list, no walk through every screen.
  The user: "전체검사는하지마 앞으로도계속 수정한부분에대한 부분검사해
  프로젝트룰에추가". Where this differs from the testing standards in this
  file, this wins. *Reading:* the type check stays (one command of a few
  seconds that cannot be pointed at a part), and CI still runs the whole suite
  on every push. What was not checked is said in the commit and in the report.
- **A screen is looked at with ego-browser or browser-skill.** Browser checks
  (a changed screen, a phone's size, touch) are done with the `ego-browser`
  skill or the `browser-skill` skill (`bsk`). The user, 2026-11-12, when the
  assistant was setting up another browser tool for phone checks: "우리
  에고브라우저랑 브라우저스킬있는데 그거사용하면되지않나? 맞으면
  룰에추가해". It was right: both were tried on the local server that day and
  both stand in for a phone (750 by 340 at 3x, touch, `pointer: coarse`).
  *Reading:* ego-browser first, as its own guide asks; another browser tool
  only for what neither can do, and the report says which tool produced the
  evidence. Neither is a phone: what only a real one shows (Safari, fingers,
  the on-screen keyboard) is reported as not checked. Detail:
  `.claude/rules/browser-checks.md`.
- **A push is on the deployed address within three minutes.** From a push to
  main to the end of the Cloudflare build that deploys it, and of the GitHub
  CI run beside it, no more than three minutes. The user, 2026-11-12, on
  hearing that the last three pushes had taken 1 min 19 s to 2 min 16 s to
  deploy and the CI run 38 to 59 s: "앞으로 3분이넘지않게 고려하게
  프로젝트룰에적용해줘". *Reading:* this is weighed when a change adds to
  what a push runs (tests, a build step, a package to install), not measured
  on every push; after such a push the two times are read from the commit's
  check runs and said in the report. The Cloudflare check gives one time for
  its start and its end, so its length is counted from the start of the
  GitHub run of the same commit. Where a change would take a push past three
  minutes, the user is told before it is pushed, with what could be made
  faster; no test is removed or skipped to keep the time.

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
