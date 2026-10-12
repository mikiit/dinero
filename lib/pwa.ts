// Pure platform detection for the "Install app" card. Installation works
// differently per platform, so the card has to tell them apart:
//  - Android / desktop Chrome fire `beforeinstallprompt`, which we can turn
//    into a real "Install" button;
//  - iOS Safari never fires it - the only way is Share -> Add to Home
//    Screen, which the app can only explain, not trigger.

export type InstallPlatform =
  | "installed" // already running as an installed app
  | "ios-safari" // iPhone/iPad Safari: manual steps work
  | "ios-other" // iOS but not Safari: Add to Home Screen is unavailable
  | "other"; // everything else; Chrome/Android handled by the prompt event

export function isIos(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  // iPadOS 13+ reports itself as a Mac; the touch screen gives it away.
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

/** iOS browsers other than Safari (Chrome, Firefox, Edge, ...) all use
 * WebKit but can't add a home-screen app on older iOS versions; their user
 * agents carry a distinguishing token. */
function isIosNonSafari(userAgent: string): boolean {
  return /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA\//.test(userAgent);
}

export function detectInstallPlatform(env: {
  userAgent: string;
  maxTouchPoints: number;
  /** matchMedia("(display-mode: standalone)").matches */
  displayModeStandalone: boolean;
  /** navigator.standalone - iOS's own flag for a home-screen app. */
  iosStandalone: boolean;
}): InstallPlatform {
  if (env.displayModeStandalone || env.iosStandalone) return "installed";
  if (isIos(env.userAgent, env.maxTouchPoints)) {
    return isIosNonSafari(env.userAgent) ? "ios-other" : "ios-safari";
  }
  return "other";
}
