import { Icon } from "../../shared/components/Icon";
import type { NormalizedLibrary, TrackId } from "../../shared/domain/media";
import type { PermissionState } from "../permissions";

export function SettingsScreen({
  library,
  permission,
  onRescan,
  onNavigate,
  onPlayCollection,
  favoriteTrackIds,
  onToggleFavorite,
}: {
  library: NormalizedLibrary | null;
  permission: PermissionState;
  onRescan: () => void;
  onNavigate: (tab: "home" | "search" | "library" | "settings") => void;
  onPlayCollection: (ids: readonly TrackId[], startIndex?: number) => void;
  favoriteTrackIds: readonly TrackId[];
  onToggleFavorite: (id: TrackId) => void;
}) {
  const trackCount = library?.trackOrder.length ?? 0;
  const albumCount = library?.albumOrder.length ?? 0;
  const artistCount = library?.artistOrder.length ?? 0;

  return (
    <section className="mobile-section">
      <h1 className="section-title">Settings</h1>

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
