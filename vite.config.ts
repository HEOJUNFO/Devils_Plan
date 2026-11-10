import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

// `vite dev` serves the browser client and runs the Worker (and its Durable
// Objects) in the real Workers runtime, reading wrangler.jsonc.
export default defineConfig({
  plugins: [cloudflare()],
});
