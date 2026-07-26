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
    // Android runtime is assembled by the mobile entry; this branch is only
    // reached if the renderer is shared. Fall back to a usable desktop wiring.
    return createDesktopRuntime();
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
