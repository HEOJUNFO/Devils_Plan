// IndexNow: tells the search engines that take part in it (Bing, Naver,
// Yandex, Seznam, Yep) which addresses of the site are new or changed, so
// they are read now and not when a crawler next comes by. Bing's index is the
// one ChatGPT's search and Copilot answer from.
//
// The addresses are the ones the deployed sitemap lists, so this is run after
// a push that changed a page a search engine reads has been deployed. It is
// not part of a push: it adds nothing to the time a push takes.
//
// Whose site it is, IndexNow knows by a key: a file at the site's root named
// after the key and holding it (`public/<key>.txt`). The key is not a secret:
// it is served to anyone.
//
// Usage:
//   npm run indexnow -- --dry    # print what would be sent, send nothing
//   npm run indexnow             # send it
//   npm run indexnow -- https://another.address

import { readdirSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const origin = (args.find((arg) => !arg.startsWith("--")) ?? "https://play.brain-survival.workers.dev").replace(/\/$/, "");
const publicDir = new URL("../public/", import.meta.url);

/** The key: the one file of `public/` that is named after what it holds. */
const keys = readdirSync(publicDir)
  .filter((name) => /^[0-9a-f]{32}\.txt$/.test(name))
  .map((name) => name.slice(0, -".txt".length))
  .filter((key) => readFileSync(new URL(`${key}.txt`, publicDir), "utf8").trim() === key);
if (keys.length !== 1) throw new Error(`expected one key file in public/, found ${keys.length}`);
const key = keys[0];
const keyLocation = `${origin}/${key}.txt`;

// the deployed site has to be serving the key, or the engines refuse what is sent
const served = await fetch(keyLocation);
if (!served.ok || (await served.text()).trim() !== key) throw new Error(`${keyLocation} does not serve the key (${served.status}): deploy first`);

const sitemap = await (await fetch(`${origin}/sitemap.xml`)).text();
const urlList = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1]);
if (urlList.length === 0) throw new Error("the sitemap lists no address");

const body = { host: new URL(origin).host, key, keyLocation, urlList };
console.log(JSON.stringify(body, null, 2));
if (dry) {
  console.log(`dry run: ${urlList.length} addresses, nothing sent`);
} else {
  const answer = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  // 200: taken. 202: taken, the key is still to be checked. Anything else is a refusal.
  console.log(`IndexNow answered ${answer.status} ${answer.statusText} for ${urlList.length} addresses`);
  if (answer.status !== 200 && answer.status !== 202) process.exitCode = 1;
}
