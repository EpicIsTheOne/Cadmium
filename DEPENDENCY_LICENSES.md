# Dependency license notes

This is a human-readable list of the direct runtime/build dependencies used by the implemented pass. Before distributing an installer, generate a lockfile-based SBOM/license report and review all transitive notices.

| Dependency | Use | Declared license |
| --- | --- | --- |
| React / React DOM | Renderer UI | MIT |
| Vite / `@vitejs/plugin-react` | Frontend dev server and bundling | MIT |
| TypeScript | Type checking | Apache-2.0 |
| Vitest / jsdom | Frontend tests and DOM test environment | MIT |
| `@tauri-apps/api` / Tauri CLI | Desktop bridge and packaging | MIT OR Apache-2.0 (Tauri project metadata) |
| Tauri Rust crates / `tauri-plugin-dialog` | Desktop host, asset protocol, native folder picker | MIT OR Apache-2.0 |
| serde / serde_json | Typed command serialization | MIT OR Apache-2.0 |
| rusqlite with bundled SQLite | Local repository and migrations | rusqlite MIT; bundled SQLite amalgamation is public domain |
| lofty | Audio metadata and embedded artwork parsing | MIT OR Apache-2.0 |
| walkdir | Recursive watched-folder traversal | Unlicense/MIT |
| sha2 | Stable IDs and content-addressed artwork names | MIT OR Apache-2.0 |
| base64 | Test-only WAV fixture decoding | MIT OR Apache-2.0 |
| reqwest / rustls | Verified HTTPS download of the local Whisper runtime and model | MIT OR Apache-2.0 / Apache-2.0, ISC, MIT |
| zip | Safe extraction of the pinned Whisper Windows runtime | MIT |
| OpenAI Whisper `base.en` weights | Local speech recognition model | MIT |
| whisper.cpp v1.9.1 | Local Windows transcription runtime | MIT |
| fish-audio-tts-toolkit | Fish voice search, delivery tagging, and TTS request logic | MIT |
| fish-audio | Toolkit realtime module dependency (realtime path disabled in Cadmium) | MIT |

No third-party image, font, icon, or album-art files are bundled. `src/assets/cadmium-hero.png` is an original Cadmium visual; the neighboring SVGs are authored in this repository. The deterministic WAV fixture is legal test data and is not user-visible.
