import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Nav } from "@/components/nav";
import { Aurora } from "@/components/brand";
import { Footer } from "@/components/footer";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  weight: ["500", "600", "700"],
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "REFRACT · Split every swap into its best route",
    template: "%s · REFRACT",
  },
  description:
    "A routing exchange for Robinhood Chain. Compare every venue on chain 4663, trade from your own wallet, and track launch pools the moment they go live.",
  openGraph: {
    title: "REFRACT · Split every swap into its best route",
    description:
      "Compare every venue on Robinhood Chain, trade from your own wallet, and track launch pools live.",
    siteName: "REFRACT",
    type: "website",
  },
  // Attributes the link card to the account when the site is shared on X.
  twitter: {
    card: "summary",
    site: "@RefractHq_",
    creator: "@RefractHq_",
    title: "REFRACT · Split every swap into its best route",
    description:
      "Compare every venue on Robinhood Chain, trade from your own wallet, and track launch pools live.",
  },
};

export const viewport: Viewport = {
  themeColor: "#050705",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className={`${inter.variable} ${spaceGrotesk.variable} ${plexMono.variable}`}>
        <Providers>
          <Aurora />
          <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
            <Nav />
            <main style={{ flex: 1 }}>{children}</main>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}
