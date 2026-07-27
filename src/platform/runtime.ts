/**
 * Runtime composition root.
 *
 * Cadmium ships three shells from one renderer: desktop (Tauri Windows),
 * mobile (Tauri Android), and a browser preview that explains the app is not
 * available there. Exactly one runtime is selected at boot from the ambient
 * environment that Tauri injects, and the matching shell is rendered.
 */

import type { EnginePlaybackSnapshot } from "../shared/playback/engine";

export type PlatformId = "desktop" | "android" | "web";

export interface PlatformCapabilities {
  /** How the library is ingested. */
  importMode: "folders" | "media-store" | "none";
  /** Playback continues with the screen locked. */
  backgroundPlayback: boolean;
  /** The platform owns a native queue (Media3 session vs WebView queue). */
  nativeQueue: boolean;
  /** Live decoded PCM is available to the WebGL host. */
  pcmVisualization: boolean;
  /** Folder + Spotify ingestion. */
  spotifyImport: boolean;
  /** AI playlist generation. */
  aiPlaylists: boolean;
  /** AI DJ. */
  dj: boolean;
  /** Fish voice narration. */
  fishVoice: boolean;
  /** On-device transcription. */
  localTranscription: boolean;
}

export interface MusicProviderRef {
  readonly id: string;
  readonly displayName: string;
  getLibrary(): Promise<unknown>;
}

export interface CadmiumRuntime {
  readonly platform: PlatformId;
  readonly capabilities: PlatformCapabilities;
  /** Platform-specific library provider (or null in the browser preview). */
  readonly library: MusicProviderRef | null;
  /** Platform-specific playback engine, or null when unavailable. */
  readonly playback: import("../shared/playback/engine").PlaybackEngine | null;
}

const DESKTOP_CAPABILITIES: PlatformCapabilities = {
  importMode: "folders",
  backgroundPlayback: true,
  nativeQueue: false,
  pcmVisualization: false,
  spotifyImport: true,
  aiPlaylists: true,
  dj: true,
  fishVoice: true,
  localTranscription: true,
};

const ANDROID_CAPABILITIES: PlatformCapabilities = {
  importMode: "media-store",
  backgroundPlayback: true,
  nativeQueue: true,
  pcmVisualization: false,
  spotifyImport: false,
  aiPlaylists: false,
  dj: false,
  fishVoice: false,
  localTranscription: false,
};

const WEB_CAPABILITIES: PlatformCapabilities = {
  importMode: "none",
  backgroundPlayback: false,
  nativeQueue: false,
  pcmVisualization: false,
  spotifyImport: false,
  aiPlaylists: false,
  dj: false,
  fishVoice: false,
  localTranscription: false,
};

/** Detect the active platform from signals Tauri sets on the window. */
export function detectPlatform(): PlatformId {
  if (typeof window === "undefined") {
    return "web";
  }
  // Dev-only override for the browser preview, e.g. ?platform=android&preview=1.
  // In a real Tauri app the URL has no query string, so this is a no-op there.
  if (typeof window.location !== "undefined") {
    const override = new URLSearchParams(window.location.search).get("platform");
    if (override === "android" || override === "desktop" || override === "web") {
      return override;
    }
  }
  const flags = (window as unknown as { __CADMIUM__?: Record<string, unknown> })
    .__CADMIUM__;
  if (flags && typeof flags.platform === "string") {
    if (flags.platform === "android") return "android";
    if (flags.platform === "desktop") return "desktop";
  }
  // Tauri injects its own markers; fall back to capability probing.
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    // Strongest real-device signal: our Kotlin PermissionBridge injects
    // window.__CADMIUM_ANDROID__ on the actual Android app (see
    // PermissionBridge.kt). If present, we are definitely on device.
    if ((window as unknown as { __CADMIUM_ANDROID__?: unknown }).__CADMIUM_ANDROID__) {
      return "android";
    }
    // The Android WebView exposes "Android" in its userAgent, available
    // synchronously before any app JS runs (unlike the async-injected
    // bridge globals). Use that as the authoritative fallback so the device
    // renders the mobile shell instead of the desktop UI.
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    if (/Android/i.test(ua)) return "android";
    return "desktop";
  }
  return "web";
}

export function capabilitiesFor(platform: PlatformId): PlatformCapabilities {
  switch (platform) {
    case "desktop":
      return DESKTOP_CAPABILITIES;
    case "android":
      return ANDROID_CAPABILITIES;
    case "web":
      return WEB_CAPABILITIES;
  }
}

/** Whether the runtime can actually play audio and present a library. */
export function runtimeIsUsable(runtime: CadmiumRuntime): boolean {
  return runtime.library !== null && runtime.playback !== null;
}

export type { EnginePlaybackSnapshot };
