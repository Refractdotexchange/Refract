import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Pin tracing to this project; a lockfile higher up the tree confuses inference.
  outputFileTracingRoot: __dirname,
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
};

export default config;
