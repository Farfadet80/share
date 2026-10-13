import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Partage",
    short_name: "Partage",
    description: "Partage d'écran consenti entre un téléphone et un ordinateur.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f1e7",
    theme_color: "#f6f1e7",
    lang: "fr",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
