/**
 * Pulled straight from the app's design tokens (src/app/globals.css) so the
 * videos and the product read as one thing. If the palette moves there, move
 * it here too.
 */
export const C = {
  bg: "#000000",
  bg2: "#0a0a0a",
  surface: "#141414",
  surface2: "#1e1e1e",
  surface3: "#2c2c2c",
  line: "rgba(163,230,53,0.18)",
  lineSoft: "rgba(163,230,53,0.09)",
  text: "#f2f5ee",
  muted: "#9ba695",
  faint: "#67715f",

  champagne: "#e6ffb3",
  honey: "#c9f56e",
  gold: "#a3e635",
  brass: "#79b520",
  bronze: "#4b7a12",
  olive: "#a3e635",
  ember: "#ff5f56",

  white: "#f8fff0",
} as const;

/** The refracted spectrum, light to deep. Used for every ray fan in the films. */
export const SPECTRUM = ["#f8fff0", "#e6ffb3", "#c9f56e", "#a3e635", "#79b520", "#4b7a12"];

export const FONT = {
  display: '"Space Grotesk", system-ui, sans-serif',
  body: '"Inter", system-ui, sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, monospace',
};

/**
 * The end card. Fill these in once the domain and handle exist — every scene
 * reads from here, so it is a one-line change across all four films.
 */
export const SITE = {
  url: "refract.exchange",
  handle: "@RefractHq_",
  chain: "Robinhood Chain · 4663",
  /**
   * Token contract. Paste the full 0x address once the token is live and the
   * end card picks it up in all four films — it renders in full, on its own
   * line, so viewers can read it off the frame. Empty means the line is
   * omitted entirely rather than showing a placeholder.
   */
  ca: "",
};

export const FPS = 30;
export const W = 1920;
export const H = 1080;
