# Cadmium

Cadmium is a Windows-first desktop music workspace built around a calm, high-contrast shell and a replaceable media-provider boundary.

This foundation intentionally stops short of real music behavior:

- no filesystem scan, SQLite database, playback engine, or user-data persistence is connected yet;
- the shipped EmptyMusicProvider returns an empty normalized graph;
- Home, Search, Library, and Settings are usable shell states;
- Mood Map, Mixes, and Rhythm are honest preview routes, not fabricated data experiences.

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

On this Windows setup, Cargo may need to be added to the current shell first:

    $cadmiumCargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
    $env:Path = $cadmiumCargoBin + ";" + $env:Path

## Foundation shape

The renderer depends on the domain contracts and provider boundary, never on raw Tauri or filesystem response shapes. The providers folder contains the empty provider and a small in-memory provider for contract fixtures. See ARCHITECTURE.md for the extension seams.

The abstract hero image is an original Cadmium asset generated for this foundation pass. The three smaller card visuals and the app mark are local SVGs authored for this repository. No third-party or copyrighted album art is bundled.

## Current risk boundary

The browser build is the primary verification target. Tauri desktop development and Windows installer generation require the local Rust/WebView2 toolchain and may download crates on first use. Until the provider, persistence, and playback passes land, buttons that would normally touch those systems surface an explicit staged/unavailable notice.
