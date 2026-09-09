# REFRACT — video

Four films for REFRACT, rendered with [Remotion](https://remotion.dev) (React → MP4).
Everything is drawn in code: no stock footage, no image assets, same palette and
type as the app (`src/app/globals.css`).

## The mascot

**Facet** — a living prism shard. Same triangle as the product mark, so the
mascot and the logo read as the same object. He takes white light in on one
side and throws a spectrum out the other, which is the product in one gesture.

He lives in `src/Mascot.tsx` as a single rigged SVG. Nothing in the character
animates by itself; scenes drive the rig, which keeps every frame
deterministic for the renderer.

| prop | what it does |
| --- | --- |
| `expression` | `idle` · `happy` · `wow` · `focus` · `cheer` (brows + mouth) |
| `blink` | 0 open → 1 shut |
| `lookX` / `lookY` | pupil aim, roughly −6…6 |
| `armL` / `armR` | arm rotation in degrees, negative lifts |
| `tilt` | body lean |
| `glow` | outer bloom, push to 1 on beats |
| `charge` | how hot the internal refraction lines burn |

`uid` must be unique per instance on a frame — SVG gradient ids are global.

## The films

| id | length | what it says |
| --- | --- | --- |
| `Intro` | 12s | Mascot reveal. Beam in, Facet condenses out of it, spectrum out. Bumper. |
| `BestRoute` | 28s | The route engine: one trade in, six venues probed, best route wins. |
| `Cashback` | 19s | 0.12% of routed volume back to the wallet that generated it. |
| `LaunchPools` | 19s | Bonding-curve discovery, before a token graduates. |
| `PriceImpact` | 22s | Why the quote gets worse as size grows, and when we warn. |
| `CloneGuard` | 20s | Same name, same symbol, three contracts — check the address. |
| `Portfolio` | 20s | Holdings found from transfer history, no token list needed. |
| `SelfCustody` | 18s | Custody and exact-amount approvals. The slowest of the eight. |

The first four share one arrangement in A minor at 120 BPM. The second four each
carry their own progression, tempo feel and instrument set, so the set does not
sound like variations of a single track.

## The music

Original scores, synthesised from scratch in `music/` — no samples, no library,
nothing licensed. `music/synth.mjs` is a small kit (oscillators, envelopes, an
SVF filter, a Schroeder reverb) over `Float32Array`; `music/compose.mjs` is the
arrangement.

Everything is D minor at 96 BPM — a 2.5s bar, the tempo that puts BestRoute's
prism strike on bar 3 and its end card on bar 11. Under that bed, accents are
placed at the exact second each picture beat happens, read from the same frame
constants the scenes use. **If you retime a scene, retime its entry in `CUES`.**

All four are mastered to −15 LUFS so they do not jump when cut together, and
sit just under the −14 the social platforms normalise to.

```bash
node music/compose.mjs     # rewrites public/music/*.wav (needs ffmpeg on PATH)
```

To use a licensed track instead, drop it in `public/music/` and change the
`<Audio src={staticFile(...)}>` line at the top of the scene.

## Run

```bash
npm install
npm run studio      # live editor, scrub every scene
npm run render:all  # all four → out/*.mp4
```

Render one:

```bash
npx remotion render src/index.ts BestRoute out/best-route.mp4
```

## Before you post these

Two things are intentionally left for you:

1. **`SITE` in `src/theme.ts`** is empty. Fill in `url` and `handle` and every
   end card picks them up.
2. **`ROUTES` in `src/scenes/BestRoute.tsx`** carries the two figures the
   README documents as a real on-chain result (2,498.84 vs 2,485.51 USDG,
   1 ETH → USDG). The other four venues resolve to `no pool` rather than to
   invented quotes. If you want fresher numbers, pull a live `/api/quote` and
   edit that one array — nothing else in the file has to change.

The same rule shaped the other two films: `Cashback` leads with the rate rather
than a balance, because the distributor is not deployed, and says so on screen.
`LaunchPools` shows supply-sold bars and no prices, because a token on its
curve has no pool to price it from. The product's pitch is that nothing is
mocked; the videos would undercut that if they invented figures.

## Cutting for social

Post-produced variants are just ffmpeg on the rendered MP4s:

```bash
# 1:1 square, centre crop
ffmpeg -i out/refract-best-route.mp4 -vf "crop=1080:1080:420:0" out/square.mp4

# 9:16, blurred pillar box
ffmpeg -i out/refract-intro.mp4 -filter_complex \
  "[0:v]scale=1080:-1,boxblur=24[bg];[0:v]scale=1080:-1[fg];[bg]crop=1080:1920[bg2];[bg2][fg]overlay=0:(H-h)/2" \
  out/vertical.mp4
```

If vertical becomes the main format, better to add 1080×1920 compositions in
`src/Root.tsx` and lay the scenes out for it — cropping loses the right-hand
route table.
