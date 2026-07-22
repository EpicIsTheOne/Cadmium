import { useCallback, useEffect, useRef, useState } from "react";
import type { DjNarration, DjRecovery, DjSet, DjStatus, FishVoice, QueueSnapshot, WhisperStatus } from "../domain/dj";
import type { NormalizedLibrary, TrackId } from "../domain/media";
import { playbackStore, usePlaybackState } from "../playback/playback-store";
import { LocalLibraryProvider } from "../providers/local-library-provider";
import { Icon } from "./Icon";

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
  const [chat, setChat] = useState<readonly ChatLine[]>([]);
  const snapshot = useRef<QueueSnapshot | null>(null);
  const autoStarted = useRef(false);
  const refillRequested = useRef(false);
  const endAfterTrack = useRef<string | null>(null);
  const pendingIntro = useRef<{ set: DjSet; narration: DjNarration | null } | null>(null);
  const recorder = useRef<RecorderHandle | null>(null);
  const stopRequested = useRef(false);
  const recordTimer = useRef<number | null>(null);

  const refreshServices = useCallback(async () => {
    try {
      const [nextStatus, nextWhisper, nextRecovery, nextCrossfade] = await Promise.all([
        provider.getDjStatus(), provider.getWhisperStatus(), provider.getDjRecovery(), provider.getDjCrossfadeMs(),
      ]);
      setStatus(nextStatus);
      setWhisper(nextWhisper);
      setCrossfadeMs(nextCrossfade); playbackStore.setDjCrossfadeMs(nextCrossfade);
      if (!sessionId) setRecovery(nextRecovery);
    } catch { setError("Cadmium could not read DJ services."); }
  }, [provider, sessionId]);

  useEffect(() => { if (open) void refreshServices(); else autoStarted.current = false; }, [open, refreshServices]);
  useEffect(() => { onActivityChange?.(sessionId ? (phase === "idle" ? "active" : phase) : phase); }, [onActivityChange, phase, sessionId]);

  const playNarration = useCallback(async (text: string, prepared: DjNarration | null = null) => {
    setCaption(text);
    if (!status?.fish.configured || !status.fish.voiceId) return;
    setPhase("speaking");
    try {
      const narration = prepared ?? await provider.synthesizeDjNarration(text);
      await playVoice(narration.src);
    } catch {
      setError("Fish Audio is unavailable. The caption remains; the voice gremlin wandered off.");
    } finally { setPhase("idle"); }
  }, [provider, status]);

  const generate = useCallback(async (prompt: string, refill = false) => {
    if (phase !== "idle" || !library.trackOrder.length) return;
    setError(null);
    setPhase("generating");
    if (!snapshot.current) snapshot.current = playbackStore.captureQueueSnapshot();
    if (!refill) setChat((lines) => [...lines, { id: `user-${Date.now()}`, role: "user", text: prompt }]);
    try {
      const set = await provider.generateDjSet(sessionId, prompt);
      setSessionId(set.sessionId);
      playbackStore.setDjSession(set.sessionId);
      setChat((lines) => [...lines, { id: `dj-${set.id}`, role: "dj", text: `${set.narration}${set.generationMode === "local_fallback" ? " · Local fallback" : ""}` }]);
      if (refill) {
        let narration: DjNarration | null = null;
        if (status?.fish.configured && status.fish.voiceId) narration = await provider.synthesizeDjNarration(set.narration).catch(() => null);
        pendingIntro.current = { set, narration };
        await playbackStore.appendDjCollectionAndContinue(set.trackIds);
        refillRequested.current = false;
      } else {
        setCurrentSet(set);
        await playNarration(set.narration);
        await playbackStore.playCollection(set.trackIds, "dj");
        if (snapshot.current) await provider.saveDjRecovery(set.sessionId, set.id, snapshot.current, playbackStore.captureQueueSnapshot());
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The DJ could not build that set.");
      refillRequested.current = false;
      setPhase("error");
      return;
    }
    setPhase("idle");
  }, [library.trackOrder.length, phase, playNarration, provider, sessionId, status]);

  useEffect(() => {
    if (!open || autoStarted.current || recovery || sessionId || !status || !library.trackOrder.length) return;
    autoStarted.current = true;
    void generate("Start a balanced set from my library");
  }, [generate, library.trackOrder.length, open, recovery, sessionId, status]);

  useEffect(() => {
    if (!sessionId || !currentSet || (phase !== "idle" && phase !== "speaking")) return;
    const remaining = playback.queue.length - playback.queueIndex - 1;
    if (remaining <= 2 && playback.isPlaying && !refillRequested.current && !pendingIntro.current) {
      refillRequested.current = true;
      void generate(`Continue the ${currentSet.title} vibe with a fresh set`, true);
    }
  }, [currentSet, generate, phase, playback.isPlaying, playback.queue.length, playback.queueIndex, sessionId]);

  useEffect(() => {
    const pending = pendingIntro.current;
    if (!pending || playback.currentTrackId !== pending.set.trackIds[0]) return;
    pendingIntro.current = null;
    setCurrentSet(pending.set);
    void playNarration(pending.set.narration, pending.narration);
  }, [playNarration, playback.currentTrackId]);

  useEffect(() => {
    if (!sessionId || !currentSet || !snapshot.current) return;
    const timer = window.setTimeout(() => {
      if (snapshot.current) void provider.saveDjRecovery(sessionId, currentSet.id, snapshot.current, playbackStore.captureQueueSnapshot());
    }, 700);
    return () => window.clearTimeout(timer);
  }, [currentSet, playback.currentTrackId, playback.positionMs, playback.queueIndex, provider, sessionId]);

  const finishEnd = useCallback(async (ordinary = snapshot.current) => {
    if (!sessionId) return;
    setPhase("ending");
    await provider.endDjSession(sessionId).catch(() => undefined);
    playbackStore.setDjSession(null);
    if (ordinary) await playbackStore.restoreQueueSnapshot(ordinary);
    snapshot.current = null;
    pendingIntro.current = null;
    endAfterTrack.current = null;
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
    try { await provider.setFishCredential(apiKey); setApiKey(""); await refreshServices(); }
    catch { setError("That Fish Audio key could not be stored in Windows Credential Manager."); }
  };

  const searchVoices = async () => {
    setError(null);
    try { setVoices(await provider.searchFishVoices(voiceQuery)); }
    catch { setError("Fish voice search failed. Check the credential and connection."); }
  };

  const selectVoice = async (voice: FishVoice) => {
    await provider.selectFishVoice(voice.id, voice.title);
    setVoices([]); setChangingVoice(false); await refreshServices();
  };

  const previewVoice = async (voice: FishVoice) => {
    try { setPhase("speaking"); const narration = await provider.previewFishVoice(voice.id); await playVoice(narration.src); }
    catch { setError("That Fish voice could not be previewed."); }
    finally { setPhase("idle"); }
  };

  const downloadWhisper = async () => {
    setPhase("downloading"); setError(null);
    const poll = window.setInterval(() => void provider.getWhisperStatus().then(setWhisper), 500);
    try { setWhisper(await provider.downloadWhisperModel()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Whisper could not be downloaded."); }
    finally { window.clearInterval(poll); setPhase("idle"); }
  };

  const startListening = async () => {
    if (!whisper?.installed || phase !== "idle") return;
    stopRequested.current = false; setError(null); setPhase("listening");
    try {
      const handle = await startPcmRecorder();
      recorder.current = handle;
      recordTimer.current = window.setTimeout(() => void stopListening(), 15_000);
      if (stopRequested.current) void stopListening();
    } catch { setError("Microphone access was denied or unavailable."); setPhase("error"); }
  };

  const stopListening = async () => {
    if (!recorder.current) { stopRequested.current = true; return; }
    if (recordTimer.current) window.clearTimeout(recordTimer.current);
    const handle = recorder.current; recorder.current = null; setPhase("transcribing");
    try { const wav = await handle.stop(); const result = await provider.transcribeDjRequest(wav); setRequest(result.text); setPhase("idle"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Whisper could not transcribe that request."); setPhase("error"); }
  };

  const feedback = async (sentiment: "more" | "less") => {
    if (!sessionId || !playback.currentTrackId) return;
    await provider.recordDjFeedback(sessionId, playback.currentTrackId, sentiment).catch(() => setError("DJ feedback could not be saved."));
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
    <header><div><span className={`dj-live-dot is-${phase}`} /><div><strong>Cadmium DJ</strong><small>{phaseLabel(phase, Boolean(sessionId))}</small></div></div><button aria-label="Close DJ chat" onClick={onClose} type="button"><Icon name="close" size={16} /></button></header>
    <div className="dj-panel-scroll">
      <p className="dj-disclosure">Metadata and listening signals go to Luna. Narration text goes to Fish. Microphone audio stays on this PC and is deleted after local Whisper transcription.</p>
      {!status ? <p className="dj-muted">Checking Luna, Fish, and Whisper…</p> : null}
      {status ? <section className="dj-service-line"><span className={status.lunaAvailable ? "is-ready" : "is-fallback"}>{status.lunaAvailable ? "Luna 5.6 ready" : "Local fallback"}</span><span className={whisper?.installed ? "is-ready" : ""}>Whisper {whisper?.installed ? "ready" : "not installed"}</span>{status.fish.voiceLabel ? <button className="dj-change-voice" onClick={() => { setChangingVoice(true); setVoices([]); }} type="button">{status.fish.voiceLabel} · Change</button> : null}</section> : null}
      {recovery ? <section className="dj-recovery"><span>Interrupted session</span><h3>{recovery.currentSet.title}</h3><p>Cadmium restored the DJ queue without autoplaying it.</p><div><button onClick={() => void resumeRecovery()} type="button">Resume DJ</button><button onClick={() => void dismissRecovery()} type="button">End session</button></div></section> : null}
      {status && !status.fish.configured ? <section className="dj-setup is-optional"><span>Optional · Spoken intros</span><h3>Connect Fish Audio</h3><p>The DJ works with captions without Fish.</p><input autoComplete="off" onChange={(event) => setApiKey(event.target.value)} placeholder="Fish Audio API key" type="password" value={apiKey} /><button disabled={!apiKey.trim()} onClick={() => void saveCredential()} type="button">Store securely</button></section> : null}
      {configured && (!status?.fish.voiceId || changingVoice) ? <section className="dj-setup"><span>DJ voice</span><h3>{status?.fish.voiceId ? "Change the voice" : "Choose the voice"}</h3><div className="dj-search"><input onChange={(event) => setVoiceQuery(event.target.value)} value={voiceQuery} /><button onClick={() => void searchVoices()} type="button"><Icon name="search" size={14} />Search</button></div>{voices.map((voice) => <div className="dj-voice-row" key={voice.id}><button className="dj-voice" onClick={() => void selectVoice(voice)} type="button"><strong>{voice.title}</strong><small>{voice.matchReasons.slice(0, 2).join(" · ") || voice.languages.join(", ")}</small></button><button aria-label={`Preview ${voice.title}`} onClick={() => void previewVoice(voice)} type="button">Preview</button></div>)}{status?.fish.voiceId ? <button className="dj-cancel-voice" onClick={() => { setChangingVoice(false); setVoices([]); }} type="button">Keep current voice</button> : null}</section> : null}
      {ready && !recovery ? <><div className="dj-now-set">{currentSet ? <><span>Set {currentSet.sequence + 1}</span><strong>{currentSet.title}</strong><small>{currentSet.rationale}</small></> : <span>Preparing your first set</span>}</div><div className="dj-chat">{chat.length ? chat.map((line) => <article className={`dj-message is-${line.role}`} key={line.id}><small>{line.role === "dj" ? "DJ" : "You"}</small><p>{line.text}</p></article>) : <p className="dj-muted">Reading your local library signal…</p>}</div>{caption ? <div aria-live="polite" className="dj-caption"><Icon name="spark" size={14} /><span>{caption}</span></div> : null}</> : null}
      {error ? <div className="dj-error" role="alert">{error}<button onClick={() => { setError(null); setPhase("idle"); }} type="button">Dismiss</button></div> : null}
    </div>
    {ready && !recovery ? <footer>
      {!whisper?.installed ? <div className="dj-whisper"><span>{whisper?.message}</span><div className="dj-progress"><i style={{ width: `${Math.round((whisper?.progress ?? 0) * 100)}%` }} /></div><button disabled={phase === "downloading"} onClick={() => void downloadWhisper()} type="button">{phase === "downloading" ? "Downloading…" : "Install local Whisper"}</button></div> : null}
      <form onSubmit={(event) => { event.preventDefault(); const value = request.trim(); if (!value) return; setRequest(""); void generate(value); }}><input disabled={phase !== "idle"} maxLength={200} onChange={(event) => setRequest(event.target.value)} placeholder="Ask for a mood, genre, artist, or activity…" value={request} /><button aria-label="Send DJ request" disabled={!request.trim() || phase !== "idle"} type="submit"><Icon name="arrow-up-right" size={16} /></button></form>
      <div className="dj-talk-row">{whisper?.installed ? <button className={phase === "listening" ? "is-listening" : ""} disabled={phase !== "idle" && phase !== "listening"} onPointerDown={() => void startListening()} onPointerLeave={() => { if (phase === "listening") void stopListening(); }} onPointerUp={() => void stopListening()} type="button"><Icon name="microphone" size={13} />{phase === "listening" ? "Release to transcribe" : phase === "transcribing" ? "Transcribing…" : "Hold to talk"}</button> : <span />}</div>
      <div className="dj-steering"><button disabled={!sessionId || phase !== "idle"} onClick={() => void feedback("more")} type="button">More like this</button><button disabled={!sessionId || phase !== "idle"} onClick={() => void feedback("less")} type="button">Less like this</button><button disabled={!currentSet} onClick={whyThisTrack} type="button">Why this?</button></div>
      <div><button disabled={phase !== "idle"} onClick={() => void generate("Change the vibe completely")} type="button"><Icon name="refresh" size={13} />Change vibe</button><button onClick={() => void toggleCrossfade()} type="button">Crossfade {crossfadeMs > 0 ? "on" : "off"}</button>{sessionId ? <button className="dj-end" onClick={requestEnd} type="button">End DJ</button> : null}</div>
    </footer> : null}
  </aside>;
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
