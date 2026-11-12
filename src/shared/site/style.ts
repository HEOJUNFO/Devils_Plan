/**
 * How the pages a search engine reads look (`pages.ts`): the game's colours
 * and its pixel font, on a page that is read like a document and scrolls. The
 * game's own screen is a fixed 480 by 270 pixels; these pages are whatever
 * width the reader's screen is, a phone held upright included.
 *
 * The pixel font is drawn on a grid of 12, so its sizes here are 18, 24 and
 * 36: whole pixels on the screens most readers have. It has one weight, and
 * the browser is not left to fake a bold one.
 */

/** The style sheet, given the address the pixel font has in this build. */
export function siteStyle(font: string): string {
  return `@font-face{font-family:"Galmuri11";src:url("${font}") format("woff2");font-display:swap}
:root{--night:#0d1020;--bar:#0b0d19;--line:#2c3044;--button:#171a2a;--button-hover:#262b40;--bone:#efe6cc;--bone-dim:#a8a08a;--amber:#ffb43c;--teal:#3fd0b6;color-scheme:dark}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--night);color:var(--bone);font:18px/1.7 "Galmuri11",ui-monospace,"Apple SD Gothic Neo","Malgun Gothic",monospace;font-synthesis:none;word-break:keep-all;overflow-wrap:anywhere}
a{color:var(--teal)}
a:hover{color:var(--amber)}
a:focus-visible{outline:2px solid var(--amber);outline-offset:2px}
.top,main,.foot{max-width:760px;margin:0 auto;padding:0 20px}
.top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 16px;padding-top:16px;padding-bottom:16px;border-bottom:2px solid var(--line)}
.brand{display:inline-flex;align-items:center;gap:10px;color:var(--bone);text-decoration:none}
.brand svg{width:24px;height:24px;flex:none}
.links{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px}
.button{display:inline-block;padding:6px 16px;border:2px solid var(--amber);background:var(--button);color:var(--amber);text-decoration:none}
.button:hover{background:var(--button-hover)}
.trail{margin:24px 0 0;color:var(--bone-dim)}
h1,h2,h3{font-weight:normal;color:var(--amber);line-height:1.4}
h1{font-size:24px;margin:24px 0 16px}
.trail+h1{margin-top:8px}
h2{font-size:24px;margin:48px 0 12px;padding-top:16px;border-top:2px solid var(--line)}
h3{font-size:18px;margin:0}
p{margin:0 0 16px}
ul,ol{margin:0 0 16px;padding-left:28px}
li{margin:0 0 8px}
.lead{color:var(--bone)}
.act{margin:24px 0}
.facts{margin:0 0 16px;padding:12px 16px;border:2px solid var(--line);background:var(--bar)}
.facts div{display:flex;flex-wrap:wrap;gap:0 16px}
.facts dt{color:var(--bone-dim);min-width:6em}
.facts dd{margin:0}
.games{list-style:none;padding:0;display:grid;gap:12px}
.games li{margin:0;padding:12px 16px;border:2px solid var(--line);background:var(--bar)}
.games p{margin:4px 0 0}
.dim{color:var(--bone-dim)}
.foot{margin-top:56px;padding-top:16px;padding-bottom:40px;border-top:2px solid var(--line);color:var(--bone-dim)}
.foot p{margin:0 0 8px}
@media (min-width:640px){h1{font-size:36px;line-height:1.3}.games{grid-template-columns:1fr 1fr}}
`;
}
