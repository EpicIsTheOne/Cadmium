import { useEffect, useState } from "react";
import { Icon } from "../../shared/components/Icon";
import type { NormalizedLibrary, TrackId } from "../../shared/domain/media";
import type { PermissionState } from "../permissions";
import type { AndroidLibraryProvider } from "../providers/android-library-provider";
import { getOpenRouterKey, setOpenRouterKey } from "../keys";

export function SettingsScreen({
  library,
  permission,
  provider,
  onRescan,
  onNavigate,
  onPlayCollection,
  favoriteTrackIds,
  onToggleFavorite,
}: {
  library: NormalizedLibrary | null;
  permission: PermissionState;
  provider: AndroidLibraryProvider;
  onRescan: () => void;
  onNavigate: (tab: "home" | "search" | "library" | "settings") => void;
  onPlayCollection: (ids: readonly TrackId[], startIndex?: number) => void;
  favoriteTrackIds: readonly TrackId[];
  onToggleFavorite: (id: TrackId) => void;
}) {
  const trackCount = library?.trackOrder.length ?? 0;
  const albumCount = library?.albumOrder.length ?? 0;
  const artistCount = library?.artistOrder.length ?? 0;

  const [openRouterDraft, setOpenRouterDraft] = useState(() => getOpenRouterKey() ?? "");
  const [openRouterSaved, setOpenRouterSaved] = useState(false);
  const [fishDraft, setFishDraft] = useState("");
  const [fishConfigured, setFishConfigured] = useState<boolean | null>(null);
  const [fishMessage, setFishMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void provider
      .getDjStatus()
      .then((status) => {
        if (!cancelled) setFishConfigured(status.fish.configured);
      })
      .catch(() => {
        if (!cancelled) setFishConfigured(null);
      });
    return () => {
      cancelled = true;
    };
  }, [provider]);

  const saveOpenRouter = () => {
    setOpenRouterKey(openRouterDraft);
    setOpenRouterSaved(true);
    window.setTimeout(() => setOpenRouterSaved(false), 2000);
  };

  const saveFish = async () => {
    const key = fishDraft.trim();
    if (!key) return;
    try {
      await provider.setFishCredential(key);
      setFishDraft("");
      setFishConfigured(true);
      setFishMessage("Fish Audio key saved.");
    } catch {
      setFishMessage("Could not save the Fish Audio key.");
    }
    window.setTimeout(() => setFishMessage(null), 3000);
  };

  return (
    <section className="mobile-section">
      <header className="settings-mobile-hero">
        <div className="settings-avatar">C</div>
        <div><p className="mobile-home-eyebrow">Cadmium Android</p><h1 className="section-title">Settings</h1><p>Local-first music, tuned your way.</p></div>
      </header>

      <div className="settings-group">
        <h2>Library</h2>
        <div className="settings-row">
          <span>Audio permission</span>
          <span className={`pill ${permission === "granted" ? "ok" : "warn"}`}>{permission}</span>
        </div>
        <button type="button" className="settings-action" onClick={onRescan}><Icon name="refresh" size={16} /> Rescan library</button>
        <div className="settings-row"><span>Tracks</span><span>{trackCount}</span></div>
        <div className="settings-row"><span>Albums</span><span>{albumCount}</span></div>
        <div className="settings-row"><span>Artists</span><span>{artistCount}</span></div>
      </div>

      <div className="settings-group">
        <h2>Keys</h2>
        <div className="settings-row">
          <span>OpenRouter API key</span>
          {openRouterSaved ? <span className="pill ok">saved</span> : null}
        </div>
        <div className="settings-key-row">
          <input
            type="password"
            value={openRouterDraft}
            onChange={(e) => setOpenRouterDraft(e.target.value)}
            placeholder="sk-or-…"
            aria-label="OpenRouter API key"
          />
          <button type="button" className="settings-action" onClick={saveOpenRouter}>Save</button>
        </div>
        <p className="muted">Luna/Whisper via OpenRouter — desktop-only backend currently; stored for when mobile Luna lands.</p>

        <div className="settings-row">
          <span>Fish Audio key</span>
          <span className={`pill ${fishConfigured ? "ok" : "warn"}`}>
            {fishConfigured == null ? "unknown" : fishConfigured ? "configured" : "not set"}
          </span>
        </div>
        <div className="settings-key-row">
          <input
            type="password"
            value={fishDraft}
            onChange={(e) => setFishDraft(e.target.value)}
            placeholder="Fish Audio API key"
            aria-label="Fish Audio API key"
          />
          <button type="button" className="settings-action" onClick={() => void saveFish()}>Save</button>
        </div>
        {fishMessage ? <p className="muted">{fishMessage}</p> : null}
        <p className="muted">Fish Audio powers the DJ's spoken intros.</p>
      </div>

      <div className="settings-group">
        <h2>Appearance</h2>
        <p className="muted">Theme and rhythm follow your desktop Cadmium identity.</p>
      </div>

      <div className="settings-group">
        <h2>About</h2>
        <div className="settings-row"><span>App</span><span>Cadmium for Android</span></div>
        <div className="settings-row"><span>Build</span><span>0.1.0-android</span></div>
        <div className="settings-row"><span>Import mode</span><span>MediaStore</span></div>
      </div>

      {permission !== "granted" && (
        <p className="muted">Grant audio access to scan and play your music.</p>
      )}
    </section>
  );
}
