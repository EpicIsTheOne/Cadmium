import type { NormalizedLibrary } from "../../shared/domain/media";
import { Icon } from "../../shared/components/Icon";

/**
 * Mobile library empty state.
 *
 * On Android, music arrives from the system MediaStore (not a folder picker),
 * so the honest "add music" action is a rescan. This card mirrors the
 * desktop Cadmium empty-state language (glass surface, accent glow) while
 * staying mobile-appropriate: no "drop a folder" desktop metaphor.
 */
export function LibraryEmpty({
  onScan,
  scanning,
}: {
  library: NormalizedLibrary | null;
  onScan: () => void;
  scanning: boolean;
}) {
  return (
    <div className="mobile-empty panel-surface">
      <div className="mobile-empty-art">
        <Icon name="music" size={40} />
      </div>
      <h2 className="mobile-empty-title">No music here yet</h2>
      <p className="mobile-empty-body">
        Cadmium reads the audio already on this device through Android's
        MediaStore. Tap below to scan for tracks, albums, and playlists.
      </p>
      <button
        type="button"
        className="primary-button"
        onClick={onScan}
        disabled={scanning}
      >
        <Icon name="refresh" size={18} />
        {scanning ? "Scanning…" : "Scan device for music"}
      </button>
    </div>
  );
}
