export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "dinero-theme";

/**
 * Runs synchronously in <head>, before hydration, so the correct theme
 * class is on <html> before first paint - the standard no-FOUC pattern
 * (this is what next-themes does internally too, hand-rolled here rather
 * than adding a dependency for one script). See components/settings/
 * theme-toggle.tsx for the control that writes THEME_STORAGE_KEY.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');var d=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;
