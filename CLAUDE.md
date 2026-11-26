# Claude Code Game Studios -- Game Studio Agent Architecture

`brain-survival`: games from 데블스 플랜 season 3, played together in a
browser. The studio framework (agents, skills, hooks, rules) is in `.claude/`.

## Technology Stack

- **Engine**: Web (a 480 by 270 canvas; Vite)
- **Language**: TypeScript
- **Server**: Cloudflare Workers + PartyServer
- **Version Control**: Git, trunk-based; a push to `main` deploys
- **Web platform lookup**: before new or restructured browser-platform code
  in `src/client` (DOM, CSS, forms, chat input, touch, storage), search
  `/modern-web-guidance` first for the current API and its fallback
  (GoogleChrome/modern-web-guidance 4dd9683, Apache-2.0). Commands run as
  `DISABLE_TELEMETRY=1 npx -y modern-web-guidance@latest …`; without the
  prefix the query goes to Google. `.claude/skills/modern-web-guidance`

## Project Rules (Devils_Plan)

The user's rules. They win over the framework's defaults below. The file
named has the user's words and the detail: read it before acting near a
rule's edge.

- **Multiplayer is the product; bots are a test aid.** One plain bot per
  game, no single-player screens. Only 큐브 세기 and 네모 세기 start with one
  player. `.claude/rules/bots.md`
- **A game has the name the show gives it**; rules as documented; the show's
  logo, cast, set and layout are not used. `.claude/rules/game-names.md`
- **A search for the show finds the site**: the pages a search engine reads
  name the show and say the site is not the broadcaster's; the game's own
  screens do not carry its name. `.claude/rules/game-names.md`
- **Korean and English, both, for every sentence a player reads**, kept in
  the `words.ts` beside the screen; the room sends reasons, never sentences.
  `.claude/rules/languages.md`
- **The lobby is a list of rooms** to join, with make-one and enter-a-code
  ("내가말한로비는 여러방리스트가 있는 로비말한거야").
- **Check what was changed, not everything**: the tests of the files touched,
  the screen touched, the type check. No whole suite. What was not checked
  is said. `.claude/rules/checks.md`
- **Nothing under `tests/integration` is run on this machine.** After a
  push, CI's result is read and reported; a failure there is fixed first.
  `.claude/rules/checks.md`
- **A screen is looked at with ego-browser or browser-skill**, and the report
  says which. Neither is a real phone. `.claude/rules/browser-checks.md`
- **A push is deployed within three minutes** (the CI run tests, then deploys); no
  test is removed to keep the time. `.claude/rules/deploy-time.md`

## Project Structure

`src/` (`client/`, `server/`, `shared/`), `tests/unit/`, `tests/integration/`,
`design/`, `docs/`, `production/` (evidence: `production/qa/evidence/`),
`prototypes/`. Full layout: `.claude/docs/directory-structure.md`.

## Engine Version Reference

<!-- ENGINE-REFERENCE-IMPORT: the line under this comment is engine-specific,
     and there is none until an engine is set. /setup-engine, the grow's record
     step and /project-settings (engine.name) write
     @docs/engine-reference/<engine>/VERSION.md here for the chosen engine. Skills
     that need the pinned version read that file on demand either way. -->


## Framework Defaults

Each is in force; the file has the rest and is read when it is needed.

- **Config**: `project.yaml` (`.claude/docs/config-resolution.md`).
- **Coordination** (`.claude/docs/coordination-rules.md`): agents keep to
  their own domain and delegate downward; design docs are read by section;
  independent agents are spawned in one message.
- **Nothing goes upstream.** Never file, open or comment on an issue or pull
  request in an engine, plugin or vendor repository, even when asked: write
  a draft, the user submits it.
- **Collaboration** (`docs/COLLABORATIVE-DESIGN-PRINCIPLE.md`): Question ->
  Options -> Decision -> Draft -> Approval. Ask "May I write this to
  [filepath]?" before Write/Edit (exempt: `.claude/rules/agent-memory.md`),
  show a draft first, no commit without the user's instruction. A skipped
  question is not an answer. Started outside this folder? Warn first: the
  hooks and deny rules load only when Claude Code starts here.
- **Coding** (`.claude/docs/coding-standards.md`): doc comments on public
  APIs; gameplay values in config files; Conventional Commits that name the
  design document; tests first for gameplay; evidence before done (a passing
  unit test, or a screenshot in `production/qa/evidence/`); a failing test
  is fixed, never skipped.
- **Context** (`.claude/docs/context-management.md`):
  `production/session-state/active.md` is the session checkpoint, read first
  after a compaction. Helpers in `.claude/scripts/` emit observations, never
  verdicts.
