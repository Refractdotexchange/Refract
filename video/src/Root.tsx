import React from "react";
import { Composition } from "remotion";
import "./fonts";
import { FPS, W, H } from "./theme";
import { Intro } from "./scenes/Intro";
import { BestRoute } from "./scenes/BestRoute";
import { Cashback } from "./scenes/Cashback";
import { LaunchPools } from "./scenes/LaunchPools";
import { PriceImpact } from "./scenes/PriceImpact";
import { CloneGuard } from "./scenes/CloneGuard";
import { Portfolio } from "./scenes/Portfolio";
import { SelfCustody } from "./scenes/SelfCustody";
import { AnyAmount } from "./scenes/AnyAmount";
import { HeadToHead } from "./films/HeadToHead";
import { TokenFaces } from "./films/TokenFaces";
import { OneScreen } from "./films/OneScreen";
import { ShieldedFlow } from "./films/ShieldedFlow";
import { PrivateSwap } from "./films/PrivateSwap";
import { Dimensional } from "./films/Dimensional";
import { FacetSpeaks } from "./films/FacetSpeaks";
import { QuickCuts } from "./films/QuickCuts";
import { HEAD, FACES, SCREEN, SHIELD, PSWAP, DIMENSIONAL, QUICK } from "./films/timing";
import voiceCues from "../music/voice-cues.json";
import { MotionFilm } from "./motion/MotionFilm";
import { FILMS } from "./motion/script";

export const RemotionRoot: React.FC = () => {
  const base = { fps: FPS, width: W, height: H } as const;
  return (
    <>
      {/* 12s bumper — mascot reveal. Also works cut onto the head of the others. */}
      <Composition id="Intro" component={Intro} durationInFrames={360} {...base} />
      {/* 28s core explainer — the route engine. */}
      <Composition id="BestRoute" component={BestRoute} durationInFrames={840} {...base} />
      {/* 19s — routing cashback. */}
      <Composition id="Cashback" component={Cashback} durationInFrames={570} {...base} />
      {/* 19s — launch pool discovery. */}
      <Composition id="LaunchPools" component={LaunchPools} durationInFrames={570} {...base} />
      {/* 22s — price impact: why the quote gets worse as size grows. */}
      <Composition id="PriceImpact" component={PriceImpact} durationInFrames={660} {...base} />
      {/* 20s — clone detection: same name, different contract. */}
      <Composition id="CloneGuard" component={CloneGuard} durationInFrames={600} {...base} />
      {/* 20s — portfolio discovered from transfer history. */}
      <Composition id="Portfolio" component={Portfolio} durationInFrames={600} {...base} />
      {/* 18s — custody and exact-amount approvals. */}
      <Composition id="SelfCustody" component={SelfCustody} durationInFrames={540} {...base} />
      {/* 22s — the shielded pool with hidden amounts: no denominations, and
          partial spends that leave the change unpublished. */}
      <Composition id="AnyAmount" component={AnyAmount} durationInFrames={660} {...base} />

      {/* Three bespoke films, each with a visual language of its own rather
          than a variation on the explainers: a side-by-side comparison, a
          generative one, and the product's own interface driven end to end.
          Frame constants live in `films/timing.ts` so the scorer reads the
          same numbers the picture does. */}
      <Composition id="HeadToHead" component={HeadToHead} durationInFrames={HEAD.duration} {...base} />
      <Composition id="TokenFaces" component={TokenFaces} durationInFrames={FACES.duration} {...base} />
      <Composition id="OneScreen" component={OneScreen} durationInFrames={SCREEN.duration} {...base} />
      <Composition id="ShieldedFlow" component={ShieldedFlow} durationInFrames={SHIELD.duration} {...base} />
      <Composition id="PrivateSwap" component={PrivateSwap} durationInFrames={PSWAP.duration} {...base} />

      {/* Three treatments of the same brand, built to be compared: a camera
          orbiting an extruded Facet, Facet speaking to camera with the lip
          sync driven by the recorded take, and a fast caption cut. */}
      <Composition id="Dimensional" component={Dimensional} durationInFrames={DIMENSIONAL.duration} {...base} />
      <Composition id="FacetSpeaks" component={FacetSpeaks} durationInFrames={voiceCues.durationInFrames} {...base} />
      <Composition id="QuickCuts" component={QuickCuts} durationInFrames={QUICK.duration} {...base} />

      {/* Motion type — thirteen type-driven cuts. Where the eight above draw
          the product, these draw the writing, and Facet reacts from the corner
          rather than demonstrating. Every one is a script in
          `motion/script.ts`, so the composition list is generated rather than
          hand-maintained: add a film there and it appears here. */}
      {FILMS.map((film) => (
        <Composition
          key={film.id}
          id={film.id}
          component={MotionFilm}
          durationInFrames={film.durationInFrames}
          defaultProps={{ film }}
          {...base}
        />
      ))}
    </>
  );
};
