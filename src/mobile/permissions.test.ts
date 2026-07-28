import { describe, expect, it } from "vitest";
import {
  canRequestAgain,
  libraryUsable,
  resolveNativePermissionState,
  resolvePermissionStatus,
  shouldExplain,
  type PermissionState,
} from "./permissions";

describe("android permission states", () => {
  it("maps a fresh grant to granted and unblocks the library", () => {
    const decision = resolvePermissionStatus({ granted: true, shouldShowRationale: false });
    expect(decision.state).toBe("granted");
    expect(decision.canOpenSettings).toBe(false);
    expect(libraryUsable("granted")).toBe(true);
  });

  it("maps a dismissible denial to denied with a retry path", () => {
    const decision = resolvePermissionStatus({ granted: false, shouldShowRationale: true });
    expect(decision.state).toBe("denied");
    expect(decision.canOpenSettings).toBe(false);
    expect(canRequestAgain("denied")).toBe(true);
    expect(libraryUsable("denied")).toBe(false);
  });

  it("maps a permanent denial to permanentlyDenied with a settings shortcut", () => {
    const decision = resolvePermissionStatus({ granted: false, shouldShowRationale: false });
    expect(decision.state).toBe("permanentlyDenied");
    expect(decision.canOpenSettings).toBe(true);
    expect(canRequestAgain("permanentlyDenied")).toBe(false);
    expect(libraryUsable("permanentlyDenied")).toBe(false);
  });

  it("maps the selected native audio permission state without mixing API-level aliases", () => {
    expect(resolveNativePermissionState("granted").state).toBe("granted");
    expect(resolveNativePermissionState("prompt-with-rationale").state).toBe("denied");
    expect(resolveNativePermissionState("denied").state).toBe("permanentlyDenied");
    expect(resolveNativePermissionState("prompt").state).toBe("unknown");
  });

  it("explains on unknown and denied, but not on granted or permanent denial", () => {
    const table: Record<PermissionState, boolean> = {
      unknown: true,
      granted: false,
      denied: true,
      permanentlyDenied: false,
    };
    for (const [state, expected] of Object.entries(table)) {
      expect(shouldExplain(state as PermissionState)).toBe(expected);
    }
  });
});
