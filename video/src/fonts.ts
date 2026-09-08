/**
 * Fonts load through @remotion/google-fonts rather than a stylesheet link: it
 * registers a delayRender handle, so the renderer waits for the real faces
 * instead of capturing frames in a fallback.
 *
 * Weights and subsets are pinned to what the films actually set. Left open,
 * each font pulls every weight and script — ~70 requests per render.
 */
import { loadFont as loadDisplay } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadBody } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/IBMPlexMono";

loadDisplay("normal", { subsets: ["latin"], weights: ["500", "600", "700"], ignoreTooManyRequestsWarning: true });
loadBody("normal", { subsets: ["latin"], weights: ["400", "500", "600"], ignoreTooManyRequestsWarning: true });
loadMono("normal", { subsets: ["latin"], weights: ["400", "600", "700"], ignoreTooManyRequestsWarning: true });
