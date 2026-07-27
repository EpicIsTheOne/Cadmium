import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../shared/components/Icon";
import type { NormalizedLibrary, TrackId } from "../../shared/domain/media";
import type { DjRecovery, DjSet, DjStatus } from "../../domain/dj";
import type { AndroidLibraryProvider } from "../providers/android-library-provider";
import type { AndroidPlaybackEngine } from "../playback/mobile-engine";
import type { EnginePlaybackSnapshot, EngineQueueItem } from "../../shared/playback/engine";
import { dismissFishPrompt, isFishPromptDismissed } from "../keys";
import { DjWaveform } from "../components/DjWaveform";

/**
 * Mobile AI DJ controller.
 *
 * Real backend wiring: generation via provider.generateDjSet (Luna on desktop,
 * local_fallback on mobile v1), playback via the Android engine's setQueue,
 * optional Fish narration via synthesizeDjNarration. Mic/STT stays disabled
 * until an OpenRouter-backed mobile path exists.
 */

const SUGGESTIONS = [
  { key: "pick", label: "Pick for me", highlight: true },
  { key: "focus", label: "Something calm to focus to" },
  { key: "vocaloid", label: "Vocaloid to keep me company while I work" },
];

const AUTO_START_PROMPT = "Start a balanced set from my library";
const CAPTION_HOLD_MS = 6_000;

type DjPhase = "idle" | "generating" | "speaking" | "playing" | "ending" | "error";

interface ChatLine {
  readonly role: "user" | "dj";
  readonly text: string;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function MobileDjScreen({
  library,
  provider,
  engine,
  snapshot,
  onOpenNowPlaying,
  onOpenSettings,
}: {
  library: NormalizedLibrary | null;
  provider: AndroidLibraryProvider;
  engine: AndroidPlaybackEngine;
  snapshot: EnginePlaybackSnapshot | null;
  onOpenNowPlaying: () => void;
  onOpenSettings: () => void;
}) {
  const [phase, setPhase] = useState<DjPhase>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentSet, setCurrentSet] = useState<DjSet | null>(null);
  const [caption, setCaption] = useState<string | null>(null);
  const [chat, setChat] = useState<readonly ChatLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [request, setRequest] = useState("");
  const [recovery, setRecovery] = useState<DjRecovery | null>(null);
  const [showFishPrompt, setShowFishPrompt] = useState(false);
  const [fishKeyDraft, setFishKeyDraft] = useState("");
  const [queueItems, setQueueItems] = useState<readonly TrackId[]>([]);

  const startedRef = useRef(false);
  const refillingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const captionTimerRef = useRef<number | null>(null);
  const statusRef = useRef<DjStatus | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const buildEngineItems = useCallback(
    (ids: readonly TrackId[]): EngineQueueItem[] => {
      if (!library) return [];
      return ids
        .map((id) => library.tracksById[id])
        .filter((t): t is NonNullable<typeof t> => t != null && t.available)
        .map((track) => ({
          id: `dj-${track.id}`,
          trackId: track.id,
          locator: track.source.kind === "local-file" ? track.source.locator : "",
          title: track.title,
          artist: track.artistIds.map((aid) => library.artistsById[aid]?.name ?? "").join(", "),
          album: track.albumId ? (library.albumsById[track.albumId]?.title ?? "") : "",
          durationMs: track.durationMs,
          artworkUri: track.artwork?.src ?? null,
          source: "dj" as const,
        }));
    },
    [library],
  );

  const stopNarration = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    analyserRef.current = null;
    if (captionTimerRef.current !== null) {
      window.clearTimeout(captionTimerRef.current);
      captionTimerRef.current = null;
    }
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      setSpeaking(true);
      const status = statusRef.current;
      if (status?.fish.configured && status.fish.voiceId) {
        try {
          const narration = await provider.synthesizeDjNarration(text);
          const audio = new Audio(narration.src);
          audioRef.current = audio;
          // Real FFT: tap the voice audio so the waveform dances to Fish.
          try {
            const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            const acx = new Ctx();
            const src = acx.createMediaElementSource(audio);
            const analyser = acx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.8;
            src.connect(analyser);
            analyser.connect(acx.destination);
            analyserRef.current = analyser;
          } catch {
            analyserRef.current = null;
          }
          await new Promise<void>((resolve) => {
            audio.onended = () => resolve();
            audio.onerror = () => resolve();
            audio.play().catch(() => resolve());
          });
          audioRef.current = null;
          analyserRef.current = null;
          setSpeaking(false);
          return;
        } catch {
          /* Fish synth failed; fall back to caption-only below */
        }
      }
      // Caption-only: keep the avatar "speaking" for a few seconds.
      if (captionTimerRef.current !== null) window.clearTimeout(captionTimerRef.current);
      captionTimerRef.current = window.setTimeout(() => {
        setSpeaking(false);
        captionTimerRef.current = null;
      }, CAPTION_HOLD_MS);
    },
    [provider],
  );

  const persistRecovery = useCallback(
    (set: DjSet, ids: readonly TrackId[]) => {
      // Mobile has no captured "ordinary queue" concept yet — save minimal,
      // type-correct snapshots so desktop-style recovery still works.
      const now = new Date().toISOString();
      const djQueue = {
        queue: ids.map((trackId) => ({
          id: `dj-${trackId}`,
          trackId,
          addedAt: now,
          source: "dj" as const,
        })),
        queueIndex: 0,
        currentTrackId: ids[0] ?? null,
        positionMs: 0,
      };
      const ordinaryQueue = { queue: [], queueIndex: 0, currentTrackId: null, positionMs: 0 };
      void provider.saveDjRecovery(set.sessionId, set.id, ordinaryQueue, djQueue).catch(() => {});
    },
    [provider],
  );

  const generate = useCallback(
    async (prompt: string, opts?: { refill?: boolean }) => {
      const refill = opts?.refill ?? false;
      if (!refill) {
        setPhase("generating");
        setError(null);
        setChat((lines) => [...lines, { role: "user", text: prompt }]);
      }
      try {
        try {
          statusRef.current = await provider.getDjStatus();
        } catch {
          statusRef.current = null;
        }
        const set = await provider.generateDjSet(sessionId, prompt);
        setSessionId(set.sessionId);
        setCurrentSet(set);
        const captionText =
          set.narration + (set.generationMode === "local_fallback" ? " · Local fallback" : "");
        setCaption(captionText);
        setChat((lines) => [...lines, { role: "dj", text: set.narration }]);

        let nextQueue: readonly TrackId[];
        let startIndex = 0;
        if (refill) {
          nextQueue = [...queueItems, ...set.trackIds];
          startIndex = Math.max(0, snapshot?.queueIndex ?? 0);
        } else {
          nextQueue = set.trackIds;
        }
        setQueueItems(nextQueue);
        const items = buildEngineItems(nextQueue);
        if (items.length > 0) {
          await engine.setQueue({ items, startIndex, autoplay: true });
        }
        persistRecovery(set, nextQueue);
        setPhase("playing");
        void speak(set.narration);
      } catch (err) {
        if (!refill) {
          setPhase("error");
          setError(err instanceof Error ? err.message : "The DJ could not build a set.");
        }
      } finally {
        if (refill) refillingRef.current = false;
      }
    },
    [provider, engine, sessionId, queueItems, snapshot, buildEngineItems, persistRecovery, speak],
  );

  // Recovery + Fish first-run prompt on mount.
  useEffect(() => {
    let cancelled = false;
    void provider
      .getDjRecovery()
      .then((rec) => {
        if (!cancelled && rec) setRecovery(rec);
      })
      .catch(() => {});
    void provider
      .getDjStatus()
      .then((status) => {
        if (cancelled) return;
        statusRef.current = status;
        if (!status.fish.configured && !isFishPromptDismissed()) setShowFishPrompt(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [provider]);

  // Optional auto-start once the library is available (guarded).
  useEffect(() => {
    if (startedRef.current || sessionId || recovery) return;
    if (!library || library.trackOrder.length === 0) return;
    startedRef.current = true;
    void generate(AUTO_START_PROMPT);
  }, [library, sessionId, recovery, generate]);

  // Refill when nearing the end of the DJ queue.
  useEffect(() => {
    if (!snapshot || !currentSet || phase !== "playing") return;
    if (!snapshot.isPlaying || refillingRef.current) return;
    const remaining = snapshot.queue.length - 1 - snapshot.queueIndex;
    if (snapshot.queue.length > 0 && remaining <= 2) {
      refillingRef.current = true;
      void generate(`Continue the ${currentSet.title} vibe`, { refill: true });
    }
  }, [snapshot, currentSet, phase, generate]);

  // Cleanup narration audio on unmount.
  useEffect(() => stopNarration, [stopNarration]);

  const resumeRecovery = useCallback(async () => {
    if (!recovery) return;
    setRecovery(null);
    setSessionId(recovery.sessionId);
    setCurrentSet(recovery.currentSet);
    const ids = recovery.djQueue.queue.map((item) => item.trackId);
    const restored = ids.length > 0 ? ids : recovery.currentSet.trackIds;
    setQueueItems(restored);
    setCaption(recovery.currentSet.narration);
    const items = buildEngineItems(restored);
    if (items.length > 0) {
      const startIndex = Math.min(Math.max(0, recovery.djQueue.queueIndex), items.length - 1);
      await engine.setQueue({ items, startIndex, autoplay: true });
    }
    startedRef.current = true;
    setPhase("playing");
  }, [recovery, engine, buildEngineItems]);

  const endSession = useCallback(async () => {
    setPhase("ending");
    stopNarration();
    const id = sessionId ?? recovery?.sessionId ?? null;
    if (id) {
      try {
        await provider.endDjSession(id);
      } catch {
        /* end best-effort */
      }
    }
    setRecovery(null);
    setSessionId(null);
    setCurrentSet(null);
    setCaption(null);
    setQueueItems([]);
    setChat([]);
    startedRef.current = true; // don't auto-restart after an explicit exit
    setPhase("idle");
  }, [provider, sessionId, recovery, stopNarration]);

  const saveFishKey = useCallback(async () => {
    const key = fishKeyDraft.trim();
    if (!key) return;
    try {
      await provider.setFishCredential(key);
      setFishKeyDraft("");
      setShowFishPrompt(false);
      dismissFishPrompt();
      statusRef.current = await provider.getDjStatus().catch(() => statusRef.current);
    } catch {
      setError("Could not save the Fish Audio key.");
    }
  }, [provider, fishKeyDraft]);

  const tracks = library ? library.trackOrder : [];
  const currentTrackId = snapshot?.currentTrackId ?? currentSet?.trackIds[0] ?? null;
  const currentTrack = currentTrackId && library ? library.tracksById[currentTrackId as TrackId] : undefined;

  const fishPromptCard = showFishPrompt ? (
    <div className="dj-caption dj-fish-prompt">
      <Icon name="spark" size={14} />
      <div>
        <p>Want spoken intros? Add a Fish Audio key (you can also do this later in Settings).</p>
        <input
          type="password"
          value={fishKeyDraft}
          onChange={(e) => setFishKeyDraft(e.target.value)}
          placeholder="Fish Audio API key"
          aria-label="Fish Audio API key"
        />
        <div className="dj-now-pills">
          <button type="button" className="dj-chip" onClick={() => void saveFishKey()}>Add Fish Audio key</button>
          <button
            type="button"
            className="dj-chip dj-chip-ghost"
            onClick={() => {
              setShowFishPrompt(false);
              dismissFishPrompt();
            }}
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const recoveryCard = recovery ? (
    <div className="dj-caption dj-recovery">
      <Icon name="refresh" size={14} />
      <div>
        <p>You have an unfinished DJ session: “{recovery.currentSet.title}”.</p>
        <div className="dj-now-pills">
          <button type="button" className="dj-chip is-highlight" onClick={() => void resumeRecovery()}>Resume DJ</button>
          <button type="button" className="dj-chip dj-chip-ghost" onClick={() => void endSession()}>End session</button>
        </div>
      </div>
    </div>
  ) : null;

  // ---- Active session view ------------------------------------------------
  if ((phase === "playing" || phase === "speaking" || phase === "generating") && currentSet) {
    return (
      <section className="mobile-section dj-now">
        <header className="dj-now-head">
          <button type="button" className="icon-button" aria-label="Minimize" onClick={onOpenNowPlaying}>
            <Icon name="chevron-right" size={20} style={{ transform: "rotate(90deg)" }} />
          </button>
          <div className="dj-now-id">
            <span className="eyebrow">DJ</span>
            <strong>{currentSet.title || "From your library"}</strong>
          </div>
          <button type="button" className="icon-button" aria-label="DJ menu" onClick={onOpenSettings}>
            <Icon name="menu" size={20} />
          </button>
        </header>

        <div className={`dj-ring ${speaking ? "is-speaking" : ""}`}>
          <span className="dj-ring-bg" />
          <DjWaveform speaking={speaking} analyserRef={analyserRef} />
          <span className="dj-ring-glow" />
        </div>

        <div className="dj-now-meta">
          <h2>{currentTrack?.title ?? (phase === "generating" ? "Mixing your set…" : "—")}</h2>
          <p>
            {currentTrack
              ? currentTrack.artistIds.map((id) => library?.artistsById[id]?.name ?? "").join(", ")
              : currentSet.rationale}
          </p>
        </div>

        {caption ? (
          <div className="dj-caption"><Icon name="spark" size={14} /><span>{caption}</span></div>
        ) : null}
        {error ? <div className="dj-caption dj-error"><span>{error}</span></div> : null}
        {fishPromptCard}

        <button type="button" className="dj-open-full" onClick={onOpenNowPlaying}>Open full player</button>

        <div className="dj-now-pills">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              className="dj-chip"
              disabled={phase === "generating"}
              onClick={() => void generate(s.label)}
            >
              {s.label}
            </button>
          ))}
          <button type="button" className="dj-chip dj-chip-ghost" onClick={() => void endSession()}>Exit DJ</button>
        </div>
      </section>
    );
  }

  // ---- Home / idle view ---------------------------------------------------
  return (
    <section className="mobile-section dj-home">
      <header className="dj-home-head">
        <span className="dj-live-dot" />
        <span className="eyebrow">Cadmium AI DJ</span>
      </header>

      <h1 className="dj-greeting">{greeting()}</h1>
      <p className="dj-sub">Ask for a mood, genre, or activity. The DJ reads your local library and builds a set.</p>

      {recoveryCard}
      {fishPromptCard}
      {error && phase === "error" ? (
        <div className="dj-caption dj-error"><span>{error}</span></div>
      ) : null}
      {phase === "generating" ? (
        <div className="dj-caption"><Icon name="spark" size={14} /><span>Mixing your set…</span></div>
      ) : null}

      <div className="dj-suggestions">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`dj-chip ${s.highlight ? "is-highlight" : ""}`}
            disabled={phase === "generating" || tracks.length === 0}
            onClick={() => void generate(s.label)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="dj-input">
        <input
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder="Ask me anything"
          aria-label="Ask the DJ"
          onKeyDown={(e) => {
            if (e.key === "Enter" && request.trim() && phase !== "generating") {
              void generate(request.trim());
              setRequest("");
            }
          }}
        />
        <button
          type="button"
          className="dj-mic"
          aria-label="Voice (disabled until OpenRouter key is set)"
          disabled
          title="Enable an OpenRouter key in Settings"
        >
          <Icon name="microphone" size={18} />
        </button>
      </div>

      <p className="dj-note">Voice and spoken intros unlock when you add an OpenRouter / Fish key in Settings. Text prompts work offline from your library.</p>
    </section>
  );
}
