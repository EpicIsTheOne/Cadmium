import { Icon } from "../../shared/components/Icon";
import type { PermissionState } from "../permissions";

export function PermissionGate({
  state,
  onRequest,
  onOpenSettings,
}: {
  state: PermissionState;
  onRequest: () => void;
  onOpenSettings: () => void;
}) {
  const permanently = state === "permanentlyDenied";
  return (
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
        {permanently ? (
          <button type="button" className="primary-button" onClick={onOpenSettings}>
            Open app settings
          </button>
        ) : (
          <button type="button" className="primary-button" onClick={onRequest}>
            {state === "unknown" ? "Continue" : "Grant audio access"}
          </button>
        )}
      </div>
    </main>
  );
}
