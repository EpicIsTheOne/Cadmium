# Cadmium Android scaffold

This folder holds the Android-specific Kotlin sources for Cadmium. They implement
the plan's Phase 4: a Media3 `MediaSessionService` renderer, a `MediaStorePlugin`
that reads the Android media library off the main thread, and a `RustBridge`
Tauri plugin that receives queue/transport commands from Rust and drives the
service.

## Source layout (after `tauri android init`)

`tauri android init` generates the Gradle project under `src-tauri/gen/android`.
The Kotlin sources here map to:

| File                              | Generated path                                                        |
|-----------------------------------|-----------------------------------------------------------------------|
| `app/src/main/java/com/cadmium/music/MainActivity.kt`            | `gen/android/app/src/main/java/com/cadmium/music/MainActivity.kt`            |
| `.../CadmiumApplication.kt`       | `gen/android/app/src/main/java/com/cadmium/music/CadmiumApplication.kt` |
| `.../PlaybackService.kt`          | `gen/android/app/src/main/java/com/cadmium/music/PlaybackService.kt`    |
| `.../MediaStorePlugin.kt`         | `gen/android/app/src/main/java/com/cadmium/music/MediaStorePlugin.kt`   |
| `.../RustBridge.kt`               | `gen/android/app/src/main/java/com/cadmium/music/RustBridge.kt`         |
| `app/src/main/AndroidManifest.xml`| `gen/android/app/src/main/AndroidManifest.xml`                          |

Copy these into the generated project (or add them as Tauri plugin sources) before
building.

## Required toolchain (NOT present on the build machine that produced this commit)

- Android SDK (platform 34+)
- Android NDK (r25+)
- `JAVA_HOME` pointing at JDK 17
- `ANDROID_HOME` / `ANDROID_SDK_ROOT`
- Rust targets: `rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android`

> ⚠️ **Verification status:** This Kotlin was written and reviewed but has **NOT**
> been compiled or run on a device. The Rust side that backs it (migration 12,
> `reconcile_android_media`, the `android_*` commands) IS compiled and tested on
> the host. The Android build/device path remains UNVERIFIED until built on a
> toolchain-equipped machine.

## Build & run

```bash
npm run android:init        # one-time: tauri android init
npm run android:build:debug # debug APK
npm run android:dev         # run on connected device/emulator
npm run android:build:release
```

## What the renderer does NOT do

- It never requests `MANAGE_EXTERNAL_STORAGE`.
- It never deletes, moves, or rewrites source audio.
- It does not decode audio for the visualizer (v1 Rhythm is position-driven only).
- It renders exactly the queue the React/Rust side computes (no re-ordering,
  crossfade decisions, or repeat/shuffle logic lives here).
