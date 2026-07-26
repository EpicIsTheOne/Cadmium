# Cadmium Android Implementation Plan and Hermes Handoff

## Mission

Build a standalone Cadmium music player for Android 10 and newer inside this
repository. The Android app must scan and play music stored on the phone,
operate offline, continue playback with the screen locked, and retain Cadmium's
visual identity.

The first deliverable is a signed, sideloadable APK. It includes:

- Android MediaStore library discovery
- Songs, albums, artists, playlists, favorites, search, and recent plays
- Queue, shuffle, repeat, seek, and volume
- Media3 background playback
- Lock-screen, notification, Bluetooth, and headset controls
- A mobile-first shell, mini-player, queue sheet, and full-screen Now Playing
- A battery-conscious mobile Rhythm presentation

Do not implement iOS, desktop-to-phone sync, streaming from the desktop,
Android Auto, Cast, AI playlists, AI DJ, Fish narration, Whisper, or Play Store
publication in this pass.

## Non-negotiable repository boundary

Mobile and desktop must remain separate products that reuse an explicit shared
layer. Do not fill existing components with scattered `isAndroid` checks.

The intended source layout is:

```text
src/
  shared/
    domain/             Provider-neutral media and discovery types
    components/         Truly reusable primitives such as Icon and EmptyState
    playback/           Queue/repeat/shuffle policy and shared state types
    visualizers/        Renderer contracts, shaders, and visualizer registry
    theme/              Tokens, appearance types, and shared base styles
  desktop/
    AppDesktop.tsx
    components/
    screens/
    providers/
    playback/
    styles/
  mobile/
    AppMobile.tsx
    components/
    screens/
    providers/
    playback/
    styles/
    assets/             Android-only artwork or launch assets
  assets/
    shared/             Existing Cadmium marks, orbit art, hero art, and SVGs
  platform/
    runtime.ts          Selects desktop, Android, or browser-preview runtime
  main.tsx

src-tauri/src/
  core/
    library.rs          Shared SQLite repository and migrations
    discovery.rs        Shared deterministic library analysis
    models.rs           Shared command DTOs
  desktop/
    commands.rs
    scanner.rs          Folder and Spotify Local Files ingestion
    ai.rs
    dj.rs
    whisper.rs
  android/
    commands.rs
    media_store.rs      Rust side of the Android mobile plugin
    playback.rs         Rust command/event bridge to Media3
  lib.rs

src-tauri/gen/android/
  app/src/main/java/.../
    CadmiumMediaPlugin.kt
    CadmiumPlaybackService.kt
```

Use `git mv` when relocating existing files. Move code only after its current
tests are green, and keep moves separate from behavioral changes where
practical.

### Shared code rules

Code belongs in `shared` only when it has no Tauri desktop API, browser audio
element, Android API, filesystem-path assumption, or platform-specific UI
layout.

Reuse these existing parts:

- Normalized `Track`, `Album`, `Artist`, `Playlist`, and queue contracts
- SQLite playlists, favorites, recent plays, settings, and search behavior
- Queue/repeat/shuffle policy
- Theme tokens, Cadmium colors, icons, logos, orbit art, and generic fallbacks
- Reusable collection cards, empty states, and menu primitives after removing
  desktop layout assumptions
- Three.js visualizer contracts, shaders, registry, and single-host lifecycle

Keep these desktop-only:

- Watched folders and recursive filesystem scanning
- Folder selection and drag/drop
- Spotify Local Files import
- `HTMLAudioElement` playback and two-deck crossfade
- Codex CLI integration, AI DJ, Fish Node worker, Windows Credential Manager,
  and downloaded Windows Whisper runtime
- Desktop sidebar, context rail, three-column shell, keyboard shortcuts, and
  desktop full-screen layout

Android may import shared assets, domain contracts, and policy modules. Android
must not import from `src/desktop`. Desktop must not import from `src/mobile`.
Enforce both restrictions with an architecture test.

## Phase 0: Establish a trustworthy baseline

Before restructuring:

1. Run `npm run typecheck` and `npm test`.
2. Run `cargo test --manifest-path src-tauri/Cargo.toml`.
3. Fix the three currently observed Rust failures:
   - `migrations_create_the_persistent_schema`
   - `manual_folder_membership_survives_spotify_reconciliation`
   - `spotify_exact_import_removes_legacy_collateral_without_touching_files`
4. The schema assertion currently expects version 10 while migration 11 exists.
   Confirm migration 11 is intentional, then update the assertion.
5. Repair the Spotify tests or production behavior according to the documented
   exact-file ownership semantics. Do not weaken the tests merely to obtain
   green output.
6. Do not begin Android restructuring until TypeScript, all 81 current Vitest
   tests, and all Rust tests pass.

## Phase 1: Create platform composition

### Runtime selection

Create a `CadmiumRuntime` interface:

```ts
interface CadmiumRuntime {
  platform: "desktop" | "android" | "web";
  capabilities: PlatformCapabilities;
  library: MusicProvider;
  playback: PlaybackEngine;
}
```

`PlatformCapabilities` must explicitly include:

```ts
interface PlatformCapabilities {
  importMode: "folders" | "media-store" | "none";
  backgroundPlayback: boolean;
  nativeQueue: boolean;
  pcmVisualization: boolean;
  spotifyImport: boolean;
  aiPlaylists: boolean;
  dj: boolean;
  fishVoice: boolean;
  localTranscription: boolean;
}
```

`main.tsx` creates exactly one runtime and renders:

- `AppDesktop` for desktop Tauri
- `AppMobile` for Android Tauri
- the existing truthful unavailable/preview state in a normal browser

Remove renderer behavior checks based on
`provider instanceof LocalLibraryProvider`. Components receive capabilities or
narrow interfaces instead.

### Playback boundary

Extract a platform-neutral `PlaybackEngine`:

```ts
interface PlaybackEngine {
  getSnapshot(): Promise<EnginePlaybackSnapshot>;
  subscribe(listener: (snapshot: EnginePlaybackSnapshot) => void): () => void;
  setQueue(input: NativeQueueRequest): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seekTo(positionMs: number): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  setShuffle(enabled: boolean): Promise<void>;
  setRepeatMode(mode: "off" | "all" | "one"): Promise<void>;
  setVolume(volume: number): Promise<void>;
  clearQueue(): Promise<void>;
}
```

The desktop implementation wraps the current audio-element behavior. The
Android implementation wraps Tauri commands and native state events.

`PlaybackStore` remains the renderer-facing singleton, but it must delegate
transport to its engine. Do not maintain two independently mutable queues.

## Phase 2: Initialize the Android project

The planned Android configuration is:

- Minimum SDK: 29 / Android 10
- Compile SDK: 36
- Target SDK: 36
- Primary ABI for the first physical build: `arm64-v8a`
- Debug/emulator ABI: `x86_64`
- Application identifier: retain `com.cadmium.music`

Install and configure:

- Android Studio and its bundled JBR
- Android SDK Platform 36
- latest 36.x build tools
- platform tools and `adb`
- compatible Android NDK
- Rust Android targets
- `JAVA_HOME`, `ANDROID_HOME`, and required NDK variables

Run Tauri Android initialization once. Commit the generated Android project,
but never commit a release keystore, passwords, `local.properties`, or machine
SDK paths.

Add scripts with stable names:

- `android:init`
- `android:dev`
- `android:test`
- `android:build:debug`
- `android:build:release`

Release signing must read the keystore location, alias, store password, and key
password from environment variables.

## Phase 3: Android library ingestion

### Permissions

Declare only:

- `READ_MEDIA_AUDIO` for Android 13+
- `READ_EXTERNAL_STORAGE` with `maxSdkVersion="32"`
- `FOREGROUND_SERVICE`
- `FOREGROUND_SERVICE_MEDIA_PLAYBACK`
- `POST_NOTIFICATIONS` where applicable

Never request `MANAGE_EXTERNAL_STORAGE`. Cadmium is read-only toward source
audio and must never delete or modify the user's music files.

Expose these permission states:

- `unknown`
- `granted`
- `denied`
- `permanentlyDenied`

The first-launch screen explains why Cadmium needs audio access. Denial leaves
the app in a functional empty-library state. Permanent denial offers a button
that opens Android app settings.

### MediaStore plugin

Implement a Tauri mobile plugin whose Kotlin side queries
`MediaStore.Audio.Media` through `ContentResolver` off the main thread.

Return candidates containing:

```ts
interface AndroidMediaCandidate {
  volumeName: string;
  mediaId: string;
  contentUri: string;
  title: string;
  artist: string;
  album: string;
  albumId?: string;
  durationMs: number;
  trackNumber?: number;
  discNumber?: number;
  year?: number;
  genre?: string;
  mimeType?: string;
  format: string;
  byteLength: number;
  modifiedAtMs: number;
  artworkCachePath?: string;
}
```

Use MediaStore volume plus media ID as the Cadmium Android identity. Use the
`content://` URI only as the playback locator.

For artwork, load at most one image per album, downsample it to a maximum
512-by-512 image, enforce the existing 4 MiB limit, and write it under Cadmium
app data. Do not copy audio bytes. Run artwork work with bounded concurrency.

### SQLite migration and reconciliation

Add migration 12:

- Add `source_kind` to tracks with `desktop_file` as the backfill default.
- Add `source_locator`.
- Add nullable Android volume and media ID fields.
- Backfill `source_locator` from the existing desktop `source_path`.
- Add a uniqueness constraint/index suitable for source kind plus locator.
- Seed a hidden source identified as `android://mediastore`.

Keep the existing desktop path columns during this release to avoid a risky
all-at-once rewrite.

Android reconciliation must:

1. Start one SQLite transaction.
2. Mark existing Android-source records unavailable.
3. Upsert the current candidate set.
4. Rebuild normalized album/artist relationships.
5. Mark seen candidates available.
6. Preserve playlists, favorites, and recent-play links for unchanged IDs.
7. Commit only after the complete candidate set succeeds.

Desktop availability continues using canonical filesystem validation. Android
availability comes only from successful MediaStore reconciliation; never pass
a `content://` URI through `std::fs::canonicalize`.

Rescan after permission grant, on explicit refresh, and on app resume only
when MediaStore's generation/version changed. Show progress and never block the
WebView main thread.

## Phase 4: Native Android playback

Implement `CadmiumPlaybackService` as a Media3 `MediaSessionService` containing
one ExoPlayer and one MediaSession.

The native service owns live playback, queue position, audio focus, and the
system media session. The renderer is a controller, not the audio host.

Expose these Tauri commands:

- `android_get_playback_snapshot`
- `android_set_queue`
- `android_play`
- `android_pause`
- `android_seek_to`
- `android_next`
- `android_previous`
- `android_set_shuffle`
- `android_set_repeat_mode`
- `android_set_volume`
- `android_clear_queue`

Each native queue entry contains:

- Cadmium track ID
- MediaStore content URI
- title, artist, and album
- duration
- cached artwork URI/path

Emit one `android-playback-state` event shape containing:

- playback state: `idle`, `buffering`, `ready`, `ended`, or `error`
- `isPlaying`
- current track ID
- queue index
- position and duration
- shuffle and repeat mode
- volume
- stable sanitized error code/message

Throttle foreground position updates to approximately 500 ms. Do not send
continuous events when no renderer is attached.

Media3 must provide:

- background and screen-off playback
- media notification and lock-screen metadata
- play/pause/previous/next controls
- Bluetooth and wired-headset media buttons
- audio focus handling
- pause on noisy/unplug events
- restoration after the UI activity is recreated

Startup precedence:

1. If the native service has an active queue/session, hydrate React from it.
2. Otherwise load SQLite state and send it to Media3 with `autoplay: false`.
3. Persist native snapshots back to SQLite on meaningful changes.

Force-stop follows Android behavior and may end playback. Merely swiping away
the UI must not interrupt active playback.

## Phase 5: Mobile interface

Build a dedicated phone shell. Do not reuse the desktop sidebar, context panel,
or bottom player layout.

### Navigation

- Bottom tabs: Home, Search, Library
- Mini-player directly above the tabs
- Settings available from the top-right action
- Full-screen Now Playing opened from the mini-player
- Queue presented as a mobile sheet or full-height panel
- Android system Back closes sheets/Now Playing before leaving the app

### Screens

Home:

- recent plays
- favorites
- recently added albums
- playlists
- permission/empty state

Search:

- immediate local search
- grouped songs, albums, artists, and playlists
- touch-accessible track actions

Library:

- Songs, Albums, Artists, and Playlists segments
- sorting
- explicit refresh/rescan
- playlist creation/editing
- no watched-folder or Spotify controls

Now Playing:

- artwork, title, artist, and album
- previous/play/next
- seek, shuffle, repeat, and favorite
- queue access
- Rhythm toggle/presentation

Settings:

- permission state and rescan
- theme/appearance
- volume and playback restoration preferences
- app/build information
- unavailable desktop/cloud features must not appear

Use Android safe-area insets, 48 dp minimum touch targets, no hover-only
actions, portrait-first layouts, and usable landscape/tablet grids.

## Phase 6: Mobile Rhythm

Reuse the existing visualizer registry and shared shader assets, but mount only
one WebGL host in Android v1: full-screen Now Playing.

Android defaults:

- 30 FPS maximum
- device-pixel-ratio cap of 1.25
- no ambient shell visualizer
- stop on pause, background, hidden document, no track, reduced motion, WebGL
  loss, or zero-size host

Media3 does not expose decoded PCM to the WebView in v1. Drive Android Rhythm
from playback position, saved rhythm profile, and the existing deterministic
fallback. Do not describe it as live PCM-reactive. A native audio-analysis
adapter is a later feature.

## Verification

### Automated

Required commands:

```text
npm run typecheck
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run android:test
npm run android:build:debug
npm run android:build:release
```

Add tests for:

- architecture import boundaries
- runtime/capability selection
- mobile permission states
- Android MediaStore DTO normalization
- schema 11-to-12 migration
- reconciliation and unavailable-track behavior
- favorites/playlists surviving a rescan
- Android playback event reduction
- native-session versus SQLite restoration precedence
- mobile navigation and Android Back behavior
- desktop provider and playback regressions
- Kotlin MediaStore cursor mapping
- Media3 queue, notification metadata, repeat, shuffle, and restoration

### Device matrix

- API 29 emulator
- API 36 emulator
- Epic's physical Android phone

### Physical acceptance

- Grant, deny, retry, and permanently deny audio permission.
- Scan a real library without freezing the UI.
- Play supported local files from `content://` URIs.
- Search, favorite, create a playlist, queue tracks, seek, shuffle, and repeat.
- Lock the phone for 30 minutes without playback stopping.
- Control playback from the notification, lock screen, Bluetooth, and headset.
- Pause correctly for an audio interruption and unplug/noisy event.
- Swipe away and reopen the UI while active native playback continues.
- Restart with the queue/position restored but without autoplay.
- Delete or move a source file, rescan, and show it unavailable without a crash.
- Confirm Rhythm stops completely while backgrounded.
- Install the signed release APK and upgrade it without losing SQLite data.
- Run the packaged desktop app and confirm its library import and playback are
  unchanged.

## Completion definition

The task is complete only when:

- shared, desktop, and mobile directories obey the import boundary;
- the desktop app still builds and behaves as before;
- a signed arm64 release APK is produced;
- all automated checks pass;
- the physical acceptance list has recorded evidence;
- no credentials, keystores, SDK paths, generated music, or personal library
  data are committed.

When reporting completion, include:

- changed architecture and major paths
- exact test/build results
- APK absolute path and SHA-256
- Android versions/devices tested
- any unverified physical behavior
- deferred features from this document

