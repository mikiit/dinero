"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A thin progress bar across the top that starts the instant a link to
 * another page (or another month / currency / filter of the same page) is
 * tapped, and completes when the new URL has rendered. On a phone a server
 * render can take a moment, and without this a tap gives no sign it landed.
 *
 * The App Router has no navigation events to hook, so this listens for
 * clicks on in-app links and watches the URL for the result. The bar is
 * driven straight through the DOM rather than React state: it is purely
 * visual and updates several times a second.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const barRef = useRef<HTMLDivElement>(null);
  const controls = useRef<{ start: () => void; finish: () => void } | null>(null);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;

    let width = 0;
    let active = false;
    let trickle: number | undefined;
    let hide: number | undefined;
    let safety: number | undefined;

    const paint = (w: number, opacity: number, ms: number) => {
      el.style.transition = `width ${ms}ms ease-out, opacity 200ms ease-out`;
      el.style.width = `${w}%`;
      el.style.opacity = String(opacity);
    };

    const start = () => {
      if (active) return;
      active = true;
      window.clearTimeout(hide);
      width = 15;
      el.style.transition = "none";
      el.style.width = "0%";
      el.style.opacity = "1";
      void el.offsetWidth; // commit the reset before animating from it
      paint(width, 1, 200);
      // Creep toward 90% and wait there: the real finish is the URL changing.
      trickle = window.setInterval(() => {
        width += (90 - width) * 0.12;
        paint(width, 1, 300);
      }, 300);
      // A link that never changes the URL (a download, an error) must not
      // leave the bar hanging.
      safety = window.setTimeout(() => controls.current?.finish(), 8000);
    };

    const finish = () => {
      if (!active) return;
      active = false;
      window.clearInterval(trickle);
      window.clearTimeout(safety);
      paint(100, 1, 150);
      hide = window.setTimeout(() => {
        paint(100, 0, 0);
        hide = window.setTimeout(() => {
          el.style.transition = "none";
          el.style.width = "0%";
        }, 250);
      }, 200);
    };

    controls.current = { start, finish };

    function onClick(e: MouseEvent) {
      // Not a plain left click: opening in a new tab etc. does not navigate here.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a");
      if (!anchor) return;
      if (anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // API routes (e.g. the CSV export) are downloads, not pages.
      if (url.pathname.startsWith("/api/")) return;
      // Same page, same query: a hash jump or a no-op tap.
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }
      start();
    }

    // Capture phase: runs before Next's own link handler, so the bar is
    // already moving when navigation begins.
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.clearInterval(trickle);
      window.clearTimeout(hide);
      window.clearTimeout(safety);
    };
  }, []);

  // The new page has rendered.
  useEffect(() => {
    controls.current?.finish();
  }, [pathname, search]);

  return (
    <div
      ref={barRef}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[100] h-[3px] w-0 bg-primary opacity-0"
    />
  );
}
