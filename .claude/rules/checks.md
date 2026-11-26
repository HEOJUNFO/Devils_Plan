---
paths:
  - "tests/**"
  - "src/**"
  - "vitest.config.ts"
  - ".github/**"
---

# Checks: What Was Changed, and No Integration Tests Here

Two project rules the user set. `CLAUDE.md` (Project Rules) has each in a few
lines; this file has the user's words, the history and the detail. A part
marked *reading* is the assistant's reading, not the user's words. Where
either differs from the testing standards (`.claude/docs/coding-standards.md`,
`.claude/rules/test-standards.md`), the rule here wins.

## Check what was changed, not everything

**After a change, run the tests of the files touched and look at the screen
touched.** No run of the entire test suite, no mutation run over a whole list,
no walk through every screen.

Set on 2026-11-11, in the user's words: "전체검사는하지마 앞으로도계속
수정한부분에대한 부분검사해 프로젝트룰에추가".

*Reading:* the type check stays (one command of a few seconds that cannot be
pointed at a part), and CI still runs the whole suite on every push. What was
not checked is said in the commit and in the report.

## The integration tests are not run here

**Nothing under `tests/integration` is run on this machine.**

Set on 2026-11-13, in the user's words, when the assistant had run that whole
folder twice in one session after changing the room and the directory, and
single files of it several times more: "통합테스트돌리지말라니까왜돌려또
프로젝트룰에추가해".

"A change to the server means running the integration tests" was a habit of
the assistant's own, never a rule, and is withdrawn. CI runs them on every
push, before it deploys, so a push that breaks one is not deployed.

*Reading:*

- One integration file run by name is not run either (the user said
  "통합테스트", not "all of them").
- A change to the server is checked here by the type check, the unit tests of
  the files touched and the screen.
- The commit and the report say the integration tests were not run here.
- After a push, CI's result is read and reported, and a failure there is fixed
  before anything else.
- An integration test that is added or changed is pushed without having been
  seen to fail or pass here, and the report says so. Where this differs from
  "watch it fail" in the test standards, this wins.
