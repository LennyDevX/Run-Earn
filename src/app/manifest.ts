import type { MetadataRoute } from "next";

/// Served automatically at /manifest.webmanifest by the App Router.
/// Makes RUN&EARN installable and removes browser chrome in standalone mode.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RUN&EARN — NFT Sneakers with DeFi Benefits",
    short_name: "RUN&EARN",
    description:
      "Collect NFT sneakers on Polygon with retro-futuristic style and real utility: POL staking, rarity-based yield, veRUNE rewards, and a marketplace.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0c",
    theme_color: "#0a0a0c",
    categories: ["finance", "games", "shopping"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
