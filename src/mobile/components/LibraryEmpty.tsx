import type { NormalizedLibrary } from "../../shared/domain/media";
import { Icon } from "../../shared/components/Icon";

/**
 * Mobile library empty state.
 *
 * On Android, music arrives from the system MediaStore (not a folder picker),
 * so the honest "add music" actions are: a rescan ("Scan device") for indexed
 * tracks, and an explicit Storage Access Framework picker ("Choose audio
 * files") for the exact files MediaStore never indexed. Both are surfaced.
 */
export function LibraryEmpty({
  onScan,
  scanning,
  onChooseFiles,
  importing,
}: {
  library: NormalizedLibrary | null;
  onScan: () => void;
  scanning: boolean;
  onChooseFiles: () => void;
  importing: boolean;
}) {
  return (
    <div className="mobile-empty panel-surface">
      <div className="mobile-empty-art">
        <Icon name="music" size={40} />
      </div>
      <h2 className="mobile-empty-title">No music here yet</h2>
      <p className="mobile-empty-body">
        Cadmium reads the audio already on this device through Android's
        MediaStore. If a track is missing, choose it directly below — or tap
        Scan device to refresh everything MediaStore has indexed.
      </p>
      <button
        type="button"
        className="primary-button primary-button--accent"
        onClick={onChooseFiles}
        disabled={importing}
      >
        <Icon name="plus" size={18} />
        {importing ? "Opening picker…" : "Choose audio files"}
      </button>
      <button
        type="button"
        className="primary-button primary-button--ghost"
        onClick={onScan}
        disabled={scanning}
      >
        <Icon name="refresh" size={18} />
        {scanning ? "Scanning…" : "Scan device for music"}
      </button>
    </div>
  );
}
