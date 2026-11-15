/**
 * The page for an address that has none: a link cut short on its way through
 * a messenger, an address typed by hand, a page that was moved. The server
 * answers with it (`src/server/index.ts`), still as 404, where it used to
 * answer with two words of English and no way on.
 *
 * It says the same in every language there are words for, the reader's first:
 * nothing is known of who followed the link but the address they asked for and
 * what their browser prefers. Each language has its own way back: the page
 * about the games, and the lobby.
 *
 * Whole in itself: the server does not know the addresses a build gives the
 * style sheet and the pixel font, so the page carries its few rules of style
 * and is set in the reader's own font.
 *
 * Pure: an address and the browser's languages in, text out.
 */
import { LANGS, chooseLang, isLang, type Lang } from "../lang";
import { escapeHtml, homePath, playPath } from "./pages";
import { SITE_NAME, SITE_WORDS } from "./words";

/** The colours and sizes of `style.ts`, as much of them as this one page uses. */
const STYLE =
  ':root{color-scheme:dark}*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:#0d1020;color:#efe6cc;font:18px/1.7 ui-monospace,"Apple SD Gothic Neo","Malgun Gothic",monospace;word-break:keep-all;overflow-wrap:anywhere}main{max-width:760px;margin:0 auto;padding:16px 20px}.brand{margin:0 0 24px;padding-bottom:16px;border-bottom:2px solid #2c3044}section+section{margin-top:32px;padding-top:16px;border-top:2px solid #2c3044}h1{font-size:24px;font-weight:normal;line-height:1.4;color:#ffb43c;margin:0 0 16px}p{margin:0 0 16px}.ways{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px}a{color:#3fd0b6}a:hover{color:#ffb43c}a:focus-visible{outline:2px solid #ffb43c;outline-offset:2px}.button{display:inline-block;padding:6px 16px;border:2px solid #ffb43c;background:#171a2a;color:#ffb43c;text-decoration:none}';

/**
 * The language an address is in, where it says: the pages a search engine
 * reads (`/en/heavy-13/`) and the pages of invitation (`/i/ko/…`) lead with
 * it. `null` for an address that names none.
 */
export function langOfAddress(pathname: string): Lang | null {
  const parts = pathname.split("/");
  const named = parts[1] === "i" ? parts[2] : parts[1];
  return isLang(named) ? named : null;
}

/**
 * The language the page for a missing address leads with: the one the address
 * is in, else the first the browser prefers that there are words for
 * (`accepted` is its `Accept-Language`, as sent), else the one a reader of
 * none is shown.
 */
export function missingLang(pathname: string, accepted: string | null): Lang {
  const preferred = (accepted ?? "").split(",").map((tag) => tag.split(";")[0].trim());
  return chooseLang(langOfAddress(pathname), null, preferred);
}

/** The page for an address that has none, `first` the language it leads with. */
export function missingPage(first: Lang): string {
  const order = [first, ...LANGS.filter((lang) => lang !== first)];
  const sections = order
    .map((lang) => {
      const words = SITE_WORDS[lang];
      return `<section lang="${lang}">
<h1>${escapeHtml(words.missing.heading)}</h1>
<p>${escapeHtml(words.missing.lead)}</p>
<p class="ways"><a class="button" href="${escapeHtml(playPath(lang))}">${escapeHtml(words.frame.play)}</a><a href="${homePath(lang)}">${escapeHtml(words.frame.home)}</a></p>
</section>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="${first}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#0d1020" />
<meta name="robots" content="noindex" />
<title>${escapeHtml(`${SITE_WORDS[first].missing.heading} | ${SITE_NAME}`)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<p class="brand">${SITE_NAME}</p>
${sections}
</main>
</body>
</html>
`;
}
