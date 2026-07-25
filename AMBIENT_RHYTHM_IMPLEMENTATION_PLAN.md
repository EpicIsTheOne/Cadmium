# Ambient Rhythm Implementation Handoff

## Goal

Make Cadmium's existing Rhythm visualizer available as an optional ambient layer behind the normal three-panel desktop layout. It should react to the actual current track while keeping navigation, content, controls, popovers, text, focus indicators, and playback interactions readable and reliable.

The existing dedicated Rhythm screen and fullscreen visualizer remain supported. The selected visualizer and its saved per-visualizer settings remain the source of truth.

## Non-goals

- Do not redesign Cadmium's navigation, page layouts, player, or dedicated Rhythm controls.
- Do not add new visualizer styles, audio-analysis algorithms, backend commands, dependencies, or Tauri/Rust persistence.
- Do not fabricate activity from the first library track when nothing is selected for playback.
- Do not run multiple WebGL visualizers concurrently.
- Do not weaken keyboard access, focus visibility, text contrast, or pointer interaction to expose more animation.
- Do not make ambient motion mandatory. It must be opt-in and safe under reduced-motion preferences.

## Current architecture

- `src/App.tsx` owns the shell: `Sidebar`, `main.workspace`, optional `ContextPanel`, `BottomPlayer`, and fixed overlays.
- `src/components/RhythmVisualizer.tsx` owns visualizer creation, artwork palette resolution, PCM decoding, `ResizeObserver`, the animation loop, and disposal.
- `src/screens/DiscoveryScreen.tsx` owns the dedicated Rhythm stage, settings panel, presets, BPM caption, and its controlled `RhythmVisualizer`.
- `src/components/BottomPlayer.tsx` owns fullscreen state and mounts a separate `RhythmVisualizer` when fullscreen Rhythm is enabled.
- `src/playback/appearance.ts` persists fullscreen appearance toggles.
- `src/playback/playback-store.ts` owns the singleton audio element and authoritative playback state.
- `src/playback/visualizers/` contains the shared visualizer contract, renderer helper, registry, and eight implementations.
- `src/styles.css`, with later overrides in the same file and `src/shell-density.css`, owns the shell grid and surface styling. `src/discovery.css` owns the dedicated Rhythm stage.

Important existing gaps:

- Independent Rhythm mounts can duplicate WebGL contexts, RAF loops, PCM decoding, and palette work.
- The current loop continues while playback is paused.
- A failed WebGL `start()` leaves no explicit unavailable state.
- CSS reduced-motion rules do not stop JavaScript/WebGL animation.
- The `maxPixelRatio` option is only honored by Particle Nebula; other visualizers use the fixed cap in `viz-common.ts`.
- Final shell backgrounds are mostly opaque, so an ambient canvas placed behind them would be invisible without ambient-specific surface treatment.

## Ownership rule

Exactly one Rhythm host may own a WebGL context and animation loop:

1. `ambient` — ordinary app screens when Ambient Rhythm is enabled.
2. `stage` — the dedicated Rhythm screen.
3. `fullscreen` — the fullscreen now-playing overlay.

Priority is `fullscreen` over `stage` over `ambient`. Transitioning modes must stop and dispose the previous host before starting the next. Ambient rendering must not continue underneath the dedicated stage or fullscreen overlay.

Lift/report fullscreen-open state to `App`, or introduce a small transient view-mode store. Do not persist transient fullscreen state in appearance settings.

## Settings

Add a persisted `ambientRhythm` boolean to `AppearanceSettings`.

- Recommended default: `false`.
- Expose it in Settings > Appearance alongside the existing fullscreen Rhythm toggle.
- Reuse `cadmium.viz.selected` and the existing per-visualizer settings.
- First implementation should use a fixed conservative ambient opacity/quality profile. A user-facing strength slider is optional follow-up work, not required for acceptance.
- System reduced motion overrides the ambient toggle by default.

## Layering and readability

Mount a decorative ambient wrapper as the first visual child of `.app-shell`.

- `.app-shell`: `position: relative` and an isolated stacking context.
- Ambient wrapper/canvas: cover the shell, use the lowest local layer, and set `pointer-events: none`.
- Mark the wrapper/canvas `aria-hidden="true"` and keep it unfocusable.
- Place sidebar, workspace, context panel, bottom player, and interactive content above it.
- Preserve the existing higher overlay order for search results, queue/details popovers, toast, DJ panel, fullscreen, dialogs, and folder-drop overlay.

Use an opaque visualizer canvas at controlled wrapper opacity behind dark translucent surfaces. Do not apply `opacity` to whole panels because that also fades text and controls. Instead:

- Use ambient-active background colors/scrims with explicit alpha.
- Keep sidebar, context rail, topbar, bottom player, settings controls, search results, queue/details popovers, DJ panel, dialogs, and menus near-opaque.
- Allow the workspace background, gaps, and intentionally translucent cards to reveal the visual.
- Maintain a dark veil beneath text and focus indicators.
- Avoid `mix-blend-mode` in the first pass; its contrast effects vary by visualizer and artwork palette.

## Runtime states

### Playing

- Require the actual `playback.currentTrackId`, a matching available local track, and a healthy WebGL context.
- Render live PCM-reactive frames against the singleton audio element's current time.
- Continue existing artwork-palette cross-fades.
- While PCM is still decoding, render a quiet zero-signal frame rather than invented beats.

### Paused

- Preserve the last rendered frame.
- Stop RAF scheduling and PCM analysis.
- Resume from the current playback position when playback restarts.
- Do not continue clock-only drift by default.

### No track

- Do not mount or start WebGL.
- Show Cadmium's normal static shell background.
- The dedicated Rhythm screen should show its existing truthful “Play a track to begin” state.

### Unavailable or failed playback

- Do not render ambient reactions for missing, unavailable, non-local, or failed-to-decode playback records.
- Keep controls and error reporting in their existing DOM surfaces.
- Never substitute the first library track for ambient playback.

### PCM unavailable

- If WebGL is healthy but PCM decoding is unavailable, use a static or quiet zero-signal visual.
- The dedicated Rhythm screen may label analysis as unavailable; the decorative ambient layer should not add alerts or live-region noise.

### WebGL unavailable or context lost

- Expose an explicit `ready`, `unavailable`, or `lost` status from the visualizer host.
- Stop RAF work immediately.
- Ambient mode falls back to the normal shell background or a static CSS gradient.
- The dedicated Rhythm screen may show a concise unavailable message.
- Handle `webglcontextlost` and `webglcontextrestored`; do not retry continuously.

### Reduced motion

- Subscribe to `matchMedia("(prefers-reduced-motion: reduce)")`.
- Do not rely on CSS media queries alone.
- When active, do not start or continue a live WebGL loop. Use a static frame/gradient or no ambient layer.
- Apply the same policy to ambient, dedicated-stage, and fullscreen hosts unless product requirements later add an explicit override.

## Performance and lifecycle constraints

- One active renderer, one RAF loop, and one active PCM analyzer.
- Add a small bounded decode cache keyed by track locator so host transitions do not refetch and decode the same track. Do not retain an unbounded library of `AudioBuffer` objects.
- Use an ambient render profile targeting approximately 30–45 FPS with a `devicePixelRatio` cap around 1.0–1.25.
- Propagate renderer options through every visualizer implementation, not only Particle Nebula.
- Preserve saved visualizer settings, but allow the ambient profile to apply a non-persisted quality/particle cap.
- Pause work while the document is hidden.
- Observe the canvas host rather than assuming viewport dimensions.
- Ignore zero-width or zero-height resize notifications.
- Dispose RAF handles, observers, WebGL renderers, geometries, materials, textures, context listeners, and stale artwork/decode work on mode changes and unmount.
- Switching tracks, resizing rapidly, collapsing the context panel, or entering/exiting fullscreen must not leak contexts or grow memory continuously.

## Phased implementation

### Phase 1: State and host ownership

1. Add and sanitize `ambientRhythm` in `appearance.ts`.
2. Add the Appearance toggle.
3. Introduce the ambient host and a single mode-selection rule.
4. Coordinate fullscreen-open state with `App`.
5. Ensure ordinary, Rhythm-screen, and fullscreen modes are mutually exclusive.

### Phase 2: Visualizer lifecycle

1. Add explicit host mode, active state, playback state, quality profile, reduced-motion state, and status reporting to the Rhythm runtime/component.
2. Stop rendering while paused, hidden, unavailable, reduced-motion, or zero-sized.
3. Add bounded decode reuse and cancellation guards.
4. Propagate pixel-ratio options through all visualizers.
5. Handle WebGL failure and context loss.

### Phase 3: Shell compositing

1. Add the low-layer ambient wrapper and stacking isolation.
2. Add ambient-active shell surface tokens/scrims.
3. Protect panels, cards, menus, popovers, dialogs, and focus indicators.
4. Verify responsive and collapsed-context layouts.

### Phase 4: Tests and packaged QA

1. Add focused unit/component coverage.
2. Run typecheck, Vitest, and production build.
3. Validate real WebGL behavior in the packaged Tauri app.
4. Tune opacity and quality only from measured visual/performance evidence.

## Likely files

- `src/App.tsx`
- `src/components/AmbientRhythmLayer.tsx` (new), or an equivalent small host component
- `src/components/RhythmVisualizer.tsx`
- `src/components/BottomPlayer.tsx`
- `src/screens/DiscoveryScreen.tsx`
- `src/screens/SettingsScreen.tsx`
- `src/playback/appearance.ts`
- `src/playback/visualizer.ts`
- `src/playback/visualizers/types.ts`
- `src/playback/visualizers/viz-common.ts`
- Visualizer `start()` implementations under `src/playback/visualizers/`
- `src/styles.css`
- `src/discovery.css`
- New or updated focused tests under `src/components/` and `src/playback/`
- `ARCHITECTURE.md` after implementation, documenting the single-host rule

No `src-tauri` changes should be required.

## Acceptance criteria

- Ambient Rhythm is opt-in, persisted, and uses the selected visualizer and saved settings.
- It is visible behind ordinary Cadmium screens without reducing text/control readability.
- Sidebar, workspace, context panel, bottom player, menus, popovers, dialogs, and overlays remain fully interactive.
- Only the actual current available track drives ambient visuals.
- Exactly one Rhythm canvas/context/RAF owner exists in ambient, stage, and fullscreen transitions.
- Pausing playback stops continuous rendering; resuming restarts it.
- No track, unavailable playback, WebGL failure, context loss, and PCM failure degrade truthfully without crashes.
- Reduced-motion preference prevents live WebGL motion.
- All visualizers honor the active render profile's pixel-ratio cap.
- Rapid resize, context-panel collapse, navigation, track changes, and fullscreen transitions do not leak resources.
- Existing dedicated Rhythm and fullscreen behavior remains functional.
- Typecheck, tests, and production build pass.

## Validation checklist

- [ ] Toggle Ambient Rhythm on/off and restart Cadmium.
- [ ] Verify Home, Search, Library, Settings, and all Discovery screens.
- [ ] Verify dedicated Rhythm stage suppresses ambient rendering.
- [ ] Verify fullscreen suppresses ambient/stage rendering.
- [ ] Confirm only one Rhythm canvas and WebGL context are active.
- [ ] Play, pause, resume, seek, skip, and change tracks.
- [ ] Test no-track, unavailable-track, PCM-decode-failure, WebGL-unavailable, and context-loss paths.
- [ ] Test bright and dark artwork-derived palettes.
- [ ] Open search results, queue/details popovers, track menus, DJ panel, dialogs, toast, and folder-drop overlay.
- [ ] Verify mouse, keyboard, focus rings, scrolling, sliders, and drag/drop.
- [ ] Test context panel open/collapsed and responsive/narrow layouts.
- [ ] Test standard and high-DPI displays plus rapid window resizing.
- [ ] Test `prefers-reduced-motion: reduce`.
- [ ] Compare CPU/GPU/frame time with Ambient Rhythm off and on.
- [ ] Check memory and WebGL context count across repeated mode/track transitions.
- [ ] Run `npm run typecheck`, `npm test`, and `npm run build`.
- [ ] Complete a packaged Tauri smoke test with real playback and WebGL.
