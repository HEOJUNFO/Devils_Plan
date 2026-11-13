import { execSync } from "node:child_process";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig, type Plugin } from "vite";
import { SITE_SHEETS } from "./src/client/site-sheets";
import { appHead, appNoScript, inviteFiles, siteFiles } from "./src/shared/site/pages";
import { siteStyle } from "./src/shared/site/style";

/**
 * Writes what a search engine reads. The game's own page is drawn by its
 * script, so the build puts in its head what a crawler and a shared link
 * take (`appHead`), and writes beside it pages that are whole without the
 * script: one about the games and one of rules for each game, in every
 * language, with `sitemap.xml`, `robots.txt` and `llms.txt`
 * (`src/shared/site/pages.ts`).
 *
 * `npm run dev` serves the same pages, with the font where the source has it.
 */
function sitePages(): Plugin {
  /** The pixel font as the source has it, which is where `vite dev` serves it. */
  const SOURCE_FONT = "/assets/fonts/Galmuri11-common.woff2";
  const DEV_STYLE = "/site.css";
  return {
    name: "site-pages",
    transformIndexHtml() {
      return [
        ...appHead().map((tag) => ({ ...tag, injectTo: "head" as const })),
        { tag: "noscript", children: appNoScript(), injectTo: "body-prepend" as const },
      ];
    },
    configureServer(server) {
      const files = new Map([...siteFiles(SITE_SHEETS, { font: SOURCE_FONT, style: DEV_STYLE }), ...inviteFiles()].map((file) => [`/${file.path}`, file.body]));
      files.set(DEV_STYLE, siteStyle(SOURCE_FONT));
      const types: Record<string, string> = { html: "text/html", css: "text/css", xml: "application/xml", txt: "text/plain", webmanifest: "application/manifest+json" };
      server.middlewares.use((request, response, next) => {
        const asked = (request.url ?? "").split("?")[0] ?? "";
        const path = asked.endsWith("/") ? `${asked}index.html` : asked;
        const body = files.get(path);
        if (body === undefined) return next();
        response.setHeader("Content-Type", `${types[path.slice(path.lastIndexOf(".") + 1)] ?? "text/plain"}; charset=utf-8`);
        response.end(body);
      });
    },
    generateBundle(_options, bundle) {
      // the Worker is built too, and has no pages
      if (this.environment.name !== "client") return;
      // the font's name carries a mark of its content, which the style sheet of the game's page was given
      const font = Object.keys(bundle).find((name) => /Galmuri11-common-.*\.woff2$/.test(name));
      if (font === undefined) throw new Error("site-pages: the build has no Galmuri11-common font to give the pages");
      const style = this.emitFile({ type: "asset", name: "site.css", source: siteStyle(`/${font}`) });
      for (const file of [...siteFiles(SITE_SHEETS, { font: `/${font}`, style: `/${this.getFileName(style)}` }), ...inviteFiles()]) {
        this.emitFile({ type: "asset", fileName: file.path, source: file.body });
      }
    },
  };
}

/**
 * Which commit a build is made from, in its first seven letters: what the
 * page and the server each say they are (`src/shared/build.ts`). Cloudflare's
 * build names the commit it was given; a build made by hand asks git. Where
 * neither can say, the build is `dev`, as it is while developing.
 */
function buildOf(): string {
  const named = process.env.WORKERS_CI_COMMIT_SHA;
  if (named) return named.slice(0, 7);
  try {
    return execSync("git rev-parse --short=7 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "dev";
  } catch {
    return "dev";
  }
}

// `vite dev` serves the browser client and runs the Worker (and its Durable
// Objects) in the real Workers runtime, reading wrangler.jsonc.
export default defineConfig(({ command }) => ({
  plugins: [sitePages(), cloudflare()],
  // the page and the Worker are built from the one commit, and each is told which
  define: { __BUILD__: JSON.stringify(command === "build" ? buildOf() : "dev") },
}));
