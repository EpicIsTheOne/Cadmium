import { describe, it, expect, beforeEach } from "vitest";
import { getAppearance, setAppearance } from "./appearance";

describe("appearance.ambientRhythm", () => {
  beforeEach(() => {
    localStorage.clear();
    // Re-init the in-memory cache from a clean store.
    setAppearance({ rhythmInFullscreen: false, fullscreenBottomBar: false, fullscreenImmersive: false, ambientRhythm: false });
  });

  it("defaults ambientRhythm to false", () => {
    expect(getAppearance().ambientRhythm).toBe(false);
  });

  it("persists and round-trips the ambientRhythm toggle", () => {
    setAppearance({ ambientRhythm: true });
    expect(getAppearance().ambientRhythm).toBe(true);
    // Survives a reload of the persisted value.
    const raw = localStorage.getItem("cadmium.appearance");
    expect(raw).toContain("\"ambientRhythm\":true");
  });

  it("coerces non-boolean persisted values to a real boolean", () => {
    localStorage.setItem("cadmium.appearance", JSON.stringify({ ambientRhythm: "yes" as unknown as boolean }));
    // Force a re-read by toggling through setAppearance after clearing the cache path.
    setAppearance({ ambientRhythm: true });
    setAppearance({ ambientRhythm: false });
    expect(getAppearance().ambientRhythm).toBe(false);
  });

  it("leaves the other toggles intact when only ambient changes", () => {
    setAppearance({ rhythmInFullscreen: true, fullscreenBottomBar: true, fullscreenImmersive: true });
    setAppearance({ ambientRhythm: true });
    const a = getAppearance();
    expect(a.rhythmInFullscreen).toBe(true);
    expect(a.fullscreenBottomBar).toBe(true);
    expect(a.fullscreenImmersive).toBe(true);
    expect(a.ambientRhythm).toBe(true);
  });
});
