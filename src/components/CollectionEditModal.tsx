import { useMemo, useRef, useState } from "react";
import type { AlbumId, ArtistId, MusicProvider, PlaylistId } from "../domain/media";
import { Icon } from "./Icon";

export type CollectionEditMode =
  | "create-playlist"
  | "create-album"
  | "edit-playlist"
  | "edit-album";

interface CollectionEditValues {
  name: string;
  description: string;
  artist: string;
  artworkDataUrl?: string;
}

interface Props {
  mode: CollectionEditMode;
  initial: CollectionEditValues;
  provider: MusicProvider | null;
  onCancel: () => void;
  onSubmit: (values: CollectionEditValues) => Promise<void> | void;
}

const LABELS: Record<CollectionEditMode, { title: string; nameLabel: string; submit: string }> = {
  "create-playlist": { title: "Create playlist", nameLabel: "Playlist name", submit: "Create playlist" },
  "create-album": { title: "Create album", nameLabel: "Album title", submit: "Create album" },
  "edit-playlist": { title: "Edit playlist", nameLabel: "Playlist name", submit: "Save changes" },
  "edit-album": { title: "Edit album", nameLabel: "Album title", submit: "Save changes" },
};

const MAX_ARTWORK_BYTES = 4 * 1024 * 1024;

export function CollectionEditModal({ mode, initial, provider, onCancel, onSubmit }: Props) {
  const isAlbum = mode === "create-album" || mode === "edit-album";
  const labels = LABELS[mode];
  const [values, setValues] = useState<CollectionEditValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const preview = useMemo(
    () => values.artworkDataUrl ?? initial.artworkDataUrl ?? undefined,
    [values.artworkDataUrl, initial.artworkDataUrl],
  );

  const canSubmit = values.name.trim().length > 0 && !busy;

  const onPickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file for the icon.");
      return;
    }
    if (file.size > MAX_ARTWORK_BYTES) {
      setError("Image must be under 4 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setValues((current) => ({ ...current, artworkDataUrl: String(reader.result) }));
    reader.onerror = () => setError("Could not read that image.");
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      await onSubmit({ ...values, name: values.name.trim(), artist: values.artist.trim() });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Something went wrong.");
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={labels.title}
    >
      <div className="collection-edit panel-surface">
        <header className="collection-edit-head">
          <h2>{labels.title}</h2>
          <button aria-label="Close" className="icon-button" onClick={onCancel} type="button">
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="collection-edit-body">
          <button
            className="collection-edit-art"
            onClick={() => fileInput.current?.click()}
            type="button"
            title="Upload an icon"
          >
            {preview ? <img alt="" src={preview} /> : <Icon name="album" size={26} />}
            <span className="collection-edit-art-overlay"><Icon name="spark" size={14} /> Icon</span>
          </button>
          <input accept="image/*" hidden onChange={onPickFile} ref={fileInput} type="file" />

          <label className="field">
            <span>{labels.nameLabel}</span>
            <input
              autoFocus
              onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
              placeholder={isAlbum ? "e.g. Midnight Drive" : "e.g. Focus Mix"}
              value={values.name}
            />
          </label>

          {isAlbum ? (
            <label className="field">
              <span>Artist</span>
              <input
                onChange={(event) => setValues((current) => ({ ...current, artist: event.target.value }))}
                placeholder="e.g. Nova Sky"
                value={values.artist}
              />
            </label>
          ) : null}

          <label className="field collection-edit-desc">
            <span>Description</span>
            <textarea
              onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))}
              placeholder="What is this collection about?"
              rows={3}
              value={values.description}
            />
          </label>

          {error ? <p className="collection-edit-error">{error}</p> : null}
        </div>

        <footer className="collection-edit-foot">
          <button className="button button-ghost" onClick={onCancel} type="button">Cancel</button>
          <button
            className="button button-accent"
            disabled={!canSubmit}
            onClick={submit}
            type="button"
          >
            {labels.submit}
          </button>
        </footer>
      </div>
    </div>
  );
}

export type { CollectionEditValues };
