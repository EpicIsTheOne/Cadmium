# Cadmium

Cadmium is a Windows-first desktop music workspace for a local collection. The desktop app keeps a normalized SQLite library, scans watched folders recursively, and owns playback in one persistent WebView service.

## Implemented behavior

- Choose or drag-and-drop one or more music folders, then rescan, list, or remove them. Paths are canonicalized and validated in Rust; removing a folder removes only Cadmium’s index records and never deletes music files.
- Index MP3, FLAC, WAV, OGG, M4A, and AAC files with normalized title, artist, album, album artist, track/disc number, year, genre, duration, file path, availability, and safe embedded artwork references.
- Reconcile rescans transactionally. Files that disappear remain visible as unavailable until their record is removed with its watched folder or the file returns.
- Search normalized tracks, albums, and artists with parameterized SQLite queries.
- Persist watched folders, settings, queue, current track, position, shuffle, repeat, volume, mute state, and recent plays under the platform app-data directory.
- Play, pause, seek, volume, mute, previous, next, queue, shuffle, repeat off/all/one, artwork, recent tracks, and decode-error recovery from the shell-level player.
- Build Stories and Lore from indexed metadata and actual recent plays.
- Plot a local Mood Map, generate metadata-grounded Mixes, seed similarity Radio, and run playback-reactive Rhythm Mode.
- Generate and persist AI playlists through the existing Codex/ChatGPT OAuth session, with validated local-only playback and an honest deterministic fallback. Cadmium discloses the bounded metadata sent to Codex and never sends file paths or artwork.
- First launch remains an honest empty state; shipped screens render only indexed library, queue, and playback data rather than presentation fixtures.

## Run it

Requirements: Node.js 20+, npm, Rust stable with the MSVC toolchain, WebView2, and Visual Studio 2022 C++ Build Tools.

    npm install
    npm run dev

For the desktop window:

    npm run tauri:dev

Useful checks:

    npm run typecheck
    npm test
    npm run build
    npm run tauri:build

If Rust is installed with rustup but is not on the current PowerShell `PATH`:

    $cadmiumToolchainBin = Join-Path $env:USERPROFILE ".rustup\toolchains\stable-x86_64-pc-windows-msvc\bin"
    $env:Path = $cadmiumToolchainBin + ";" + $env:Path

The database is `cadmium.sqlite3` in Tauri’s app-data directory. Artwork is cached beside it under `artwork/`; audio bytes are never copied into the database.

## Supported formats and limits

Lofty reads the formats above. Actual playback depends on the codecs exposed by the installed Windows WebView2/Media Foundation stack; an indexed file can therefore be unavailable to playback even when metadata was readable. Artwork is limited to verified JPEG, PNG, GIF, or WebP signatures and 4 MiB per image. The bundled deterministic WAV fixture under `src-tauri/tests/fixtures/` is test-only and is not shown to users.

Mood and tempo values are explainable estimates derived from title and genre metadata. Rhythm visuals follow the real playback clock, but waveform-level BPM detection is not yet implemented. AI curation requires the Codex CLI and a ChatGPT sign-in; when either is unavailable, Cadmium labels and uses its on-device ranking fallback.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the runtime seams and [DEPENDENCY_LICENSES.md](DEPENDENCY_LICENSES.md) for declared licenses.
