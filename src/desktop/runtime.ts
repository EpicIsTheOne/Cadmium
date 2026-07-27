/**
 * Desktop runtime composition.
 *
 * Wires the existing LocalLibraryProvider + desktop PlaybackStore (which is
 * itself the desktop PlaybackEngine) into a CadmiumRuntime. The desktop app
 * keeps its exact behavior; nothing here changes transport semantics.
 */

import { createMusicProvider, LocalLibraryProvider } from "../providers/local-library-provider";
import { desktopPlaybackEngine } from "./playback/desktop-engine-adapter";
import { detectPlatform, capabilitiesFor, type CadmiumRuntime } from "../platform/runtime";
import { isPreviewMode, createPreviewProvider, createPreviewEngine } from "../mobile/preview";

function createPreviewRuntime(): CadmiumRuntime {
  return {
    platform: "android",
    capabilities: capabilitiesFor("android"),
    library: createPreviewProvider() as unknown as CadmiumRuntime["library"],
    playback: createPreviewEngine(),
  };
}

export function createDesktopRuntime(): CadmiumRuntime {
  const provider = createMusicProvider();
  return {
    platform: "desktop",
    capabilities: capabilitiesFor("desktop"),
    library: provider as unknown as CadmiumRuntime["library"],
    playback: desktopPlaybackEngine,
  };
}

export function createRuntimeForCurrentPlatform(): CadmiumRuntime {
  const platform = detectPlatform();
  if (platform === "android") {
    // The browser preview (?platform=android&preview=1) assembles a fake
    // runtime with a sample library + fake engine so the mobile UI can be
    // screenshotted without the Android backend. On device this branch only
    // runs in the real Tauri app, where isPreviewMode() is always false.
    if (isPreviewMode()) {
      return createPreviewRuntime();
    }
    // REAL DEVICE: AppMobile assembles its own AndroidLibraryProvider and
    // AndroidPlaybackEngine from runtime.playback, so it only needs this
    // runtime to carry the correct `platform` flag (so main.tsx mounts the
    // mobile shell) plus android capabilities. Returning createDesktopRuntime()
    // here was the bug that made every phone render the Windows desktop UI.
    return {
      platform: "android",
      capabilities: capabilitiesFor("android"),
      library: null,
      playback: null,
    };
  }
  if (platform === "web") {
    return {
      platform: "web",
      capabilities: capabilitiesFor("web"),
      library: null,
      playback: null,
    };
  }
  return createDesktopRuntime();
}

export type { LocalLibraryProvider };
