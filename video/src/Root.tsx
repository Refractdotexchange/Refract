import React from "react";
import { Composition } from "remotion";
import "./fonts";
import { FPS, W, H } from "./theme";
import { Intro } from "./scenes/Intro";
import { BestRoute } from "./scenes/BestRoute";
import { Cashback } from "./scenes/Cashback";
import { LaunchPools } from "./scenes/LaunchPools";

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
    </>
  );
};
