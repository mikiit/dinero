"use client";

import { useEffect } from "react";

/** Registers /sw.js once the page has loaded. Production only: in dev a
 * worker would cache stale build output and make every edit look broken. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => console.error("service worker registration failed", err));
    };

    // After load, so registering never competes with the page's first paint.
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
