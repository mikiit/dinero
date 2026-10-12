import { describe, expect, it } from "vitest";
import { detectInstallPlatform, isIos } from "./pwa";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.0.0 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
const MAC_SAFARI = IPAD_AS_MAC;

const base = { maxTouchPoints: 0, displayModeStandalone: false, iosStandalone: false };

describe("isIos", () => {
  it("recognises iPhone and iPad user agents", () => {
    expect(isIos(IPHONE_SAFARI, 5)).toBe(true);
  });

  it("recognises iPadOS, which pretends to be a Mac, by its touch screen", () => {
    expect(isIos(IPAD_AS_MAC, 5)).toBe(true);
    expect(isIos(MAC_SAFARI, 0)).toBe(false); // a real Mac has no touch points
  });

  it("is false for Android", () => {
    expect(isIos(ANDROID_CHROME, 5)).toBe(false);
  });
});

describe("detectInstallPlatform", () => {
  it("says installed when running as a home-screen app, on any platform", () => {
    expect(
      detectInstallPlatform({ ...base, userAgent: ANDROID_CHROME, displayModeStandalone: true }),
    ).toBe("installed");
    expect(
      detectInstallPlatform({ ...base, userAgent: IPHONE_SAFARI, maxTouchPoints: 5, iosStandalone: true }),
    ).toBe("installed");
  });

  it("separates iOS Safari (manual steps work) from other iOS browsers", () => {
    expect(
      detectInstallPlatform({ ...base, userAgent: IPHONE_SAFARI, maxTouchPoints: 5 }),
    ).toBe("ios-safari");
    expect(
      detectInstallPlatform({ ...base, userAgent: IPHONE_CHROME, maxTouchPoints: 5 }),
    ).toBe("ios-other");
  });

  it("treats iPadOS Safari as iOS Safari", () => {
    expect(
      detectInstallPlatform({ ...base, userAgent: IPAD_AS_MAC, maxTouchPoints: 5 }),
    ).toBe("ios-safari");
  });

  it("leaves Android and desktop to the install-prompt event", () => {
    expect(detectInstallPlatform({ ...base, userAgent: ANDROID_CHROME, maxTouchPoints: 5 })).toBe("other");
    expect(detectInstallPlatform({ ...base, userAgent: MAC_SAFARI })).toBe("other");
  });
});
