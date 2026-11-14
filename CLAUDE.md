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

The user's rules for this project. Where they differ from the framework's
defaults in this file, these win. The file named under a rule has the user's
own words, the date, the history and the detail (there, a part marked
*reading* is the assistant's reading, not the user's words): read it before
acting near a rule's edge.

- **Multiplayer is the product; bots are a test aid.** Real users are only
  offered games against other people. One basic bot per game that makes legal
  moves and can finish a game: no skill levels, bot personalities or
  single-player screens, and dull or weak bots are not a defect. Only 큐브
  세기 and 네모 세기 start with one player, with no bots; a new game does only
  when the user says so or it is plainly one person's game, and the report
  says which. `.claude/rules/bots.md`
- **A game is shown under the name the show gives it**, also where the show
  made the name up ("무거운 13", "미스터리 거래소"); none gets a name of the
  assistant's own. The rules are used as documented; the show's logo, cast,
  set and screen layout are not used. Game ids stay as they are, the project
  is `brain-survival`, the address `play.brain-survival.workers.dev`.
  `.claude/rules/game-names.md`
- **A search for the show finds the site.** The pages a search engine reads
  (`/`, `/ko/`, `/en/`, each game's page of rules: `src/shared/site/words.ts`)
  name the show in their titles, descriptions and opening sentences, as what
  the games are from, and say under it that the site is not the
  broadcaster's. The game's own screens and the picture a shared link shows
  do not carry the show's name. A new game's page does the same.
  `.claude/rules/game-names.md`
- **The game is read in Korean and in English.** Every sentence a player
  reads is there in both; a new one comes with both. A screen's sentences are
  in the `words.ts` beside it, never in the markup or the screen's code, and
  the room sends reasons and events, never sentences. English terms are those
  of the show's English release where found, else a plain translation the
  report names; an English sentence is looked at on its 480 by 270 screen.
  `.claude/rules/languages.md`
- **The lobby is a list of rooms.** Before making a room a player sees the
  open rooms and can join one, make one, or enter a code. The user:
  "내가말한로비는 여러방리스트가 있는 로비말한거야". A screen with only a
  nickname and a code is not the lobby.
- **Check what was changed, not everything.** Run the tests of the files
  touched and look at the screen touched: no whole test suite, no mutation
  run over a whole list, no walk through every screen. The type check stays.
  What was not checked is said in the commit and in the report.
  `.claude/rules/checks.md`
- **The integration tests are not run here.** Nothing under
  `tests/integration` is run on this machine, not one file by name either. A
  change to the server is checked by the type check, the unit tests of the
  files touched and the screen. An integration test added or changed is
  pushed unseen, and the commit and the report say so. After a push, CI's
  result is read and reported, and a failure there is fixed before anything
  else. `.claude/rules/checks.md`
- **A screen is looked at with ego-browser or browser-skill** (`bsk`),
  ego-browser first; another browser tool only for what neither can do, and
  the report says which tool produced the evidence. Neither is a phone: what
  only a real one shows (Safari, fingers, the on-screen keyboard) is reported
  as not checked. `.claude/rules/browser-checks.md`
- **A push is on the deployed address within three minutes**: the Cloudflare
  build that deploys it and the GitHub CI run beside it. Weighed when a change
  adds to what a push runs; after such a push both times are read from the
  commit's check runs and reported. Where a change would pass three minutes,
  the user is told before it is pushed, with what could be made faster; no
  test is removed or skipped to keep the time. `.claude/rules/deploy-time.md`

## Project Structure

Code is in `src/` (`client/`, `server/`, `shared/`); unit tests in
`tests/unit/`, integration tests in `tests/integration/`. Design records are
in `design/`, technical docs in `docs/`, production records in `production/`
(screenshots kept as evidence: `production/qa/evidence/`), throwaway builds in
`prototypes/`. The framework's full layout and its code root for each engine:
`.claude/docs/directory-structure.md`, read on demand.

## Engine Version Reference

<!-- ENGINE-REFERENCE-IMPORT: the line under this comment is engine-specific,
     and there is none until an engine is set. /setup-engine, the grow's record
     step and /project-settings (engine.name) write
     @docs/engine-reference/<engine>/VERSION.md here for the chosen engine. Skills
     that need the pinned version read that file on demand either way. -->


## Technical Preferences

`project.yaml` at the repo root is the primary config store (engine,
specialists, naming, platform, performance, modes); skills resolve it via
`resolve_config` (`.claude/docs/config-resolution.md`).
`.claude/docs/technical-preferences.md` is the legacy fallback, read on demand
when a key is absent from `project.yaml`.

## Coordination Rules

Read `.claude/docs/coordination-rules.md` on demand: before a `team-*` or
other orchestration skill, when agents disagree, or to choose a model tier.
Always in force:

- Leadership agents delegate to department leads, leads to specialists. A
  disagreement goes to the shared parent, else to `creative-director`
  (design) or `technical-director` (technical).
- An agent does not modify files outside its own domain without explicit
  delegation.
- Design docs are read by section: find the heading with Grep (`^#`), Read
  that range. `validate-read.sh` refuses a whole-file read of a doc over 40 KB.
- **Nothing goes upstream.** Never file, open or comment on an issue or pull
  request in an engine, plugin or vendor repository, even when asked. Write a
  draft; the user submits it.
- Independent agents are spawned in one message. A BLOCKED agent is surfaced
  at once, and a partial report is still produced.

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

## Coding Standards

Read `.claude/docs/coding-standards.md` on demand: when writing a design
document, closing a story, or changing CI. Always in force:

- Public APIs have doc comments. Gameplay values are data-driven (config
  files), never hardcoded. Dependency injection over singletons, so that
  public methods can be unit-tested.
- Commits use Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`,
  `test:`, `refactor:`) and reference the design document or task.
- Tests first for gameplay systems. Evidence before work is called done: for
  logic a passing unit test, for UI and visuals a screenshot kept in
  `production/qa/evidence/`. A parse check is not a run: a change a player
  can see is launched and looked at before it closes.
- Tests are deterministic and isolated; unit tests do no network or file I/O.
- CI runs the whole suite on every push. A failing test is fixed, never
  disabled or skipped.
- How many ADRs and GDD sections are required depends on `modes.workflow`
  (`.claude/docs/workflow-modes.md`).

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
