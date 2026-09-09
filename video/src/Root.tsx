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
    </>
  );
};
