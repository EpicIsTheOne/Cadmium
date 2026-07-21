# Cadmium architecture

## Runtime boundary

    React renderer
      ├── screens and responsive shell
      ├── normalized domain graph
      └── LocalLibraryProvider / PlaybackStore
              │
              ▼
        typed Tauri v2 commands
              │
              ▼
    Rust LibraryRepository
      ├── SQLite migrations and transactions
      ├── canonical watched-folder paths
      ├── recursive metadata scan via Lofty
      ├── artwork cache under app data
      └── runtime asset-protocol scope

`src/domain/media.ts` is the renderer-facing contract. Screens consume `NormalizedLibrary`, not SQLite rows or filesystem responses. Stable IDs are generated from normalized metadata or canonical paths before records are written.

## Rust repository

`src-tauri/src/library.rs` owns the SQLite schema and versioned migrations. Foreign keys are enabled, SQL values are parameterized, and scan reconciliation marks old records unavailable before applying the complete candidate set inside one transaction. The schema stores watched folders, artists, albums, tracks, join tables, recent plays, settings, queue, and one playback-state row. Audio data is never stored.

`src-tauri/src/commands.rs` exposes only narrow typed commands for folder selection, watched-folder lifecycle, normalized library/search reads, settings, playback state, queue persistence, and recent-play recording. Every user-provided folder is canonicalized and checked as a directory. Runtime asset scope starts empty; Rust allows only canonical watched folders and exact indexed/artwork files before the renderer calls `convertFileSrc`.

Metadata failures fall back to a safe filename title and unknown artist so one damaged file does not abort a scan. Embedded art is signature-checked, size-limited, content-addressed, and stored as an app-local reference.

## Renderer services

`src/providers/local-library-provider.ts` translates command DTOs to the domain graph. `src/playback/playback-store.ts` is a module singleton, so route changes cannot recreate the `HTMLAudioElement`. It restores persisted state without autoplay, owns transport/volume/queue/shuffle/repeat transitions, debounces playback persistence, records recent plays, and reports WebView decode failures as visible player state.

The existing `EmptyMusicProvider` and in-memory provider remain useful for contract fixtures, but the desktop runtime selects `LocalLibraryProvider`. Outside Tauri, the browser build shows a truthful desktop-provider-unavailable state.

## UI connection

Home shows real counts and recent plays; Search queries Rust-backed normalized records; Library lists available and unavailable tracks plus watched-folder controls; Settings shows provider capabilities, folders, and persisted volume; the context panel and bottom player reflect the singleton queue/playback state. Mood Map, Mixes, and Rhythm remain explicit previews because no analysis or recommendation engine is implemented.

## Verification seams

Rust unit tests cover migrations, the legal deterministic WAV fixture, metadata fallback, scan/search, and missing-file reconciliation. Vitest covers normalized empty-provider contracts, queue/shuffle/repeat transitions, and no-autoplay playback restoration. Installer signing, updater behavior, external services, and codec support beyond the local WebView remain outside this pass.
