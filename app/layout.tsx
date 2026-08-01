import type { Metadata, Viewport } from "next";
import { Outfit, Public_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import AuthProvider from "../components/AuthProvider";
import AddToHomeScreen from "../components/AddToHomeScreen";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Kylani — your buyers are already out there",
  description:
    "You don't have a product problem, you have a discovery problem. Paste your URL and Kylani finds the people already describing what you solve — on Reddit, X, forums and the open web — then helps you say something worth replying to.",
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
  themeColor: "#efebe5",
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
    <html lang="en" className={`${outfit.variable} ${publicSans.variable}`}>
      <body style={{ fontFamily: "var(--font-public-sans), system-ui, sans-serif" }}>
        <AuthProvider>{children}</AuthProvider>
        <AddToHomeScreen />
        <Analytics />
      </body>
    </html>
  );
}
