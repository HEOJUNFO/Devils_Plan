// Draws the sheet of national flags that 만국기 (Flags Around the World) shows.
//
//   node tools/flag-sprite.mjs <the "flags/4x3" folder of the flag-icons package>
//
// It reads the flags `src/shared/games/flags-around-the-world/flags.json`
// lists (the 193 member states of the United Nations, by the two letters of
// each), makes each of them a small picture of a few colours, and lays them
// side by side in `public/flags-v1.png`, in the order of the list. The game's
// screen cuts a flag out of the sheet by its place in the list, so the two
// are written together: after the list changes, this is run again.
//
// The pictures are those of flag-icons 7.6.0 (Panayiotis Lipiridis, MIT),
// four by three whatever a flag's own proportions are. The package is not a
// dependency of the project: it is fetched to a folder of its own with
// `npm pack flag-icons` when the sheet has to be drawn again.
// `assets/provenance.yaml` has the entry.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const LIST = new URL("../src/shared/games/flags-around-the-world/flags.json", import.meta.url);
const OUT = new URL("../public/flags-v1.png", import.meta.url);
/** How many colours one flag is drawn with at most: few, so that a flag is flat areas with hard edges, as the rest of the game is drawn. */
const COLOURS = 12;

const from = process.argv[2];
if (from === undefined) {
  console.error('usage: node tools/flag-sprite.mjs <the "flags/4x3" folder of flag-icons>');
  process.exit(2);
}

const { cell, columns, ids } = JSON.parse(readFileSync(LIST, "utf8"));
const [width, height] = cell;
const rows = Math.ceil(ids.length / columns);

const pieces = [];
for (const [at, id] of ids.entries()) {
  const svg = readFileSync(join(from, `${id}.svg`));
  // drawn large, brought down to the cell, then to a few colours without dithering
  const small = await sharp(svg, { density: 144 }).resize(width, height, { fit: "fill", kernel: "lanczos3" }).flatten({ background: "#ffffff" }).png().toBuffer();
  const flat = await sharp(small).png({ palette: true, colours: COLOURS, dither: 0 }).toBuffer();
  pieces.push({ input: flat, left: (at % columns) * width, top: Math.floor(at / columns) * height });
}

const sheet = await sharp({ create: { width: columns * width, height: rows * height, channels: 3, background: "#000000" } })
  .composite(pieces)
  .png({ compressionLevel: 9 })
  .toBuffer();
writeFileSync(OUT, sheet);
console.log(`${ids.length} flags of ${width} by ${height}, ${columns} to a row: ${sheet.length} bytes`);
