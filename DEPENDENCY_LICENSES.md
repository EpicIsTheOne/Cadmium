# Dependency license notes

This is a human-readable foundation note, not a generated legal bill of materials. Before distributing an installer, generate a lockfile-based SBOM/license report and review the exact transitive versions.

| Dependency family | Use | Declared license note |
| --- | --- | --- |
| React / React DOM | Renderer UI | MIT |
| Vite / @vitejs/plugin-react | Frontend dev server and bundling | MIT |
| TypeScript | Type checking | Apache-2.0 |
| Vitest | Contract tests | MIT |
| jsdom | Test DOM environment | MIT |
| @tauri-apps/api / Tauri CLI | Desktop bridge and packaging | Tauri project license metadata: MIT/Apache-2.0 |
| Tauri Rust crates and serde | Desktop host and serialization | Verify exact crate notices from Cargo metadata; the Tauri and serde projects publish permissive MIT/Apache-2.0 licensing |

The repository currently includes no third-party image, font, icon, or album-art files. src/assets/cadmium-hero.png is an original generated Cadmium visual; the SVGs beside it are authored in-repository.
