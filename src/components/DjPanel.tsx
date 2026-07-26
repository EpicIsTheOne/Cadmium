import { useCallback, useEffect, useRef, useState } from "react";
import type { DjNarration, DjRecovery, DjSet, DjStatus, FishVoice, QueueSnapshot, WhisperStatus } from "../domain/dj";
import type { NormalizedLibrary, TrackId } from "../shared/domain/media";
import { playbackStore, usePlaybackState } from "../playback/playback-store";
import { LocalLibraryProvider } from "../providers/local-library-provider";
import { Icon } from "../shared/components/Icon";
import { DjSetQueue } from "./DjSetQueue";

type DjPhase = "idle" | "generating" | "speaking" | "ending" | "listening" | "transcribing" | "downloading" | "error";
type ChatLine = { id: string; role: "user" | "dj"; text: string };
type RecorderHandle = { stop: () => Promise<Uint8Array> };

interface Props {
  readonly library: NormalizedLibrary;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onActivityChange?: (phase: DjPhase | "active") => void;
  readonly provider: LocalLibraryProvider;
}

export function DjPanel({ library, open, onClose, onActivityChange, provider }: Props) {
  const playback = usePlaybackState();
  const [status, setStatus] = useState<DjStatus | null>(null);
  const [whisper, setWhisper] = useState<WhisperStatus | null>(null);
  const [crossfadeMs, setCrossfadeMs] = useState(3_000);
  const [recovery, setRecovery] = useState<DjRecovery | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentSet, setCurrentSet] = useState<DjSet | null>(null);
  const [request, setRequest] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [voiceQuery, setVoiceQuery] = useState("warm radio host");
  const [voices, setVoices] = useState<readonly FishVoice[]>([]);
  const [changingVoice, setChangingVoice] = useState(false);
  const [phase, setPhase] = useState<DjPhase>("idle");
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [chat, setChat] = useState<readonly ChatLine[]>([]);
  const snapshot = useRef<QueueSnapshot | null>(null);
  const autoStarted = useRef(false);
  const refillRequested = useRef(false);
  const endAfterTrack = useRef<string | null>(null);
  const pendingIntro = useRef<{ set: DjSet; narration: DjNarration | null } | null>(null);
  const recorder = useRef<RecorderHandle | null>(null);
  const stopRequested = useRef(false);
  const recordTimer = useRef<number | null>(null);
  const inFlight = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const serviceCache = useRef<{ status: DjStatus; whisper: WhisperStatus; recovery: DjRecovery | null; crossfadeMs: number } | null>(null);
  const recoveryWarningShown = useRef(false);

  const refreshServices = useCallback(async (force = false) => {
    const cached = serviceCache.current;
    if (!force && cached) {
      setStatus(cached.status);
      setWhisper(cached.whisper);
      setCrossfadeMs(cached.crossfadeMs); playbackStore.setDjCrossfadeMs(cached.crossfadeMs);
      if (!sessionIdRef.current) setRecovery(cached.recovery);
      return;
    }
    try {
      const [nextStatus, nextWhisper, nextRecovery, nextCrossfade] = await Promise.all([
        provider.getDjStatus(), provider.getWhisperStatus(), provider.getDjRecovery(), provider.getDjCrossfadeMs(),
      ]);
      serviceCache.current = { status: nextStatus, whisper: nextWhisper, recovery: nextRecovery, crossfadeMs: nextCrossfade };
      setStatus(nextStatus);
      setWhisper(nextWhisper);
      setCrossfadeMs(nextCrossfade); playbackStore.setDjCrossfadeMs(nextCrossfade);
      if (!sessionIdRef.current) setRecovery(nextRecovery);
    } catch { setWarning("Cadmium could not read DJ services. The local fallback remains available."); }
  }, [provider]);

  useEffect(() => { if (open) void refreshServices(); else autoStarted.current = false; }, [open, refreshServices]);
  useEffect(() => { onActivityChange?.(sessionId ? (phase === "idle" ? "active" : phase) : phase); }, [onActivityChange, phase, sessionId]);

  const saveRecovery = useCallback(async (activeSessionId: string, currentSetId: string) => {
    if (!snapshot.current) return;
    try {
      await provider.saveDjRecovery(activeSessionId, currentSetId, snapshot.current, playbackStore.captureQueueSnapshot());
    } catch (caught) {
      if (!recoveryWarningShown.current) {
        recoveryWarningShown.current = true;
      const failure = classifyDjFailure("recovery", caught, "Recovery save failed.");
      setWarning(`The DJ set remains active, but recovery could not be saved. ${failure.message}`);
      }
    }
  }, [provider]);

  const playNarration = useCallback(async (text: string, prepared: DjNarration | null = null) => {
    setCaption(text);
    if (!status?.fish.configured || !status.fish.voiceId) return;
    setPhase("speaking");
    try {
      const narration = prepared ?? await provider.synthesizeDjNarration(text);
      await playVoice(narration.src);
    } catch {
      setWarning("Fish Audio is unavailable. Captions continue while the voice gremlin wanders off.");
    } finally { setPhase("idle"); }
  }, [provider, status]);

  const generate = useCallback(async (prompt: string, refill = false) => {
    if (inFlight.current || phase !== "idle" || !library.trackOrder.length) return;
    inFlight.current = true;
    setError(null);
    setWarning(null);
    setPhase("generating");
    if (!snapshot.current) snapshot.current = playbackStore.captureQueueSnapshot();
    if (!refill) setChat((lines) => [...lines, { id: `user-${Date.now()}`, role: "user", text: prompt }]);

    let set: DjSet;
    try {
      set = await provider.generateDjSet(sessionId, prompt);
    } catch (caught) {
      setError(classifyDjFailure("generation", caught, "The DJ could not build that set.").message);
      refillRequested.current = false;
      inFlight.current = false;
      setPhase("idle");
      return;
    }

    sessionIdRef.current = set.sessionId;
    setSessionId(set.sessionId);
    playbackStore.setDjSession(set.sessionId);
    if (refill) setChat((lines) => lines.filter((line) => line.id !== `dj-${set.id}`));
    if (!refill) setCurrentSet(set);
    if (!refill) setChat((lines) => [...lines, { id: `dj-${set.id}`, role: "dj", text: `${set.narration}${set.generationMode === "local_fallback" ? " · Local fallback" : ""}` }]);

    try {
      if (refill) {
        let narration: DjNarration | null = null;
        if (status?.fish.configured && status.fish.voiceId) {
          narration = await provider.synthesizeDjNarration(set.narration).catch((caught) => {
            setWarning(`Fish Audio unavailable; continuing with captions. ${normalizeDjError(caught, "Narration failed.")}`);
            return null;
          });
        }
        pendingIntro.current = { set, narration };
        try {
          await playbackStore.appendDjCollectionAndContinue(set.trackIds);
        } catch (caught) {
          pendingIntro.current = null;
          setWarning(`The next DJ set is ready, but playback could not continue. ${normalizeDjError(caught, "Playback activation failed.")}`);
        }
      } else {
        await playbackStore.playCollection(set.trackIds, "dj");
        const playbackError = playbackStore.getSnapshot().error;
        if (playbackError) setWarning(`The set is ready, but playback could not start. ${playbackError}`);
        await playNarration(set.narration);
      }
    } catch (caught) {
      setWarning(`The set was generated, but playback could not be activated. ${classifyDjFailure("playback", caught, "Playback activation failed.").message}`);
    } finally {
      if (!refill) await saveRecovery(set.sessionId, set.id);
      refillRequested.current = false;
      inFlight.current = false;
      setPhase((current) => ["ending", "listening", "transcribing"].includes(current) ? current : "idle");
    }
  }, [library.trackOrder.length, phase, playNarration, provider, saveRecovery, sessionId, status]);

  useEffect(() => {
    if (!open || autoStarted.current || recovery || sessionId || !status || !library.trackOrder.length) return;
    autoStarted.current = true;
    void generate("Start a balanced set from my library");
  }, [generate, library.trackOrder.length, open, recovery, sessionId, status]);

  useEffect(() => {
    if (!sessionId || !currentSet || (phase !== "idle" && phase !== "speaking")) return;
    const remaining = playback.queue.length - playback.queueIndex - 1;
    if (shouldRequestDjRefill(remaining, playback.isPlaying, refillRequested.current, Boolean(pendingIntro.current))) {
      refillRequested.current = true;
      void generate(`Continue the ${currentSet.title} vibe with a fresh set`, true);
    }
  }, [currentSet, generate, phase, playback.isPlaying, playback.queue.length, playback.queueIndex, sessionId]);

  useEffect(() => {
    const pending = pendingIntro.current;
    if (!pending || playback.currentTrackId !== pending.set.trackIds[0]) return;
    pendingIntro.current = null;
    setCurrentSet(pending.set);
    setChat((lines) => [...lines, { id: `dj-${pending.set.id}`, role: "dj", text: `${pending.set.narration}${pending.set.generationMode === "local_fallback" ? " · Local fallback" : ""}` }]);
    void playNarration(pending.set.narration, pending.narration);
  }, [playNarration, playback.currentTrackId]);

  useEffect(() => {
    if (!sessionId || !currentSet || !snapshot.current) return;
    void saveRecovery(sessionId, currentSet.id);
    const timer = window.setInterval(() => { void saveRecovery(sessionId, currentSet.id); }, 10_000);
    return () => window.clearInterval(timer);
  }, [currentSet, saveRecovery, sessionId]);

  const finishEnd = useCallback(async (ordinary = snapshot.current) => {
    if (!sessionId) return;
    setPhase("ending");
    await provider.endDjSession(sessionId).catch(() => undefined);
    playbackStore.setDjSession(null);
    if (ordinary) await playbackStore.restoreQueueSnapshot(ordinary);
    snapshot.current = null;
    pendingIntro.current = null;
    endAfterTrack.current = null;
    sessionIdRef.current = null;
    setSessionId(null); setCurrentSet(null); setCaption(""); setChat([]); setPhase("idle");
  }, [provider, sessionId]);

  useEffect(() => {
    if (endAfterTrack.current && (playback.currentTrackId !== endAfterTrack.current || !playback.isPlaying)) void finishEnd();
  }, [finishEnd, playback.currentTrackId, playback.isPlaying]);

  const requestEnd = () => {
    if (!playback.isPlaying || !playback.currentTrackId) void finishEnd();
    else { endAfterTrack.current = playback.currentTrackId; setPhase("ending"); setChat((lines) => [...lines, { id: `end-${Date.now()}`, role: "dj", text: "I’ll hand your queue back after this track." }]); }
  };

  const resumeRecovery = async () => {
    if (!recovery) return;
    snapshot.current = recovery.ordinaryQueue;
    sessionIdRef.current = recovery.sessionId;
    setSessionId(recovery.sessionId);
    setCurrentSet(recovery.currentSet);
    playbackStore.setDjSession(recovery.sessionId);
    await playbackStore.restoreQueueSnapshot(recovery.djQueue, false);
    setChat([{ id: `resume-${Date.now()}`, role: "dj", text: `The ${recovery.currentSet.title} set is restored. Press Play when you’re ready.` }]);
    setRecovery(null);
  };

  const dismissRecovery = async () => {
    if (!recovery) return;
    await provider.endDjSession(recovery.sessionId).catch(() => undefined);
    await playbackStore.restoreQueueSnapshot(recovery.ordinaryQueue, false);
    setRecovery(null);
  };

  const saveCredential = async () => {
    try { await provider.setFishCredential(apiKey); setApiKey(""); await refreshServices(true); }
    catch { setWarning("That Fish Audio key could not be stored in Windows Credential Manager."); }
  };

  const searchVoices = async () => {
    setWarning(null);
    try { setVoices(await provider.searchFishVoices(voiceQuery)); }
    catch { setWarning("Fish voice search failed. Check the credential and connection."); }
  };

  const selectVoice = async (voice: FishVoice) => {
    await provider.selectFishVoice(voice.id, voice.title);
    setVoices([]); setChangingVoice(false); await refreshServices(true);
  };

  const previewVoice = async (voice: FishVoice) => {
    try { setPhase("speaking"); const narration = await provider.previewFishVoice(voice.id); await playVoice(narration.src); }
    catch { setWarning("That Fish voice could not be previewed."); }
    finally { setPhase("idle"); }
  };

  const downloadWhisper = async () => {
    setPhase("downloading"); setWarning(null);
    const poll = window.setInterval(() => void provider.getWhisperStatus().then(setWhisper), 500);
    try { setWhisper(await provider.downloadWhisperModel()); }
    catch (caught) { setWarning(caught instanceof Error ? caught.message : "Whisper could not be downloaded."); }
    finally { window.clearInterval(poll); setPhase("idle"); }
  };

  const startListening = async () => {
    if (!whisper?.installed || phase !== "idle") return;
    stopRequested.current = false; setWarning(null); setPhase("listening");
    try {
      const handle = await startPcmRecorder();
      recorder.current = handle;
      recordTimer.current = window.setTimeout(() => void stopListening(), 15_000);
      if (stopRequested.current) void stopListening();
    } catch { setWarning("Microphone access was denied or unavailable."); setPhase("idle"); }
  };

  const stopListening = async () => {
    if (!recorder.current) { stopRequested.current = true; return; }
    if (recordTimer.current) window.clearTimeout(recordTimer.current);
    const handle = recorder.current; recorder.current = null; setPhase("transcribing");
    try { const wav = await handle.stop(); const result = await provider.transcribeDjRequest(wav); setRequest(result.text); setPhase("idle"); }
    catch (caught) { setWarning(caught instanceof Error ? caught.message : "Whisper could not transcribe that request."); setPhase("idle"); }
  };

  const feedback = async (sentiment: "more" | "less") => {
    if (!sessionId || !playback.currentTrackId) return;
    await provider.recordDjFeedback(sessionId, playback.currentTrackId, sentiment).catch(() => setWarning("DJ feedback could not be saved."));
    setChat((lines) => [...lines, { id: `feedback-${Date.now()}`, role: "dj", text: sentiment === "more" ? "Noted. More of this signal later." : "Noted. I’ll steer away from this signal." }]);
  };

  const toggleCrossfade = async () => {
    const next = crossfadeMs > 0 ? 0 : 3_000;
    const saved = await provider.setDjCrossfadeMs(next).catch(() => crossfadeMs);
    setCrossfadeMs(saved); playbackStore.setDjCrossfadeMs(saved);
  };

  const whyThisTrack = () => {
    const reason = currentSet?.trackReasons.find((item) => item.trackId === playback.currentTrackId)?.reason;
    setChat((lines) => [...lines, { id: `why-${Date.now()}`, role: "dj", text: reason || "This track fit the set’s current energy and your local listening signals." }]);
  };

  if (!open) return null;
  const configured = Boolean(status?.fish.configured && status.fish.nodeAvailable);
  const ready = Boolean(status);
  return <aside aria-label="Cadmium AI DJ" className="dj-panel">
    <header className="dj-panel-head">
      <div className="dj-panel-id">
        <span className={`dj-live-dot is-${phase}`} />
        <div>
          <span className="eyebrow">Cadmium DJ</span>
          <strong>{phaseLabel(phase, Boolean(sessionId))}</strong>
        </div>
      </div>
      <button aria-label="Close DJ" className="icon-button panel-toggle" onClick={onClose} type="button"><Icon name="close" size={16} /></button>
    </header>

    <div className="dj-panel-scroll">
      <p className="dj-disclosure">Metadata and listening signals go to Luna. Narration text goes to Fish. Microphone audio stays on this PC and is deleted after local Whisper transcription.</p>

      {!status ? <p className="dj-muted">Checking Luna, Fish, and Whisper…</p> : null}

      {status ? <section className="dj-service-line">
        <span className={status.lunaAvailable ? "is-ready" : "is-fallback"}>{status.lunaAvailable ? "Luna 5.6 ready" : "Local fallback"}</span>
        <span className={whisper?.installed ? "is-ready" : ""}>Whisper {whisper?.installed ? "ready" : "not installed"}</span>
        {status.fish.voiceLabel ? <button className="dj-change-voice" onClick={() => { setChangingVoice(true); setVoices([]); }} type="button">{status.fish.voiceLabel}</button> : null}
      </section> : null}

      {recovery ? <section className="dj-card dj-recovery">
        <span className="dj-card-label">Interrupted session</span>
        <h3>{recovery.currentSet.title}</h3>
        <p>The DJ queue was restored without autoplaying it.</p>
        <div className="dj-card-actions">
          <button className="button button-accent full-width" onClick={() => void resumeRecovery()} type="button">Resume DJ</button>
          <button className="button button-ghost full-width" onClick={() => void dismissRecovery()} type="button">End session</button>
        </div>
      </section> : null}

      {status && !status.fish.configured ? <section className="dj-card dj-setup is-optional">
        <span className="dj-card-label">Optional · Spoken intros</span>
        <h3>Connect Fish Audio</h3>
        <p>The DJ works with captions without Fish.</p>
        <input autoComplete="off" onChange={(event) => setApiKey(event.target.value)} placeholder="Fish Audio API key" type="password" value={apiKey} />
        <button className="button button-secondary full-width" disabled={!apiKey.trim()} onClick={() => void saveCredential()} type="button">Store securely</button>
      </section> : null}

      {configured && (!status?.fish.voiceId || changingVoice) ? <section className="dj-card dj-setup">
        <span className="dj-card-label">DJ voice</span>
        <h3>{status?.fish.voiceId ? "Change the voice" : "Choose the voice"}</h3>
        <div className="dj-search">
          <input onChange={(event) => setVoiceQuery(event.target.value)} value={voiceQuery} placeholder="Describe a voice…" />
          <button className="button button-secondary" onClick={() => void searchVoices()} type="button"><Icon name="search" size={14} />Search</button>
        </div>
        {voices.map((voice) => <div className="dj-voice-row" key={voice.id}>
          <button className="dj-voice" onClick={() => void selectVoice(voice)} type="button">
            <strong>{voice.title}</strong>
            <small>{voice.matchReasons.slice(0, 2).join(" · ") || voice.languages.join(", ")}</small>
          </button>
          <button className="dj-voice-preview" aria-label={`Preview ${voice.title}`} onClick={() => void previewVoice(voice)} type="button">Preview</button>
        </div>)}
        {status?.fish.voiceId ? <button className="dj-cancel-voice" onClick={() => { setChangingVoice(false); setVoices([]); }} type="button">Keep current voice</button> : null}
      </section> : null}

      {ready && !recovery ? <div className="dj-body">
        <div className="dj-now-set">
          {currentSet ? <><span className="dj-card-label">Set {currentSet.sequence + 1}</span><strong>{currentSet.title}</strong><small>{currentSet.rationale}</small></> : <span className="dj-muted">Preparing your first set</span>}
        </div>

        <div className="dj-chat">
          {chat.length ? chat.map((line) => <article className={`dj-message is-${line.role}`} key={line.id}>
            <small>{line.role === "dj" ? "DJ" : "You"}</small>
            <p>{line.text}</p>
          </article>) : <p className="dj-muted">Reading your local library signal…</p>}
        </div>

        {caption ? <div aria-live="polite" className="dj-caption"><Icon name="spark" size={14} /><span>{caption}</span></div> : null}

        {currentSet ? <DjSetQueue currentSet={currentSet} currentTrackId={playback.currentTrackId} library={library} /> : null}

        {error ? <DjWarning message={error} onDismiss={() => setError(null)} tone="error" /> : null}
        {warning ? <DjWarning message={warning} onDismiss={() => setWarning(null)} tone="warning" /> : null}
      </div> : null}
    </div>

    {ready && !recovery ? <footer className="dj-panel-foot">
      {!whisper?.installed ? <div className="dj-whisper">
        <span>{whisper?.message}</span>
        <div className="dj-progress"><i style={{ width: `${Math.round((whisper?.progress ?? 0) * 100)}%` }} /></div>
        <button className="button button-secondary full-width" disabled={phase === "downloading"} onClick={() => void downloadWhisper()} type="button">{phase === "downloading" ? "Downloading…" : "Install local Whisper"}</button>
      </div> : null}

      <form className="dj-request" onSubmit={(event) => { event.preventDefault(); const value = request.trim(); if (!value) return; setRequest(""); void generate(value); }}>
        <input disabled={phase === "generating" || phase === "transcribing"} maxLength={200} onChange={(event) => setRequest(event.target.value)} placeholder="Ask for a mood, genre, artist, or activity…" value={request} />
        <button aria-label="Send DJ request" className="dj-send" disabled={!request.trim() || phase !== "idle"} type="submit"><Icon name="arrow-up-right" size={16} /></button>
      </form>

      <div className="dj-actions">
        <div className="dj-talk">
          {whisper?.installed ? <button className={`dj-mic ${phase === "listening" ? "is-listening" : ""}`} disabled={phase !== "idle" && phase !== "listening"} onPointerDown={() => void startListening()} onPointerLeave={() => { if (phase === "listening") void stopListening(); }} onPointerUp={() => void stopListening()} type="button">
            <Icon name="microphone" size={13} />
            <span>{phase === "listening" ? "Release to transcribe" : phase === "transcribing" ? "Transcribing…" : "Hold to talk"}</span>
          </button> : <span className="dj-talk-empty">Install Whisper to talk to the DJ</span>}
        </div>

        <div className="dj-steering">
          <button className="button button-ghost" disabled={!sessionId || phase !== "idle"} onClick={() => void feedback("more")} type="button">More like this</button>
          <button className="button button-ghost" disabled={!sessionId || phase !== "idle"} onClick={() => void feedback("less")} type="button">Less like this</button>
          <button className="button button-ghost" disabled={!currentSet} onClick={whyThisTrack} type="button">Why this?</button>
        </div>

        <div className="dj-controls">
          <button className="button button-ghost" disabled={phase !== "idle"} onClick={() => void generate("Change the vibe completely")} type="button"><Icon name="refresh" size={13} />Change vibe</button>
          <button className="button button-ghost" onClick={() => void toggleCrossfade()} type="button">Crossfade {crossfadeMs > 0 ? "on" : "off"}</button>
          {sessionId ? <button className="button button-danger" onClick={requestEnd} type="button">End DJ</button> : null}
        </div>
      </div>
    </footer> : null}
  </aside>;
}

export function normalizeDjError(caught: unknown, fallback: string): string {
  if (caught instanceof Error && caught.message) return caught.message;
  if (typeof caught === "string" && caught.trim()) return caught;
  if (caught && typeof caught === "object") {
    const value = caught as Record<string, unknown>;
    for (const key of ["message", "error", "msg"]) {
      if (typeof value[key] === "string" && value[key].trim()) return value[key] as string;
    }
  }
  return fallback;
}

export function shouldRequestDjRefill(remaining: number, isPlaying: boolean, refillRequested: boolean, pendingIntro: boolean) {
  return remaining <= 2 && isPlaying && !refillRequested && !pendingIntro;
}

export function classifyDjFailure(kind: "generation" | "playback" | "narration" | "recovery", caught: unknown, fallback: string) {
  return {
    kind,
    message: normalizeDjError(caught, fallback),
    fatal: kind === "generation",
    preservesSet: kind !== "generation",
    retryable: true,
  } as const;
}

function DjWarning({ message, onDismiss, tone }: { message: string; onDismiss: () => void; tone: "error" | "warning" }) {
  return <div className={`dj-error is-${tone}`} role={tone === "error" ? "alert" : "status"}><span>{message}</span><button onClick={onDismiss} type="button">Dismiss</button></div>;
}

function phaseLabel(phase: DjPhase, active: boolean) {
  if (phase === "generating") return "Luna is building a set…";
  if (phase === "speaking") return "On mic";
  if (phase === "listening") return "Listening locally";
  if (phase === "transcribing") return "Whisper is transcribing…";
  if (phase === "downloading") return "Installing Whisper…";
  if (phase === "ending") return "Finishing this track";
  if (phase === "error") return "Needs attention";
  return active ? "Live" : "Ready room";
}

async function playVoice(src: string) {
  await new Promise<void>((resolve) => {
    const audio = new Audio(src);
    playbackStore.duckForNarration(true);
    const done = () => { playbackStore.duckForNarration(false); resolve(); };
    audio.addEventListener("ended", done, { once: true });
    audio.addEventListener("error", done, { once: true });
    void audio.play().catch(done);
  });
}

async function startPcmRecorder(): Promise<RecorderHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const silence = context.createGain(); silence.gain.value = 0;
  const chunks: Float32Array[] = [];
  processor.onaudioprocess = (event) => chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  source.connect(processor); processor.connect(silence); silence.connect(context.destination);
  return { stop: async () => {
    const sampleRate = context.sampleRate;
    processor.disconnect(); source.disconnect(); silence.disconnect(); stream.getTracks().forEach((track) => track.stop());
    await context.close();
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const input = new Float32Array(total); let offset = 0;
    for (const chunk of chunks) { input.set(chunk, offset); offset += chunk.length; }
    return encodeWav(resampleMono(input, sampleRate, 16_000), 16_000);
  } };
}

export function resampleMono(input: Float32Array, inputRate: number, outputRate: number) {
  if (inputRate === outputRate) return input;
  const output = new Float32Array(Math.max(1, Math.round(input.length * outputRate / inputRate)));
  const ratio = inputRate / outputRate;
  for (let index = 0; index < output.length; index += 1) {
    const position = index * ratio; const left = Math.floor(position); const right = Math.min(input.length - 1, left + 1); const mix = position - left;
    output[index] = input[left] * (1 - mix) + input[right] * mix;
  }
  return output;
}

export function encodeWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2); const view = new DataView(buffer);
  const write = (offset: number, value: string) => { for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index)); };
  write(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); write(8, "WAVE"); write(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 32768 : 32767)), true));
  return new Uint8Array(buffer);
}
