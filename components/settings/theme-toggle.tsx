"use client";

import { useSyncExternalStore } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEME_STORAGE_KEY, type ThemePreference } from "@/lib/theme";

const CHANGE_EVENT = "dinero-theme-change";

function applyTheme(preference: ThemePreference) {
  const isDark =
    preference === "dark" ||
    (preference === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", isDark);
}

function getSnapshot(): ThemePreference {
  return (localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference | null) ?? "system";
}

// Server has no localStorage - matches lib/theme.ts's inline script, which
// falls back to the same "system" default before it ever runs client-side.
function getServerSnapshot(): ThemePreference {
  return "system";
}

function subscribe(callback: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  // The OS scheme changing doesn't change the *stored preference* string
  // ("system" stays "system"), so useSyncExternalStore alone wouldn't
  // know to re-apply - do that here directly rather than through a
  // render-driven effect.
  const onSystemChange = () => {
    if (getSnapshot() === "system") applyTheme("system");
    callback();
  };
  media.addEventListener("change", onSystemChange);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    media.removeEventListener("change", onSystemChange);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

const OPTIONS: { value: ThemePreference; label: string; icon: typeof SunIcon }[] = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "system", label: "System", icon: MonitorIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
];

export function ThemeToggle() {
  const preference = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function select(next: ThemePreference) {
    localStorage.setItem(THEME_STORAGE_KEY, next);
    applyTheme(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  return (
    <div className="inline-flex rounded-lg border p-1">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => select(value)}
          aria-pressed={preference === value}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors lg:py-1.5",
            preference === value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-4" />
          {label}
        </button>
      ))}
    </div>
  );
}
