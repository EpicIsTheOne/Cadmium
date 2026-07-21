# Cadmium foundation architecture

## Runtime boundary

    React renderer
      ├─ Screens and responsive shell
      ├─ Bottom player presentation
      └─ Provider-neutral normalized domain graph
              │
              ▼
          MusicProvider
              │
              ├─ EmptyMusicProvider (shipped first-launch state)
              ├─ InMemoryMockProvider (tests/fixtures)
              └─ future scanner / database / service adapters

src/domain/media.ts is the canonical renderer-facing contract. It defines normalized entities and stable identifiers for Track, Album, Artist, Playlist, QueueItem, PlaybackSource, NormalizedLibrary, and provider capabilities. The UI consumes maps plus explicit order arrays instead of provider-specific rows.

src/providers/music-provider.ts owns the replaceable MusicProvider boundary. A future adapter may scan folders, read a database, or call a service, but it must translate those raw shapes into the domain contract before the renderer sees them.

## Desktop shell

- src/App.tsx owns route selection, provider loading/error state, the first-launch notice, and keyboard navigation (Ctrl+K).
- src/components/ contains the persistent shell pieces: sidebar, context panel, bottom player, icons, and reusable empty states.
- src/screens/ contains Home, Search, Library, Settings, and the three preview routes.
- src/styles.css owns the responsive layout and the Cadmium visual system. The optional context panel is a real desktop column and disappears below the tablet breakpoint.
- src-tauri/ is a minimal Tauri v2 host. It currently launches the frontend and exposes no music commands.

## Extension order

1. Add a real provider adapter behind MusicProvider; keep filesystem/Tauri structs out of src/.
2. Add persistence behind a repository boundary and hydrate the normalized graph.
3. Add a queue/playback service that owns QueueItem transitions and emits player state.
4. Connect scanning, artwork extraction, and error recovery to the existing loading/empty/error UI states.
5. Add installer signing, update strategy, and Windows integration once the runtime surface is stable.

The current UI deliberately does not imply that steps 1–4 exist.
