import { describe, expect, it } from "vitest";
import { GAMES, GAME_IDS, type GameId } from "../../../src/shared/games";
import { LANGS, type Lang } from "../../../src/shared/lang";
import { appHead, appNoScript, escapeHtml, gamePath, homePath, renderTag, siteAddresses, siteFiles, type Sheets, type SiteFile } from "../../../src/shared/site/pages";
import { siteStyle } from "../../../src/shared/site/style";
import { ORIGIN, OWNER_CODES, SITE_WORDS } from "../../../src/shared/site/words";

/** The addresses a build gives the font and the style sheet. */
const BUILT = { font: "/assets/font-abc.woff2", style: "/assets/site-abc.css" };

/** The widest a title may be to be shown whole in a search result: Hangul syllables are about twice a Latin letter. */
const TITLE_WIDTH: Record<Lang, number> = { ko: 40, en: 60 };
/** The same for the line under it. */
const DESCRIPTION_WIDTH: Record<Lang, number> = { ko: 110, en: 160 };

/** A sheet for every game: a paragraph, then two points, one of which has signs that mean something in markup. */
function sheets(): Sheets {
  const sheet = (game: GameId, lang: Lang) => ({ title: `${game} ${lang}`, parts: [`paragraph of ${game} in ${lang}`, [`point of ${game}`, `a < b & "c" > d`]] });
  const written: Partial<Sheets> = {};
  for (const game of GAME_IDS) written[game] = { ko: sheet(game, "ko"), en: sheet(game, "en") };
  return written as Sheets;
}

function files(): SiteFile[] {
  return siteFiles(sheets(), BUILT);
}

/** The pages among the files, each with the address it is served at and its language. */
function pages(): { address: string; lang: Lang; body: string }[] {
  return files()
    .filter((file) => file.path.endsWith("index.html"))
    .map((file) => ({ address: `/${file.path.slice(0, -"index.html".length)}`, lang: file.path.slice(0, 2) as Lang, body: file.body }));
}

function file(path: string): string {
  const found = files().find((one) => one.path === path);
  if (found === undefined) throw new Error(`no file ${path}`);
  return found.body;
}

const one = (body: string, pattern: RegExp): string => pattern.exec(body)?.[1] ?? "";
const all = (body: string, pattern: RegExp): string[] => [...body.matchAll(pattern)].map((match) => match[1] ?? "");
const unescape = (text: string): string => text.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const title = (body: string): string => unescape(one(body, /<title>([^<]*)<\/title>/));
const description = (body: string): string => unescape(one(body, /<meta name="description" content="([^"]*)"/));
const canonical = (body: string): string => one(body, /<link rel="canonical" href="([^"]*)"/);
const alternate = (body: string, lang: string): string => one(body, new RegExp(`<link rel="alternate" hreflang="${lang}" href="([^"]*)"`));

describe("the pages a search engine reads", () => {
  it("are a page about the games and a page of rules for each game, in every language", () => {
    const addresses = pages().map((page) => page.address);

    expect(addresses).toHaveLength(LANGS.length * (GAME_IDS.length + 1));
    for (const lang of LANGS) {
      expect(addresses).toContain(homePath(lang));
      for (const game of GAME_IDS) expect(addresses).toContain(gamePath(lang, game));
    }
  });

  it("call 무거운 13 by its name in its address, not by its id", () => {
    expect(gamePath("en", "under-thirteen")).toBe("/en/heavy-13/");
    expect(pages().some((page) => page.address.includes("under-thirteen"))).toBe(false);
  });

  it.each(pages())("$address names itself as the address to index and is written in its language", ({ address, lang, body }) => {
    expect(canonical(body)).toBe(ORIGIN + address);
    expect(body).toContain(`<html lang="${lang}">`);
    expect(alternate(body, lang)).toBe(ORIGIN + address);
  });

  it.each(pages())("$address and the same page in every other language name each other", ({ address, lang, body }) => {
    const byAddress = new Map(pages().map((page) => [ORIGIN + page.address, page]));

    for (const other of LANGS) {
      const there = byAddress.get(alternate(body, other));
      // the page it names exists, is in that language, and names this one back
      expect(there?.lang).toBe(other);
      expect(alternate(there?.body ?? "", lang)).toBe(ORIGIN + address);
    }
    expect(byAddress.has(alternate(body, "x-default")) || alternate(body, "x-default") === `${ORIGIN}/`).toBe(true);
  });

  it.each(pages())("$address has a title and a description a search result shows whole", ({ lang, body }) => {
    expect(title(body).length).toBeGreaterThan(10);
    expect(title(body).length).toBeLessThanOrEqual(TITLE_WIDTH[lang]);
    expect(description(body).length).toBeGreaterThan(40);
    expect(description(body).length).toBeLessThanOrEqual(DESCRIPTION_WIDTH[lang]);
  });

  it("gives no two pages the same title or the same description", () => {
    const titles = pages().map((page) => title(page.body));
    const descriptions = pages().map((page) => description(page.body));

    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it.each(pages())("$address has one main heading, and its structured data is sound", ({ body }) => {
    expect(all(body, /<h1>([^<]*)<\/h1>/g)).toHaveLength(1);
    const data = all(body, /<script type="application\/ld\+json">(.*?)<\/script>/g);
    expect(data).toHaveLength(1);
    expect(JSON.parse(data[0] ?? "")["@graph"].length).toBeGreaterThan(1);
  });

  it.each(GAME_IDS.flatMap((game) => LANGS.map((lang) => ({ game, lang }))))("the page of $game in $lang says its name, how many play and every line of its sheet", ({ game, lang }) => {
    const body = file(`${gamePath(lang, game).slice(1)}index.html`);

    expect(one(body, /<h1>([^<]*)<\/h1>/)).toContain(GAMES[game as GameId].title[lang]);
    expect(body).toContain(SITE_WORDS[lang].count(GAMES[game as GameId].minPlayers, GAMES[game as GameId].maxPlayers));
    expect(body).toContain(`<p>paragraph of ${game} in ${lang}</p>`);
    expect(body).toContain(`<li>point of ${game}</li>`);
    // what a sheet says is words, never markup
    expect(body).toContain("<li>a &lt; b &amp; &quot;c&quot; &gt; d</li>");
  });

  it.each(GAME_IDS.flatMap((game) => LANGS.map((lang) => ({ game, lang }))))("the page of $game in $lang links to every other game and to the page about them", ({ game, lang }) => {
    const links = all(file(`${gamePath(lang, game).slice(1)}index.html`), /<a [^>]*href="([^"]*)"/g);

    expect(links).toContain(homePath(lang));
    for (const other of GAME_IDS) if (other !== game) expect(links).toContain(gamePath(lang, other));
  });

  it("links from the page about the games to every game", () => {
    for (const lang of LANGS) {
      const links = all(file(`${lang}/index.html`), /<a [^>]*href="([^"]*)"/g);
      for (const game of GAME_IDS) expect(links).toContain(gamePath(lang, game));
    }
  });

  it.each(LANGS)("the page about the games in %s answers first whether the show's games can be played online, with where", (lang) => {
    const body = file(`${lang}/index.html`);
    const names = GAME_IDS.map((game) => GAMES[game].title[lang]);
    const [asked, answer] = SITE_WORDS[lang].home.online(GAME_IDS.length, names.join(", "));
    const afterQuestions = body.slice(body.indexOf(`<h2>${SITE_WORDS[lang].home.questions}</h2>`));

    // the first question under the heading is this one, and its answer is the next paragraph
    expect(one(afterQuestions, /<h3>([^<]*)<\/h3>/)).toBe(asked);
    expect(unescape(one(afterQuestions, /<h3>[^<]*<\/h3>\n<p>([^<]*)<\/p>/))).toBe(answer);
    // an answer that is quoted alone still says which site, at which address, and which games
    expect(answer).toContain(SITE_WORDS[lang].show.name);
    expect(answer).toContain(ORIGIN.replace("https://", ""));
    for (const name of names) expect(answer).toContain(name);
  });

  it("asks that question in Korean the way the show's name is typed into a search, and says which season", () => {
    const body = file("ko/index.html");

    expect(SITE_WORDS.ko.home.online(GAME_IDS.length, "")[0]).toContain("데블스플랜");
    expect(one(body, /<p class="lead">([^<]*)<\/p>/)).toContain("시즌 3");
    for (const game of GAME_IDS) expect(one(file(`${gamePath("ko", game).slice(1)}index.html`), /<p class="lead">([^<]*)<\/p>/)).toContain("시즌 3");
  });

  it.each(LANGS)("the page about the games in %s gives its questions as structured data, each as the page shows it", (lang) => {
    const body = file(`${lang}/index.html`);
    const graph = JSON.parse(one(body, /<script type="application\/ld\+json">(.*?)<\/script>/))["@graph"] as { "@type": string; mainEntity?: { name: string; acceptedAnswer: { text: string } }[] }[];
    const asked = graph.find((node) => node["@type"] === "FAQPage")?.mainEntity ?? [];

    expect(asked.length).toBeGreaterThanOrEqual(4);
    for (const question of asked) {
      expect(body).toContain(`<h3>${escapeHtml(question.name)}</h3>\n<p>${escapeHtml(question.acceptedAnswer.text)}</p>`);
    }
  });

  it("takes the font and the style sheet from where the build put them", () => {
    for (const page of pages()) {
      expect(page.body).toContain(`<link rel="stylesheet" href="${BUILT.style}" />`);
      expect(page.body).toContain(`href="${BUILT.font}"`);
    }
    expect(siteStyle(BUILT.font)).toContain(`url("${BUILT.font}")`);
  });
});

describe("what tells a crawler where the pages are", () => {
  it("lists every page and the game's own page in the sitemap, once each", () => {
    const listed = all(file("sitemap.xml"), /<loc>([^<]*)<\/loc>/g);

    expect([...listed].sort()).toEqual([`${ORIGIN}/`, ...pages().map((page) => ORIGIN + page.address)].sort());
    expect(siteAddresses()).toHaveLength(listed.length);
  });

  it("gives each address in the sitemap the same other languages its page names", () => {
    const sitemap = file("sitemap.xml");

    for (const page of pages()) {
      const entry = one(sitemap, new RegExp(`<loc>${ORIGIN}${page.address}</loc>([\\s\\S]*?)</url>`));
      for (const lang of [...LANGS, "x-default"]) expect(entry).toContain(`hreflang="${lang}" href="${alternate(page.body, lang)}"`);
    }
  });

  it("lets every crawler read everything, and says where the sitemap is", () => {
    expect(file("robots.txt")).toBe(`User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);
  });

  it("names every page in llms.txt", () => {
    for (const page of pages()) expect(file("llms.txt")).toContain(`(${ORIGIN}${page.address})`);
  });
});

describe("the head of the game's own page", () => {
  const head = appHead().map(renderTag).join("\n");

  it("names / as the address to index and as the page for a reader of neither language", () => {
    expect(canonical(head)).toBe(`${ORIGIN}/`);
    expect(alternate(head, "x-default")).toBe(`${ORIGIN}/`);
  });

  it("names the page about the games in every language, which names it back", () => {
    for (const lang of LANGS) {
      expect(alternate(head, lang)).toBe(ORIGIN + homePath(lang));
      expect(alternate(file(`${lang}/index.html`), "x-default")).toBe(`${ORIGIN}/`);
    }
  });

  it("has a title of its own and says how many games there are", () => {
    expect(pages().map((page) => title(page.body))).not.toContain(title(head));
    expect(description(head)).toContain(String(GAME_IDS.length));
    expect(JSON.parse(one(head, /<script type="application\/ld\+json">(.*?)<\/script>/))["@graph"]).toHaveLength(2);
  });

  it("carries each code a search engine's console looks for to know the site's owner", () => {
    expect(Object.keys(OWNER_CODES)).toEqual(["google-site-verification", "naver-site-verification", "msvalidate.01"]);
    for (const [name, code] of Object.entries(OWNER_CODES)) expect(head).toContain(`<meta name="${name}" content="${code}" />`);
  });

  it("links a reader without the script to the page about the games, in every language", () => {
    for (const lang of LANGS) expect(appNoScript()).toContain(`<a href="${homePath(lang)}">`);
  });
});
