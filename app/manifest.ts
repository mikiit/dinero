import type { MetadataRoute } from "next";

// The web app manifest: what makes "Add to Home Screen" / "Install app" turn
// this site into an app with its own icon and a full-screen window.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Dinero",
    short_name: "Dinero",
    description: "Personal expense tracker",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Splash/window colors. The app supports light and dark, which a
    // manifest can't express; layout.tsx sets per-scheme theme-color meta
    // tags that override theme_color in the browser chrome.
    background_color: "#ffffff",
    theme_color: "#c47c00",
    lang: "en",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
