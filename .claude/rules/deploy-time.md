---
paths:
  - ".github/**"
  - "package.json"
  - "wrangler.jsonc"
  - "vitest.config.ts"
  - "vite.config.ts"
  - "tests/**"
---

# A Push Is on the Deployed Address Within Three Minutes

**From a push to main to the end of the Cloudflare build that deploys it, and
of the GitHub CI run beside it, no more than three minutes.**

A project rule the user set on 2026-11-12, on hearing that the last three
pushes had taken 1 min 19 s to 2 min 16 s to deploy and the CI run 38 to 59 s,
in their words: "앞으로 3분이넘지않게 고려하게 프로젝트룰에적용해줘".

`CLAUDE.md` (Project Rules) has the rule in a few lines; this file has the
detail.

## How it is kept

*Reading: the assistant's, not the user's words.*

- This is weighed when a change adds to what a push runs (tests, a build step,
  a package to install), not measured on every push.
- After such a push the two times are read from the commit's check runs and
  said in the report.
- The Cloudflare check gives one time for its start and its end, so its length
  is counted from the start of the GitHub run of the same commit.
- Where a change would take a push past three minutes, the user is told before
  it is pushed, with what could be made faster.
- No test is removed or skipped to keep the time.
