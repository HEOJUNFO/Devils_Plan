import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Tests run inside the Workers runtime so Durable Objects, their SQLite
// storage, alarms and WebSockets behave as they do when deployed.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      // Tests fill tables with bots; the deployed Worker never does (wrangler.jsonc).
      miniflare: { bindings: { ALLOW_BOTS: "true" } },
    }),
  ],
  test: {
    // Two sets, because of what a file of tests costs to begin. Every file gets a runtime of its own by
    // default, and beginning one took 0.4 to 0.7 s a file where the site is built: more than the tests in it.
    projects: [
      {
        // Tests of functions: nothing in them outlasts the test, so the files share a runtime.
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], isolate: false },
      },
      {
        // Tests of rooms: Durable Objects, their storage and their sockets, which a file must not find
        // as another left them. Each file keeps a runtime of its own.
        extends: true,
        test: { name: "integration", include: ["tests/integration/**/*.test.ts"] },
      },
    ],
  },
});
