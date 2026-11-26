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

**From a push to main to the end of the GitHub CI run that tests it and
deploys it, no more than three minutes.**

A project rule the user set on 2026-11-12, on hearing that the last three
pushes had taken 1 min 19 s to 2 min 16 s to deploy and the CI run 38 to 59 s,
in their words: "앞으로 3분이넘지않게 고려하게 프로젝트룰에적용해줘".

`CLAUDE.md` (Project Rules) has the rule in a few lines; this file has the
detail.

## How it is kept

*Reading: the assistant's, not the user's words.*

- This is weighed when a change adds to what a push runs (tests, a build step,
  a package to install), not measured on every push.
- After such a push the time is read from the commit's check run and said in
  the report, with whether its last step deployed (it does not when main has
  moved on: the newer push deploys).
- Where a change would take a push past three minutes, the user is told before
  it is pushed, with what could be made faster.
- No test is removed or skipped to keep the time.

## Who deploys

*The user's choice of 2026-11-26 ("추천하는걸로해줘"), of three ways offered.*

The CI run deploys (`.github/workflows/deploy.yml`), once its tests have
passed. Until then Cloudflare Workers Builds deployed, running the whole
suite a second time on its own machine: 58 and 66 seconds on two pushes of
that day, 148 and 110 on two others of the same 128 files, which were 3 min
37 s and 3 min 6 s to the address. GitHub's machine took 23 to 34 seconds
over the same suite. Workers Builds is disconnected (Cloudflare dashboard,
Workers & Pages > play > Settings > Builds); connected again, it would
deploy every push a second time.
