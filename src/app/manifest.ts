import type { MetadataRoute } from "next";

/// Served automatically at /manifest.webmanifest by the App Router.
/// Makes Airen installable and removes browser chrome in standalone mode.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Airen — A Retro-Futuristic Platform for build NFT",
    short_name: "AIREN",
    description:
      "Collect Astra, Sol, and Luna virtual sneaker families in a pixel-art game on Polygon.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#060d17",
    theme_color: "#060d17",
    categories: ["finance", "games", "shopping"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
