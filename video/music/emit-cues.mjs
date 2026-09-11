/**
 * Bundles `src/motion/script.ts` and writes the resolved beat table to
 * `music/motion-cues.json`.
 *
 * The scripts are the single source of truth for motion-type timing. Rather
 * than restating those frames in the scorer — the mistake the hand-cued scenes
 * warn about in their own header — the scorer reads them from here, so a beat
 * that gets ten frames longer moves its own impact with it.
 *
 * esbuild already ships inside Remotion's dependencies, so this needs nothing
 * installed. Run it before `compose.mjs`; `npm run music` does both.
 */
import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.join(here, "..", "src", "motion", "script.ts");
const filmsEntry = path.join(here, "..", "src", "films", "timing.ts");

const bundle = async (file) => {
  const built = await esbuild.build({
    entryPoints: [file],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    logLevel: "warning",
  });
  return import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));
};

const built = await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  logLevel: "warning",
});

const mod = await import(
  "data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64")
);

const films = mod.FILMS.map((film) => {
  const last = film.cues[film.cues.length - 1];
  return {
    /** Composition id in `src/Root.tsx`; `render-motion.sh` renders by it. */
    id: film.id,
    slug: film.slug,
    group: film.group,
    durationInFrames: film.durationInFrames,
    /** Frame the last beat ends and the end card takes over. */
    bodyEnd: last.at + last.len,
    cues: film.cues.map((c) => ({ k: c.k, at: c.at, len: c.len, punch: !!c.punch, fan: !!c.fan })),
  };
});

/** Cumulative start frames for a shot list. */
const timingCuts = (lens, from) => {
  let at = from;
  return lens.map((l) => {
    const start = at;
    at += l;
    return start;
  });
};

const timing = await bundle(filmsEntry);
const voice = JSON.parse(fs.readFileSync(path.join(here, "voice-cues.json"), "utf8"));

/**
 * The comparison set. `quick` carries its cut frames as well as its bounds,
 * because its shot lengths live in the film and the scorer needs a hit on
 * every cut. Keep this list in step with `SHOTS` in `films/QuickCuts.tsx`.
 */
const QUICK_SHOTS = [34, 40, 30, 44, 52, 56, 52, 46];
const three = {
  dimensional: { id: "Dimensional", ...timing.DIMENSIONAL },
  speaks: { id: "FacetSpeaks", end: voice.durationInFrames - 96, duration: voice.durationInFrames },
  quick: { id: "QuickCuts", ...timing.QUICK, cuts: timingCuts(QUICK_SHOTS, timing.QUICK.start) },
};

/** The three bespoke films carry frame constants rather than a beat list. */
const bespoke = {
  "head-to-head": { id: "HeadToHead", ...timing.HEAD },
  "token-faces": { id: "TokenFaces", ...timing.FACES },
  "one-screen": { id: "OneScreen", ...timing.SCREEN },
  "shielded-flow": { id: "ShieldedFlow", ...timing.SHIELD },
};

const out = path.join(here, "motion-cues.json");
fs.writeFileSync(out, JSON.stringify({ fps: 30, films, bespoke, three }, null, 2) + "\n");
console.log(
  `motion-cues.json  ${films.length} films  ${films.reduce((n, f) => n + f.cues.length, 0)} beats  ` +
  `+ ${Object.keys(bespoke).length} bespoke  + ${Object.keys(three).length} comparison`
);
