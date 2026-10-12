"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ShareIcon, SquarePlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { detectInstallPlatform, type InstallPlatform } from "@/lib/pwa";

// Chrome/Android's install prompt event; not in TypeScript's DOM types.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// The platform never changes while the page is open, so there is nothing to
// subscribe to; useSyncExternalStore is just the hydration-safe way to read
// browser-only values (the server snapshot is a neutral "other").
function subscribe() {
  return () => {};
}

function readPlatform(): InstallPlatform {
  return detectInstallPlatform({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    displayModeStandalone: window.matchMedia("(display-mode: standalone)").matches,
    iosStandalone:
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
  });
}

/**
 * "Install app" card for Settings. What it can do depends on the platform:
 * a real button where the browser allows it (Android/desktop Chrome), clear
 * steps where it doesn't (iPhone Safari), and a pointer to Safari on iOS
 * browsers that can't add to the Home Screen at all.
 */
export function InstallApp({ isAnonymous }: { isAnonymous: boolean }) {
  const platform = useSyncExternalStore<InstallPlatform>(
    subscribe,
    readPlatform,
    () => "other",
  );
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep it, so our own button can trigger it later
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setPrompt(null); // a prompt event can only be used once
  }

  if (platform === "installed" || installed) {
    return (
      <p className="text-sm text-muted-foreground">
        Dinero is installed on this device.
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      {isAnonymous && (
        <p className="rounded-md bg-primary/10 p-2 text-xs">
          You&apos;re using a temporary account tied to this browser. The
          installed app is a separate space and would start empty.{" "}
          <Link href="/login" className="font-medium underline underline-offset-2">
            Create an account first
          </Link>
          , then sign in with it on your phone.
        </p>
      )}

      {prompt ? (
        <div className="space-y-1.5">
          <Button size="sm" onClick={install}>
            Install app
          </Button>
          <p className="text-xs text-muted-foreground">
            Adds Dinero to your home screen with its own icon and a full-screen
            window.
          </p>
        </div>
      ) : platform === "ios-safari" ? (
        <div className="space-y-2 text-sm">
          <p className="font-medium">Add to your iPhone or iPad home screen</p>
          <ol className="space-y-2 text-muted-foreground">
            <li className="flex items-center gap-2">
              <span className="font-mono text-xs">1.</span>
              Tap <ShareIcon className="inline size-4 text-foreground" aria-label="Share" />{" "}
              at the bottom of Safari.
            </li>
            <li className="flex items-center gap-2">
              <span className="font-mono text-xs">2.</span>
              Choose{" "}
              <span className="inline-flex items-center gap-1 text-foreground">
                <SquarePlusIcon className="size-4" /> Add to Home Screen
              </span>
              .
            </li>
            <li className="flex items-center gap-2">
              <span className="font-mono text-xs">3.</span>
              Tap Add.
            </li>
          </ol>
        </div>
      ) : platform === "ios-other" ? (
        <p className="text-sm text-muted-foreground">
          On iPhone and iPad, Dinero can only be added to the home screen from{" "}
          <span className="font-medium text-foreground">Safari</span>. Open this
          page in Safari, then use Share → Add to Home Screen.
        </p>
      ) : (
        <div className="space-y-1.5 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Android:</span> open
            this page in Chrome, tap the ⋮ menu and choose Install app (or Add
            to Home screen).
          </p>
          <p>
            <span className="font-medium text-foreground">iPhone or iPad:</span>{" "}
            open it in Safari, tap Share, then Add to Home Screen.
          </p>
        </div>
      )}
    </div>
  );
}
