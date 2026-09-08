import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setCodec("h264");
Config.setCrf(17);
Config.setOverwriteOutput(true);
// The scenes lean on mix-blend and SVG filters; the ANGLE backend keeps those
// honest and the render fast.
Config.setChromiumOpenGlRenderer("angle");

// Render with the Chrome that is already installed rather than pulling
// Remotion's own headless shell. Set REMOTION_BROWSER to point elsewhere, or
// delete this block to let Remotion download its own (~150MB).
const localChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
Config.setBrowserExecutable(process.env.REMOTION_BROWSER ?? localChrome);

// Remotion's default spins up several Chrome tabs against a bundle server;
// here the extra tabs cannot reach it ("got no response"). One tab still
// captures at ~25ms/frame, so this costs nothing in practice. The port is
// left unset on purpose, so Remotion picks whichever one is free.
Config.setConcurrency(1);
