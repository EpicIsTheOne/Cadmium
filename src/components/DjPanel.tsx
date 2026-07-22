import { useCallback, useEffect, useRef, useState } from "react";
import type { DjSet, DjStatus, FishVoice, QueueSnapshot } from "../domain/dj";
import type { NormalizedLibrary } from "../domain/media";
import { LocalLibraryProvider } from "../providers/local-library-provider";
import { playbackStore, usePlaybackState } from "../playback/playback-store";
import { Icon } from "./Icon";

interface Props {
  readonly library: NormalizedLibrary;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly provider: LocalLibraryProvider;
}

type ChatLine = { id: string; role: "user" | "dj"; text: string };

export function DjPanel({ library, open, onClose, provider }: Props) {
  const playback = usePlaybackState();
  const [status, setStatus] = useState<DjStatus | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentSet, setCurrentSet] = useState<DjSet | null>(null);
  const [request, setRequest] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [voiceQuery, setVoiceQuery] = useState("warm radio host");
  const [voices, setVoices] = useState<readonly FishVoice[]>([]);
  const [phase, setPhase] = useState<"idle" | "generating" | "speaking" | "ending">("idle");
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [chat, setChat] = useState<readonly ChatLine[]>([]);
  const snapshot = useRef<QueueSnapshot | null>(null);
  const autoStarted = useRef(false);
  const refillRequested = useRef(false);
  const endAfterTrack = useRef<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try { setStatus(await provider.getDjStatus()); }
    catch { setError("Cadmium could not read DJ services."); }
  }, [provider]);

  useEffect(() => { if (open) void refreshStatus(); else autoStarted.current = false; }, [open, refreshStatus]);

  const speak = useCallback(async (text: string) => {
    setCaption(text);
    if (!status?.fish.configured || !status.fish.voiceId) return;
    setPhase("speaking");
    try {
      const narration = await provider.synthesizeDjNarration(text);
      await new Promise<void>((resolve) => {
        const audio = new Audio(narration.src);
        playbackStore.duckForNarration(true);
        const done = () => { playbackStore.duckForNarration(false); resolve(); };
        audio.addEventListener("ended", done, { once: true });
        audio.addEventListener("error", done, { once: true });
        void audio.play().catch(done);
      });
    } catch {
      setError("Fish Audio is unavailable. The DJ caption is still here; the voice gremlin is not.");
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
      setCurrentSet(set);
      setChat((lines) => [...lines, { id: `dj-${set.id}`, role: "dj", text: `${set.narration}${set.generationMode === "local_fallback" ? " · Local fallback" : ""}` }]);
      if (refill) {
        playbackStore.enqueueCollection(set.trackIds, "dj");
        refillRequested.current = false;
      } else {
        await speak(set.narration);
        await playbackStore.playCollection(set.trackIds, "dj");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The DJ could not build that set.");
      refillRequested.current = false;
    } finally { setPhase("idle"); }
  }, [library.trackOrder.length, phase, provider, sessionId, speak]);

  useEffect(() => {
    if (!open || autoStarted.current || sessionId || !status?.fish.configured || !status.fish.voiceId || !library.trackOrder.length) return;
    autoStarted.current = true;
    void generate("Start a balanced set from my library");
  }, [generate, library.trackOrder.length, open, sessionId, status]);

  useEffect(() => {
    if (!sessionId || !currentSet || phase !== "idle") return;
    const remaining = playback.queue.length - playback.queueIndex - 1;
    if (remaining <= 2 && playback.isPlaying && !refillRequested.current) {
      refillRequested.current = true;
      void generate(`Continue the ${currentSet.title} vibe with a fresh set`, true);
    }
  }, [currentSet, generate, phase, playback.isPlaying, playback.queue.length, playback.queueIndex, sessionId]);

  const finishEnd = useCallback(async () => {
    if (!sessionId) return;
    setPhase("ending");
    await provider.endDjSession(sessionId).catch(() => undefined);
    playbackStore.setDjSession(null);
    if (snapshot.current) await playbackStore.restoreQueueSnapshot(snapshot.current);
    snapshot.current = null;
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

  const saveCredential = async () => {
    try { await provider.setFishCredential(apiKey); setApiKey(""); await refreshStatus(); }
    catch { setError("That Fish Audio key could not be stored in Windows Credential Manager."); }
  };

  const searchVoices = async () => {
    setError(null);
    try { setVoices(await provider.searchFishVoices(voiceQuery)); }
    catch { setError("Fish voice search failed. Check the credential and connection."); }
  };

  const selectVoice = async (voice: FishVoice) => {
    await provider.selectFishVoice(voice.id, voice.title);
    setVoices([]);
    await refreshStatus();
  };

  if (!open) return null;
  const configured = status?.fish.configured && status.fish.nodeAvailable;
  const ready = configured && status?.fish.voiceId;
  return <aside aria-label="Cadmium AI DJ" className="dj-panel">
    <header><div><span className="dj-live-dot" /><div><strong>Cadmium DJ</strong><small>{phase === "generating" ? "Luna is building a set…" : phase === "speaking" ? "On mic" : sessionId ? "Live" : "Ready room"}</small></div></div><button aria-label="Close DJ chat" onClick={onClose} type="button"><Icon name="close" size={16} /></button></header>
    <div className="dj-panel-scroll">
      <p className="dj-disclosure">Track metadata and listening signals go to Luna. Narration text goes to Fish Audio. Paths and artwork stay local.</p>
      {!status ? <p className="dj-muted">Checking Luna and Fish Audio…</p> : null}
      {status ? <section className="dj-service-line"><span className={status.lunaAvailable ? "is-ready" : "is-fallback"}>{status.lunaAvailable ? "Luna 5.6 ready" : "Luna unavailable · local fallback"}</span>{status.fish.voiceLabel ? <span>{status.fish.voiceLabel}</span> : null}</section> : null}
      {status && !configured ? <section className="dj-setup"><span>1 · Voice service</span><h3>Connect Fish Audio</h3><p>{status.fish.message}</p><input autoComplete="off" onChange={(event) => setApiKey(event.target.value)} placeholder="Fish Audio API key" type="password" value={apiKey} /><button disabled={!apiKey.trim()} onClick={() => void saveCredential()} type="button">Store securely</button></section> : null}
      {configured && !status?.fish.voiceId ? <section className="dj-setup"><span>2 · DJ voice</span><h3>Choose the voice</h3><div className="dj-search"><input onChange={(event) => setVoiceQuery(event.target.value)} value={voiceQuery} /><button onClick={() => void searchVoices()} type="button"><Icon name="search" size={14} />Search</button></div>{voices.map((voice) => <button className="dj-voice" key={voice.id} onClick={() => void selectVoice(voice)} type="button"><strong>{voice.title}</strong><small>{voice.matchReasons.slice(0, 2).join(" · ") || voice.languages.join(", ")}</small></button>)}</section> : null}
      {ready ? <><div className="dj-chat">{chat.length ? chat.map((line) => <article className={`dj-message is-${line.role}`} key={line.id}><small>{line.role === "dj" ? "DJ" : "You"}</small><p>{line.text}</p></article>) : <p className="dj-muted">Opening the booth and reading your library signal…</p>}</div>{caption ? <div aria-live="polite" className="dj-caption"><Icon name="spark" size={14} /><span>{caption}</span></div> : null}</> : null}
      {error ? <div className="dj-error" role="alert">{error}</div> : null}
    </div>
    {ready ? <footer><form onSubmit={(event) => { event.preventDefault(); const value = request.trim(); if (!value) return; setRequest(""); void generate(value); }}><input disabled={phase !== "idle" && phase !== "ending"} maxLength={200} onChange={(event) => setRequest(event.target.value)} placeholder="Ask for a mood, genre, artist, or activity…" value={request} /><button aria-label="Send DJ request" disabled={!request.trim() || phase !== "idle"} type="submit"><Icon name="arrow-up-right" size={16} /></button></form><div><button disabled={phase !== "idle"} onClick={() => void generate("Change the vibe completely") } type="button"><Icon name="refresh" size={13} />Change vibe</button>{sessionId ? <button className="dj-end" onClick={requestEnd} type="button">End DJ</button> : null}</div></footer> : null}
  </aside>;
}
