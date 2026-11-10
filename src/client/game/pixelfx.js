// The three effects the table uses, from the pixelfx library pinned in vendor/pixelfx
// (MIT; see vendor/pixelfx/LICENSE and NOTICE.md). Kept as plain JavaScript, with its
// types beside it in pixelfx.d.ts, because the library ships no type declarations.
export { clearFrame, composite, createFrame, createFx } from "../../../vendor/pixelfx/src/core/index.js";
export * as muzzlePistol from "../../../vendor/pixelfx/src/fx/projectiles/muzzle-pistol.js";
export * as poof from "../../../vendor/pixelfx/src/fx/spawn/poof.js";
export * as confetti from "../../../vendor/pixelfx/src/fx/ui/confetti.js";
