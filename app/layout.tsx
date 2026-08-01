import type { Metadata, Viewport } from "next";
import { Fraunces, Public_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import AuthProvider from "../components/AuthProvider";
import AddToHomeScreen from "../components/AddToHomeScreen";
import "./globals.css";

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

// The product's voice. It began as the hero's alone — one h1 and one eyebrow — and is now the
// display face wherever a heading appears, which is what retired Outfit: carrying two display
// faces to set the same kind of text in two places was a font download nobody was reading.
//
// Loaded as a variable font with its optical-size, SOFT and WONK axes exposed, because WONK is the
// entire reason to use it: it swaps in the canted, off-model glyphs that stop this reading as the
// default warm-cream serif every AI product landing page has. A static instance would ship the
// neutral shapes and none of the point. Self-hosted by next/font, so no render-blocking stylesheet
// and no layout shift when it arrives.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["SOFT", "WONK", "opsz"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kylani — find your first hundred buyers in ten minutes",
  description:
    "Paste your URL. Kylani finds the people who want what you built, writes to each one, and tells you who's actually buying.",
  // iOS reads these rather than the manifest: it has never supported the web app manifest for
  // home-screen behaviour, so the standalone flag and the title under the icon have to be declared
  // here or an installed Kylani opens inside Safari chrome with the page title beneath it.
  appleWebApp: {
    capable: true,
    title: "Kylani",
    statusBarStyle: "default",
  },
};

// The colour behind the status bar once installed. Split from `metadata` because Next 16 wants
// theme colour and viewport in their own export.
export const viewport: Viewport = {
  // Two, so the status bar matches the page rather than staying paper-coloured above a dark app.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#efebe5" },
    { media: "(prefers-color-scheme: dark)", color: "#16150f" },
  ],
  width: "device-width",
  initialScale: 1,
  // Installed apps should not rubber-band like a web page, but pinch-zoom stays available because
  // disabling it outright is an accessibility regression.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${publicSans.variable} ${fraunces.variable}`}>
      <body style={{ fontFamily: "var(--font-public-sans), system-ui, sans-serif" }}>
        <AuthProvider>{children}</AuthProvider>
        <AddToHomeScreen />
        <Analytics />
      </body>
    </html>
  );
}
