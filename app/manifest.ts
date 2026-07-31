import type { MetadataRoute } from "next";

// Web app manifest. This is what lets Android offer "Install app" and what supplies the icon a
// mobile browser uses on the home screen — the SVG favicon covers desktop tabs, but neither
// platform will use an SVG for a home-screen shortcut, hence the PNG set.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kylani — find your first hundred buyers",
    short_name: "Kylani",
    description: "Find the people already describing the problem you solve, and write to each one in your own voice.",
    start_url: "/app",
    // standalone drops the browser chrome once installed, which is the whole point of adding it to
    // the home screen — it should open like an app, not a bookmark.
    display: "standalone",
    background_color: "#efebe5",
    theme_color: "#e4572e",
    orientation: "portrait-primary",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android crops icons to the launcher's shape, so the maskable version carries extra padding
      // to keep the wingtips inside the safe zone.
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
