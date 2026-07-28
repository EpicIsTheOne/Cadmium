/**
 * Android audio permission state machine.
 *
 * Cadmium is read-only toward source audio and must never request
 * MANAGE_EXTERNAL_STORAGE. The first launch explains why audio access is
 * needed; denial leaves the app in a functional empty-library state, and a
 * permanent denial offers a jump to system settings.
 */

export type PermissionState =
  | "unknown"
  | "granted"
  | "denied"
  | "permanentlyDenied";

export interface PermissionDecision {
  readonly state: PermissionState;
  readonly canOpenSettings: boolean;
}

export type NativeAudioPermissionState =
  | "granted"
  | "denied"
  | "prompt"
  | "prompt-with-rationale";

/** Map the one API-appropriate permission selected by the native bridge. */
export function resolveNativePermissionState(
  state: NativeAudioPermissionState,
): PermissionDecision {
  if (state === "granted") {
    return { state: "granted", canOpenSettings: false };
  }
  if (state === "prompt") {
    return { state: "unknown", canOpenSettings: false };
  }
  if (state === "prompt-with-rationale") {
    return { state: "denied", canOpenSettings: false };
  }
  return { state: "permanentlyDenied", canOpenSettings: true };
}

/** Pure transition helper — retained for callers that report booleans. */
export function resolvePermissionStatus(raw: {
  granted: boolean;
  shouldShowRationale: boolean;
}): PermissionDecision {
  if (raw.granted) {
    return { state: "granted", canOpenSettings: false };
  }
  // On Android, if the system no longer offers a rationale prompt the user has
  // denied permanently (or toggled it off in settings).
  return {
    state: raw.shouldShowRationale ? "denied" : "permanentlyDenied",
    canOpenSettings: !raw.shouldShowRationale,
  };
}

/** After a rescan completes, the library is usable only with a grant. */
export function libraryUsable(state: PermissionState): boolean {
  return state === "granted";
}

/** Whether the first-launch explanation screen should be shown. */
export function shouldExplain(state: PermissionState): boolean {
  return state === "unknown" || state === "denied";
}

/** A permanent denial still loads the (empty) shell but blocks scans. */
export function canRequestAgain(state: PermissionState): boolean {
  return state === "denied";
}
