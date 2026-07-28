import { Icon } from "../../shared/components/Icon";
import type { PermissionState } from "../permissions";

export function PermissionGate({
  state,
  busy = false,
  error = null,
  onRequest,
  onOpenSettings,
}: {
  state: PermissionState;
  busy?: boolean;
  error?: string | null;
  onRequest: () => void;
  onOpenSettings: () => void;
}) {
  const permanently = state === "permanentlyDenied";
  return (
    <div className="app-shell mobile-shell">
      <main className="mobile-permission" role="dialog" aria-label="Audio access">
        <div className="permission-card panel-surface">
          <Icon name="music" size={42} />
          <h1>Cadmium needs audio access</h1>
          <p>
            Cadmium reads the music already on your phone through Android's
            MediaStore. It is read-only — your files are never modified, moved,
            or deleted.
          </p>
          {state === "denied" && (
            <p className="permission-hint">You can grant access whenever you're ready.</p>
          )}
          {error && <p className="permission-error" role="alert">{error}</p>}
          {permanently ? (
            <button type="button" className="primary-button" disabled={busy} onClick={onOpenSettings}>
              {busy ? "Opening app settings…" : "Open app settings"}
            </button>
          ) : (
            <button type="button" className="primary-button" disabled={busy} onClick={onRequest}>
              {busy ? "Opening Android prompt…" : state === "unknown" ? "Continue" : "Grant audio access"}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
