import type { Metadata } from "next";
import { Outfit, Public_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import AuthProvider from "../components/AuthProvider";
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
  title: "Kylani — find your first hundred buyers in ten minutes",
  description:
    "Paste your URL. Kylani finds the people who want what you built, writes to each one, and tells you who's actually buying.",
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
        <Analytics />
      </body>
    </html>
  );
}
