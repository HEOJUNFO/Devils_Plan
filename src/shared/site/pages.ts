/**
 * The pages a search engine reads, written when the client is built
 * (`vite.config.ts`): a page about the games and a page of rules for each
 * game, in every language, with the files that tell a crawler where they are
 * (`sitemap.xml`, `robots.txt`, `llms.txt`).
 *
 * The game's own page, `/`, is drawn by its script and has no sentence in its
 * markup, so a crawler that does not run the script finds nothing to read on
 * it. These pages are whole without the script: what a game is, how many play
 * it and its rules, each from where the game itself takes it (`games.json`,
 * the sheet in the game's `words.ts`).
 *
 * Addresses: a language leads every page's (`/ko/`, `/en/heavy-13/`), each
 * page names itself as the one to index and names the same page in the other
 * language. `/` shows whichever language the reader's browser asks for, so it
 * is the page for a reader of neither (`x-default`).
 *
 * Pure: the sheets and the built addresses of the font and the style sheet
 * are handed in, and text comes out.
 */
import { GAMES, GAME_IDS, type GameId } from "../games";
import { FALLBACK_LANG, LANGS, type Lang } from "../lang";
import { LANG_NAMES, ORIGIN, SITE_NAME, SITE_WORDS } from "./words";

/** A game's rules as its sheet has them: a heading, then paragraphs and lists of points (`RulesSheet` of the client). */
export interface Sheet {
  title: string;
  parts: readonly (string | readonly string[])[];
}

/** Every game's sheet, in every language. */
export type Sheets = Record<GameId, Record<Lang, Sheet>>;

/** The addresses two files of the build have, which carry a mark of their content: the pixel font and these pages' style sheet. */
export interface Built {
  font: string;
  style: string;
}

/** A file of the site: where it goes, from the site's root, and what is in it. */
export interface SiteFile {
  path: string;
  body: string;
}

/** A tag in a page's head. */
export interface HeadTag {
  tag: "title" | "meta" | "link" | "script";
  attrs?: Record<string, string>;
  children?: string;
}

/**
 * What a game is called in an address, where its id is not its name: the id
 * of 무거운 13 is from before it had the show's name, and an address is read
 * (`.claude/rules/game-names.md`).
 */
const SLUGS: Partial<Record<GameId, string>> = { "under-thirteen": "heavy-13" };

/** The picture a shared link shows, and its size. */
const PICTURE = { width: 1200, height: 630 };

/** The page's pixel mark, the same the game's page has. */
const MARK =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><rect width="16" height="16" fill="#0d1020"/><rect x="2" y="2" width="12" height="12" fill="#ffb43c"/><rect x="4" y="4" width="8" height="8" fill="#0d1020"/><rect x="7" y="7" width="2" height="2" fill="#ffb43c"/></svg>';

/** What a region is called in `og:locale`. */
const LOCALES: Record<Lang, string> = { ko: "ko_KR", en: "en_US" };

/** The address of the page about the games, in `lang`. */
export function homePath(lang: Lang): string {
  return `/${lang}/`;
}

/** The address of a game's page of rules, in `lang`. */
export function gamePath(lang: Lang, game: GameId): string {
  return `/${lang}/${SLUGS[game] ?? game}/`;
}

/** The address that opens the game itself in `lang`. */
export function playPath(lang: Lang): string {
  return `/?lang=${lang}`;
}

/** `text` as it is written inside a tag or an attribute. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** `data` as a script of structured data holds it: no `<` that could end the script. */
function structured(data: unknown): HeadTag {
  return { tag: "script", attrs: { type: "application/ld+json" }, children: JSON.stringify(data).replace(/</g, "\\u003c") };
}

/** A head tag as markup. */
export function renderTag({ tag, attrs = {}, children }: HeadTag): string {
  const written = Object.entries(attrs)
    .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
    .join("");
  if (tag === "title") return `<title>${escapeHtml(children ?? "")}</title>`;
  // structured data is not markup: it is written as it is
  if (tag === "script") return `<script${written}>${children ?? ""}</script>`;
  return `<${tag}${written} />`;
}

/** The site, as structured data names it: the same thing on every page. */
const SITE_ID = `${ORIGIN}/#site`;
const siteData = { "@type": "WebSite", "@id": SITE_ID, name: SITE_NAME, url: `${ORIGIN}/`, inLanguage: [...LANGS] };

/**
 * The tags every page's head has for a search engine and for a shared link:
 * what the page is, which address is the one to index, the same page in the
 * other languages, and the card a messenger draws.
 *
 * `others` are the addresses of the same page by language, the page itself
 * among them, and `fallback` the one for a reader of none of the languages.
 */
function headTags(page: { lang: Lang; path: string; title: string; description: string; others: Record<Lang, string>; fallback: string }): HeadTag[] {
  const words = SITE_WORDS[page.lang];
  const url = ORIGIN + page.path;
  const picture = `${ORIGIN}/og-${page.lang}.png`;
  return [
    { tag: "title", children: page.title },
    { tag: "meta", attrs: { name: "description", content: page.description } },
    { tag: "link", attrs: { rel: "canonical", href: url } },
    ...LANGS.map((lang): HeadTag => ({ tag: "link", attrs: { rel: "alternate", hreflang: lang, href: ORIGIN + page.others[lang] } })),
    { tag: "link", attrs: { rel: "alternate", hreflang: "x-default", href: ORIGIN + page.fallback } },
    // a search result's small picture is taken from an address, which the mark drawn in the page itself does not have
    { tag: "link", attrs: { rel: "apple-touch-icon", href: "/icon-180.png" } },
    { tag: "meta", attrs: { property: "og:type", content: "website" } },
    { tag: "meta", attrs: { property: "og:site_name", content: SITE_NAME } },
    { tag: "meta", attrs: { property: "og:title", content: page.title } },
    { tag: "meta", attrs: { property: "og:description", content: page.description } },
    { tag: "meta", attrs: { property: "og:url", content: url } },
    { tag: "meta", attrs: { property: "og:locale", content: LOCALES[page.lang] } },
    ...LANGS.filter((lang) => lang !== page.lang).map((lang): HeadTag => ({ tag: "meta", attrs: { property: "og:locale:alternate", content: LOCALES[lang] } })),
    { tag: "meta", attrs: { property: "og:image", content: picture } },
    { tag: "meta", attrs: { property: "og:image:width", content: String(PICTURE.width) } },
    { tag: "meta", attrs: { property: "og:image:height", content: String(PICTURE.height) } },
    { tag: "meta", attrs: { property: "og:image:alt", content: words.frame.picture(GAME_IDS.length) } },
    { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" } },
  ];
}

/** The addresses of the page about the games, by language. */
const HOMES = Object.fromEntries(LANGS.map((lang) => [lang, homePath(lang)])) as Record<Lang, string>;

/**
 * What the game's own page, `/`, has in its head. Its sentences are Korean,
 * the language the game was written in: the script puts the reader's own in
 * once it runs. It stands for the page about the games in every language.
 */
export function appHead(): HeadTag[] {
  const lang: Lang = "ko";
  const words = SITE_WORDS[lang];
  const description = words.app.description(GAME_IDS.length);
  return [
    ...headTags({ lang, path: "/", title: words.app.title, description, others: HOMES, fallback: "/" }),
    structured({
      "@context": "https://schema.org",
      "@graph": [
        siteData,
        {
          "@type": "WebApplication",
          name: SITE_NAME,
          url: `${ORIGIN}/`,
          description,
          applicationCategory: "GameApplication",
          operatingSystem: "Any",
          browserRequirements: "Requires JavaScript",
          inLanguage: [...LANGS],
          offers: { "@type": "Offer", price: "0", priceCurrency: "KRW" },
          isPartOf: { "@id": SITE_ID },
        },
      ],
    }),
  ];
}

/** What the game's own page shows where its script cannot run, to go inside its `noscript`: that it needs the script, and where the games can be read about, in every language. */
export function appNoScript(): string {
  const lines = LANGS.map((lang) => {
    const words = SITE_WORDS[lang];
    return `<p lang="${lang}">${escapeHtml(words.app.noScript)} <a href="${homePath(lang)}">${escapeHtml(words.frame.home)}</a></p>`;
  });
  return `<div style="padding:16px">${lines.join("")}</div>`;
}

/** A whole page: its head, the bar over it, its own words and the foot. `others` is the same page in each language, `fallback` the one for a reader of none of them. */
function page(
  built: Built,
  spec: { lang: Lang; path: string; title: string; description: string; others: Record<Lang, string>; fallback: string; data: unknown[]; main: string },
): string {
  const { lang } = spec;
  const words = SITE_WORDS[lang];
  const head = [
    ...headTags(spec),
    structured({ "@context": "https://schema.org", "@graph": [siteData, ...spec.data] }),
  ];
  const otherLangs = LANGS.filter((other) => other !== lang)
    .map((other) => `<a href="${spec.others[other]}" lang="${other}" hreflang="${other}">${escapeHtml(LANG_NAMES[other])}</a>`)
    .join("");
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#0d1020" />
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(MARK.replace(' aria-hidden="true"', ""))}" />
${head.map(renderTag).join("\n")}
<link rel="preload" href="${built.font}" as="font" type="font/woff2" crossorigin />
<link rel="stylesheet" href="${built.style}" />
</head>
<body>
<header class="top">
<a class="brand" href="${homePath(lang)}">${MARK}${SITE_NAME}</a>
<nav class="links">${otherLangs}<a class="button" href="${playPath(lang)}">${escapeHtml(words.frame.play)}</a></nav>
</header>
<main>
${spec.main}
</main>
<footer class="foot">
<p>${SITE_NAME} · ${escapeHtml(words.frame.footer)}</p>
<p>${escapeHtml(words.frame.notTheShow)}</p>
<p><a href="${homePath(lang)}">${escapeHtml(words.frame.home)}</a> · <a href="${playPath(lang)}">${escapeHtml(words.frame.play)}</a> · ${otherLangs}</p>
</footer>
</body>
</html>
`;
}

/** How many play `game`, as `lang` says it. */
function players(lang: Lang, game: GameId): string {
  return SITE_WORDS[lang].count(GAMES[game].minPlayers, GAMES[game].maxPlayers);
}

/** The games as a list of links, each with what it is about and how many play it. */
function gameList(lang: Lang, games: readonly GameId[]): string {
  const items = games.map(
    (game) =>
      `<li><h3><a href="${gamePath(lang, game)}">${escapeHtml(GAMES[game].title[lang])}</a></h3><p>${escapeHtml(GAMES[game].summary[lang])}</p><p class="dim">${escapeHtml(players(lang, game))}</p></li>`,
  );
  return `<ul class="games">\n${items.join("\n")}\n</ul>`;
}

/** The page about the games, in `lang`. */
function homePage(lang: Lang, built: Built): string {
  const words = SITE_WORDS[lang];
  const home = words.home;
  const count = GAME_IDS.length;
  const each = GAME_IDS.map((game) => `${GAMES[game].title[lang]} ${players(lang, game)}`).join(", ");
  const alone = GAME_IDS.filter((game) => GAMES[game].minPlayers === 1).map((game) => GAMES[game].title[lang]);
  const howMany = home.howManyAnswer(each) + (alone.length > 0 ? ` ${home.alone(alone.join(", "))}` : "");
  const questions: (readonly string[])[] = [home.free, [home.howMany, howMany], home.phone];
  const main = `<h1>${escapeHtml(home.heading(count))}</h1>
<p class="lead">${escapeHtml(home.lead(count))}</p>
<p class="act"><a class="button" href="${playPath(lang)}">${escapeHtml(words.frame.play)}</a></p>
<h2>${escapeHtml(home.games)}</h2>
${gameList(lang, GAME_IDS)}
<h2>${escapeHtml(home.how)}</h2>
<ol>
${home.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("\n")}
</ol>
<h2>${escapeHtml(home.questions)}</h2>
${questions.map(([asked, answer]) => `<h3>${escapeHtml(asked ?? "")}</h3>\n<p>${escapeHtml(answer ?? "")}</p>`).join("\n")}`;
  const list = {
    "@type": "ItemList",
    name: home.games,
    itemListElement: GAME_IDS.map((game, at) => ({ "@type": "ListItem", position: at + 1, name: GAMES[game].title[lang], url: ORIGIN + gamePath(lang, game) })),
  };
  // a reader of neither language is sent to the game's own page, which shows whichever its browser asks for
  return page(built, { lang, path: homePath(lang), title: home.title(count), description: home.description(count), others: HOMES, fallback: "/", data: [list], main });
}

/** A game's page of rules, in `lang`. */
function gamePage(lang: Lang, game: GameId, sheet: Sheet, built: Built): string {
  const words = SITE_WORDS[lang];
  const info = GAMES[game];
  const name = info.title[lang];
  const summary = info.summary[lang];
  const count = players(lang, game);
  const path = gamePath(lang, game);
  const description = words.game.description(name, summary, count);
  const facts: [string, string][] = [[words.game.players, count]];
  if (info.teamSize > 0) facts.push([words.game.team, words.game.teamOf(info.teamSize)]);
  if (info.variants.length > 0) facts.push([words.game.variants, info.variants.map((variant) => variant.title[lang]).join(", ")]);
  const rules = sheet.parts.map((part) =>
    typeof part === "string" ? `<p>${escapeHtml(part)}</p>` : `<ul>\n${part.map((point) => `<li>${escapeHtml(point)}</li>`).join("\n")}\n</ul>`,
  );
  const main = `<nav class="trail" aria-label="${escapeHtml(words.frame.trail)}"><a href="${homePath(lang)}">${escapeHtml(words.frame.home)}</a> › ${escapeHtml(name)}</nav>
<h1>${escapeHtml(words.game.heading(name))}</h1>
<p class="lead">${escapeHtml(words.game.lead(name, summary, count, info.minPlayers === 1))}</p>
<dl class="facts">
${facts.map(([what, value]) => `<div><dt>${escapeHtml(what)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("\n")}
</dl>
<h2>${escapeHtml(words.game.rules)}</h2>
${rules.join("\n")}
<h2>${escapeHtml(words.game.start)}</h2>
<p>${escapeHtml(words.game.startHow)}</p>
<p class="act"><a class="button" href="${playPath(lang)}">${escapeHtml(words.frame.play)}</a></p>
<h2>${escapeHtml(words.game.others)}</h2>
${gameList(lang, GAME_IDS.filter((other) => other !== game))}`;
  const data = [
    {
      "@type": "VideoGame",
      name,
      description: summary,
      url: ORIGIN + path,
      inLanguage: lang,
      gamePlatform: "Web browser",
      applicationCategory: "Game",
      operatingSystem: "Any",
      playMode: info.minPlayers === 1 ? ["https://schema.org/SinglePlayer", "https://schema.org/MultiPlayer"] : "https://schema.org/MultiPlayer",
      numberOfPlayers: { "@type": "QuantitativeValue", minValue: info.minPlayers, maxValue: info.maxPlayers },
      offers: { "@type": "Offer", price: "0", priceCurrency: "KRW" },
      // the show the game is from, which is what the game is searched for by
      isBasedOn: { "@type": "TVSeries", name: words.show.name },
      isPartOf: { "@id": SITE_ID },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: words.frame.home, item: ORIGIN + homePath(lang) },
        { "@type": "ListItem", position: 2, name, item: ORIGIN + path },
      ],
    },
  ];
  const others = Object.fromEntries(LANGS.map((other) => [other, gamePath(other, game)])) as Record<Lang, string>;
  return page(built, { lang, path, title: words.game.title(name), description, others, fallback: others[FALLBACK_LANG], data, main });
}

/** Every address a search engine is to index, each with the same page by language and the one for a reader of neither. */
export function siteAddresses(): { path: string; others: Record<Lang, string>; fallback: string }[] {
  const games = GAME_IDS.map((game) => Object.fromEntries(LANGS.map((lang) => [lang, gamePath(lang, game)])) as Record<Lang, string>);
  return [
    { path: "/", others: HOMES, fallback: "/" },
    ...LANGS.map((lang) => ({ path: HOMES[lang], others: HOMES, fallback: "/" })),
    ...games.flatMap((others) => LANGS.map((lang) => ({ path: others[lang], others, fallback: others[FALLBACK_LANG] }))),
  ];
}

/** The list of addresses a crawler is given, each with its other languages. */
function sitemap(): string {
  const urls = siteAddresses().map(({ path, others, fallback }) => {
    const links = [
      ...LANGS.map((lang) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${ORIGIN}${others[lang]}" />`),
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}${fallback}" />`,
    ];
    return `  <url>\n    <loc>${ORIGIN}${path}</loc>\n${links.join("\n")}\n  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join("\n")}
</urlset>
`;
}

/** What a crawler may read: everything. One rule for all of them, and no list of names, which would leave out every crawler not on it. */
function robots(): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`;
}

/** What the site is and where its pages are, as plain text for an assistant that reads no script (llmstxt.org). */
function llms(): string {
  const count = GAME_IDS.length;
  const section = (lang: Lang): string => {
    const words = SITE_WORDS[lang];
    const games = GAME_IDS.map((game) => `- [${GAMES[game].title[lang]}](${ORIGIN}${gamePath(lang, game)}): ${GAMES[game].summary[lang]} ${players(lang, game)}.`);
    return `## ${words.home.games} (${LANG_NAMES[lang]})\n\n- [${words.home.heading(count)}](${ORIGIN}${homePath(lang)}): ${words.frame.footer}.\n${games.join("\n")}`;
  };
  const first = SITE_WORDS[FALLBACK_LANG];
  return `# ${SITE_NAME}

> ${first.home.lead(count)}

${first.frame.notTheShow}

- [${first.frame.play}](${ORIGIN}/): the game itself, which needs JavaScript. The pages below are read without it.

${[FALLBACK_LANG, ...LANGS.filter((lang) => lang !== FALLBACK_LANG)].map(section).join("\n\n")}
`;
}

/** Every file of the site besides the game's own page: the pages, and what tells a crawler where they are. */
export function siteFiles(sheets: Sheets, built: Built): SiteFile[] {
  const pages = LANGS.flatMap((lang) => [
    { path: `${lang}/index.html`, body: homePage(lang, built) },
    ...GAME_IDS.map((game) => ({ path: `${gamePath(lang, game).slice(1)}index.html`, body: gamePage(lang, game, sheets[game][lang], built) })),
  ]);
  return [...pages, { path: "sitemap.xml", body: sitemap() }, { path: "robots.txt", body: robots() }, { path: "llms.txt", body: llms() }];
}
