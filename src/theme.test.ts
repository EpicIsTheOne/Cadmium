import { describe, it, expect, beforeEach } from "vitest";
import { THEMES, applyTheme, getTheme, getThemeId } from "./theme";

describe("theme system", () => {
  beforeEach(() => localStorage.clear());

  it("ships at least the nocturne default plus extras", () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(4);
    expect(THEMES[0].id).toBe("nocturne");
  });

  it("applyTheme writes tokens + persists the selection", () => {
    applyTheme("violet");
    expect(getThemeId()).toBe("violet");
    expect(document.documentElement.getAttribute("data-theme")).toBe("violet");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#a06bff");
    expect(document.documentElement.style.getPropertyValue("--accent-line")).toBe("rgba(160, 107, 255, 0.18)");
  });

  it("getTheme falls back to nocturne for unknown ids", () => {
    expect(getTheme("does-not-exist").id).toBe("nocturne");
    expect(getThemeId()).toBe("nocturne");
  });

  it("restores the persisted selection on next read", () => {
    applyTheme("ember");
    expect(getThemeId()).toBe("ember");
    // simulate a fresh read from storage
    expect(getTheme().id).toBe("ember");
  });
});
