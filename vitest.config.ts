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
    include: ["tests/**/*.test.ts"],
  },
});
