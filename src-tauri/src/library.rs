use lofty::prelude::*;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fmt::{Display, Formatter};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use walkdir::WalkDir;

const MAX_ARTWORK_BYTES: usize = 4 * 1024 * 1024;
const SUPPORTED_EXTENSIONS: &[&str] = &["mp3", "flac", "wav", "ogg", "m4a", "aac"];

const MIGRATIONS: &[(i64, &str)] = &[
    (
        1,
        r#"
        CREATE TABLE watched_folders (
            id TEXT PRIMARY KEY NOT NULL,
            path TEXT NOT NULL UNIQUE,
            created_at INTEGER NOT NULL,
            last_scanned_at INTEGER
        );

        CREATE TABLE artists (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            normalized_name TEXT NOT NULL UNIQUE
        );

        CREATE TABLE albums (
            id TEXT PRIMARY KEY NOT NULL,
            title TEXT NOT NULL,
            normalized_title TEXT NOT NULL,
            year INTEGER,
            artwork_ref TEXT
        );

        CREATE TABLE album_artists (
            album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
            artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
            position INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (album_id, artist_id)
        );

        CREATE TABLE tracks (
            id TEXT PRIMARY KEY NOT NULL,
            watched_folder_id TEXT NOT NULL REFERENCES watched_folders(id) ON DELETE CASCADE,
            album_id TEXT REFERENCES albums(id) ON DELETE SET NULL,
            album_artist_id TEXT REFERENCES artists(id) ON DELETE SET NULL,
            title TEXT NOT NULL,
            normalized_title TEXT NOT NULL,
            track_number INTEGER,
            disc_number INTEGER,
            year INTEGER,
            genre TEXT,
            duration_ms INTEGER NOT NULL DEFAULT 0,
            source_path TEXT NOT NULL UNIQUE,
            extension TEXT NOT NULL,
            byte_length INTEGER NOT NULL DEFAULT 0,
            modified_ms INTEGER NOT NULL DEFAULT 0,
            artwork_ref TEXT,
            available INTEGER NOT NULL DEFAULT 1,
            last_seen_ms INTEGER NOT NULL
        );

        CREATE TABLE track_artists (
            track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
            artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
            position INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (track_id, artist_id)
        );

        CREATE TABLE recent_plays (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
            played_at INTEGER NOT NULL,
            position_ms INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE settings (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL
        );

        CREATE TABLE queue (
            position INTEGER PRIMARY KEY NOT NULL,
            queue_id TEXT NOT NULL UNIQUE,
            track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
            source TEXT NOT NULL,
            added_at INTEGER NOT NULL
        );

        CREATE TABLE playback_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            current_track_id TEXT REFERENCES tracks(id) ON DELETE SET NULL,
            position_ms INTEGER NOT NULL DEFAULT 0,
            queue_index INTEGER NOT NULL DEFAULT 0,
            shuffle INTEGER NOT NULL DEFAULT 0,
            repeat_mode TEXT NOT NULL DEFAULT 'off',
            updated_at INTEGER NOT NULL
        );

        INSERT INTO settings (key, value) VALUES ('volume', '0.8');
        INSERT INTO settings (key, value) VALUES ('muted', '0');
        INSERT INTO settings (key, value) VALUES ('theme', 'nocturne');
        INSERT INTO playback_state (id, updated_at) VALUES (1, 0);
        "#,
    ),
    (
        2,
        r#"
        CREATE INDEX idx_tracks_folder ON tracks(watched_folder_id);
        CREATE INDEX idx_tracks_title ON tracks(normalized_title);
        CREATE INDEX idx_tracks_album ON tracks(album_id);
        CREATE INDEX idx_track_artists_artist ON track_artists(artist_id);
        CREATE INDEX idx_album_artists_artist ON album_artists(artist_id);
        CREATE INDEX idx_recent_plays_played_at ON recent_plays(played_at DESC);
        "#,
    ),
];

#[derive(Debug)]
pub enum LibraryError {
    Io(std::io::Error),
    Sql(rusqlite::Error),
    Metadata(String),
    InvalidPath(String),
    InvalidInput(String),
    NotFound(String),
}

impl Display for LibraryError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(f, "filesystem error: {error}"),
            Self::Sql(error) => write!(f, "database error: {error}"),
            Self::Metadata(error) => write!(f, "metadata error: {error}"),
            Self::InvalidPath(error) => write!(f, "invalid path: {error}"),
            Self::InvalidInput(error) => write!(f, "invalid input: {error}"),
            Self::NotFound(error) => write!(f, "not found: {error}"),
        }
    }
}

impl std::error::Error for LibraryError {}

impl From<std::io::Error> for LibraryError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<rusqlite::Error> for LibraryError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Sql(error)
    }
}

pub type LibraryResult<T> = Result<T, LibraryError>;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchedFolderDto {
    pub id: String,
    pub path: String,
    pub created_at: i64,
    pub last_scanned_at: Option<i64>,
    pub track_count: usize,
    pub unavailable_count: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistDto {
    pub id: String,
    pub name: String,
    pub artwork_path: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumDto {
    pub id: String,
    pub title: String,
    pub artist_ids: Vec<String>,
    pub year: Option<i64>,
    pub artwork_path: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackDto {
    pub id: String,
    pub title: String,
    pub album_id: Option<String>,
    pub artist_ids: Vec<String>,
    pub duration_ms: i64,
    pub track_number: Option<i64>,
    pub disc_number: Option<i64>,
    pub year: Option<i64>,
    pub genre: Option<String>,
    pub artwork_path: Option<String>,
    pub source_path: Option<String>,
    pub format: String,
    pub byte_length: i64,
    pub available: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedLibraryDto {
    pub tracks: Vec<TrackDto>,
    pub albums: Vec<AlbumDto>,
    pub artists: Vec<ArtistDto>,
    pub recent_track_ids: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultsDto {
    pub track_ids: Vec<String>,
    pub album_ids: Vec<String>,
    pub artist_ids: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsDto {
    pub volume: f32,
    pub muted: bool,
    pub theme: String,
}

impl Default for SettingsDto {
    fn default() -> Self {
        Self {
            volume: 0.8,
            muted: false,
            theme: "nocturne".to_owned(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackStateDto {
    pub current_track_id: Option<String>,
    pub position_ms: i64,
    pub queue_index: usize,
    pub shuffle: bool,
    pub repeat_mode: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueItemDto {
    pub id: String,
    pub track_id: String,
    pub added_at: i64,
    pub source: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSummaryDto {
    pub folder_id: String,
    pub files_seen: usize,
    pub tracks_indexed: usize,
    pub unavailable_count: usize,
    pub metadata_errors: usize,
}

pub struct LibraryRepository {
    conn: Connection,
    data_dir: PathBuf,
    artwork_dir: PathBuf,
}

impl LibraryRepository {
    pub fn open(data_dir: &Path) -> LibraryResult<Self> {
        fs::create_dir_all(data_dir)?;
        let artwork_dir = data_dir.join("artwork");
        fs::create_dir_all(&artwork_dir)?;
        let db_path = data_dir.join("cadmium.sqlite3");
        let conn = Connection::open(db_path)?;
        Self::configure_and_migrate(conn, data_dir.to_path_buf(), artwork_dir)
    }

    #[cfg(test)]
    fn open_in_memory(root: &Path) -> LibraryResult<Self> {
        fs::create_dir_all(root)?;
        let artwork_dir = root.join("artwork");
        fs::create_dir_all(&artwork_dir)?;
        let conn = Connection::open_in_memory()?;
        Self::configure_and_migrate(conn, root.to_path_buf(), artwork_dir)
    }

    fn configure_and_migrate(
        conn: Connection,
        data_dir: PathBuf,
        artwork_dir: PathBuf,
    ) -> LibraryResult<Self> {
        conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;")?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL);",
        )?;

        let current: i64 = conn.query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )?;
        for (version, sql) in MIGRATIONS.iter().filter(|(version, _)| *version > current) {
            let tx = conn.unchecked_transaction()?;
            tx.execute_batch(sql)?;
            tx.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, ?2)",
                params![version, now_ms()],
            )?;
            tx.commit()?;
        }

        Ok(Self {
            conn,
            data_dir,
            artwork_dir,
        })
    }

    pub fn list_watched_folders(&self) -> LibraryResult<Vec<WatchedFolderDto>> {
        let mut statement = self.conn.prepare(
            "SELECT f.id, f.path, f.created_at, f.last_scanned_at,
                    COUNT(t.id), COALESCE(SUM(CASE WHEN t.available = 0 THEN 1 ELSE 0 END), 0)
             FROM watched_folders f
             LEFT JOIN tracks t ON t.watched_folder_id = f.id
             GROUP BY f.id
             ORDER BY f.path COLLATE NOCASE",
        )?;
        let folders = statement
            .query_map([], |row| {
                Ok(WatchedFolderDto {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    created_at: row.get(2)?,
                    last_scanned_at: row.get(3)?,
                    track_count: row.get::<_, i64>(4)? as usize,
                    unavailable_count: row.get::<_, i64>(5)? as usize,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(folders)
    }

    pub fn add_watched_folder(&mut self, raw_path: &str) -> LibraryResult<ScanSummaryDto> {
        let path = canonicalize_directory(raw_path)?;
        let path_string = path.to_string_lossy().into_owned();
        let folder_id = stable_id("folder", &path_string);
        let timestamp = now_ms();

        self.conn.execute(
            "INSERT INTO watched_folders (id, path, created_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(path) DO NOTHING",
            params![folder_id, path_string, timestamp],
        )?;
        self.rescan_watched_folder(&folder_id)
    }

    pub fn rescan_watched_folder(&mut self, folder_id: &str) -> LibraryResult<ScanSummaryDto> {
        let folder_path: String = self
            .conn
            .query_row(
                "SELECT path FROM watched_folders WHERE id = ?1",
                params![folder_id],
                |row| row.get(0),
            )
            .optional()?
            .ok_or_else(|| LibraryError::NotFound(format!("watched folder {folder_id}")))?;
        let folder = canonicalize_directory(&folder_path)?;
        let candidates = self.collect_candidates(&folder);
        let timestamp = now_ms();
        let tx = self.conn.transaction()?;

        tx.execute(
            "UPDATE tracks SET available = 0, last_seen_ms = ?1 WHERE watched_folder_id = ?2",
            params![timestamp, folder_id],
        )?;

        for candidate in &candidates.items {
            Self::reconcile_track(&tx, folder_id, candidate, timestamp)?;
        }

        cleanup_orphans(&tx)?;
        tx.execute(
            "UPDATE watched_folders SET last_scanned_at = ?1 WHERE id = ?2",
            params![timestamp, folder_id],
        )?;
        let unavailable_count: i64 = tx.query_row(
            "SELECT COUNT(*) FROM tracks WHERE watched_folder_id = ?1 AND available = 0",
            params![folder_id],
            |row| row.get(0),
        )?;
        tx.commit()?;

        Ok(ScanSummaryDto {
            folder_id: folder_id.to_owned(),
            files_seen: candidates.items.len(),
            tracks_indexed: candidates.items.len(),
            unavailable_count: unavailable_count as usize,
            metadata_errors: candidates.metadata_errors,
        })
    }

    pub fn remove_watched_folder(&mut self, folder_id: &str) -> LibraryResult<bool> {
        let path: Option<String> = self
            .conn
            .query_row(
                "SELECT path FROM watched_folders WHERE id = ?1",
                params![folder_id],
                |row| row.get(0),
            )
            .optional()?;
        let Some(path) = path else {
            return Ok(false);
        };
        let tx = self.conn.transaction()?;
        tx.execute(
            "DELETE FROM watched_folders WHERE id = ?1",
            params![folder_id],
        )?;
        cleanup_orphans(&tx)?;
        tx.commit()?;
        Ok(!path.is_empty())
    }

    pub fn get_library(&self) -> LibraryResult<NormalizedLibraryDto> {
        let artists = self.load_artists()?;
        let albums = self.load_albums()?;
        let tracks = self.load_tracks()?;
        let recent_track_ids = self.get_recent_track_ids()?;
        Ok(NormalizedLibraryDto {
            tracks,
            albums,
            artists,
            recent_track_ids,
        })
    }

    pub fn search(&self, raw_query: &str) -> LibraryResult<SearchResultsDto> {
        let query = normalize_text(raw_query);
        if query.is_empty() {
            return Ok(SearchResultsDto {
                track_ids: Vec::new(),
                album_ids: Vec::new(),
                artist_ids: Vec::new(),
            });
        }
        let pattern = format!("%{}%", escape_like(&query));
        let mut track_statement = self.conn.prepare(
            "SELECT DISTINCT t.id
             FROM tracks t
             LEFT JOIN albums a ON a.id = t.album_id
             WHERE t.normalized_title LIKE ?1 ESCAPE '\\'
                OR COALESCE(a.normalized_title, '') LIKE ?1 ESCAPE '\\'
                OR EXISTS (
                    SELECT 1 FROM track_artists ta
                    JOIN artists ar ON ar.id = ta.artist_id
                    WHERE ta.track_id = t.id AND ar.normalized_name LIKE ?1 ESCAPE '\\'
                )
             ORDER BY t.normalized_title, t.source_path",
        )?;
        let track_ids = track_statement
            .query_map(params![pattern], |row| row.get(0))?
            .collect::<Result<Vec<String>, _>>()?;

        let mut album_statement = self.conn.prepare(
            "SELECT DISTINCT a.id
             FROM albums a
             LEFT JOIN album_artists aa ON aa.album_id = a.id
             LEFT JOIN artists ar ON ar.id = aa.artist_id
             WHERE a.normalized_title LIKE ?1 ESCAPE '\\'
                OR COALESCE(ar.normalized_name, '') LIKE ?1 ESCAPE '\\'
             ORDER BY a.normalized_title",
        )?;
        let album_ids = album_statement
            .query_map(params![pattern], |row| row.get(0))?
            .collect::<Result<Vec<String>, _>>()?;

        let mut artist_statement = self.conn.prepare(
            "SELECT id FROM artists WHERE normalized_name LIKE ?1 ESCAPE '\\' ORDER BY normalized_name",
        )?;
        let artist_ids = artist_statement
            .query_map(params![pattern], |row| row.get(0))?
            .collect::<Result<Vec<String>, _>>()?;

        Ok(SearchResultsDto {
            track_ids,
            album_ids,
            artist_ids,
        })
    }

    pub fn get_settings(&self) -> LibraryResult<SettingsDto> {
        let mut settings = SettingsDto::default();
        let mut statement = self.conn.prepare("SELECT key, value FROM settings")?;
        let rows = statement.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        for row in rows {
            let (key, value) = row?;
            match key.as_str() {
                "volume" => settings.volume = value.parse::<f32>().unwrap_or(settings.volume),
                "muted" => settings.muted = value == "1" || value.eq_ignore_ascii_case("true"),
                "theme" if !value.trim().is_empty() => settings.theme = value,
                _ => {}
            }
        }
        settings.volume = settings.volume.clamp(0.0, 1.0);
        Ok(settings)
    }

    pub fn save_settings(&mut self, settings: &SettingsDto) -> LibraryResult<SettingsDto> {
        let normalized = SettingsDto {
            volume: settings.volume.clamp(0.0, 1.0),
            muted: settings.muted,
            theme: if settings.theme.trim().is_empty() {
                "nocturne".to_owned()
            } else {
                settings.theme.trim().chars().take(40).collect()
            },
        };
        let tx = self.conn.transaction()?;
        tx.execute(
            "INSERT INTO settings (key, value) VALUES ('volume', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![normalized.volume.to_string()],
        )?;
        tx.execute(
            "INSERT INTO settings (key, value) VALUES ('muted', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![if normalized.muted { "1" } else { "0" }],
        )?;
        tx.execute(
            "INSERT INTO settings (key, value) VALUES ('theme', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![normalized.theme],
        )?;
        tx.commit()?;
        Ok(normalized)
    }

    pub fn get_playback_state(&self) -> LibraryResult<PlaybackStateDto> {
        Ok(self.conn.query_row(
            "SELECT current_track_id, position_ms, queue_index, shuffle, repeat_mode FROM playback_state WHERE id = 1",
            [],
            |row| {
                Ok(PlaybackStateDto {
                    current_track_id: row.get(0)?,
                    position_ms: row.get(1)?,
                    queue_index: row.get::<_, i64>(2)?.max(0) as usize,
                    shuffle: row.get::<_, i64>(3)? != 0,
                    repeat_mode: row.get(4)?,
                })
            },
        )?)
    }

    pub fn save_playback_state(
        &mut self,
        state: &PlaybackStateDto,
    ) -> LibraryResult<PlaybackStateDto> {
        let repeat_mode = match state.repeat_mode.as_str() {
            "off" | "all" | "one" => state.repeat_mode.clone(),
            _ => "off".to_owned(),
        };
        if let Some(track_id) = &state.current_track_id {
            let exists: bool = self.conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM tracks WHERE id = ?1)",
                params![track_id],
                |row| row.get(0),
            )?;
            if !exists {
                return Err(LibraryError::InvalidInput(
                    "current track is not in the library".to_owned(),
                ));
            }
        }
        let normalized = PlaybackStateDto {
            current_track_id: state.current_track_id.clone(),
            position_ms: state.position_ms.max(0),
            queue_index: state.queue_index,
            shuffle: state.shuffle,
            repeat_mode,
        };
        self.conn.execute(
            "INSERT INTO playback_state (id, current_track_id, position_ms, queue_index, shuffle, repeat_mode, updated_at)
             VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET
               current_track_id = excluded.current_track_id,
               position_ms = excluded.position_ms,
               queue_index = excluded.queue_index,
               shuffle = excluded.shuffle,
               repeat_mode = excluded.repeat_mode,
               updated_at = excluded.updated_at",
            params![
                normalized.current_track_id,
                normalized.position_ms,
                normalized.queue_index as i64,
                if normalized.shuffle { 1 } else { 0 },
                normalized.repeat_mode,
                now_ms()
            ],
        )?;
        Ok(normalized)
    }

    pub fn get_queue(&self) -> LibraryResult<Vec<QueueItemDto>> {
        let mut statement = self
            .conn
            .prepare("SELECT queue_id, track_id, added_at, source FROM queue ORDER BY position")?;
        let items = statement
            .query_map([], |row| {
                Ok(QueueItemDto {
                    id: row.get(0)?,
                    track_id: row.get(1)?,
                    added_at: row.get(2)?,
                    source: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(items)
    }

    pub fn save_queue(&mut self, items: &[QueueItemDto]) -> LibraryResult<Vec<QueueItemDto>> {
        let tx = self.conn.transaction()?;
        tx.execute("DELETE FROM queue", [])?;
        for (position, item) in items.iter().enumerate() {
            if item.id.trim().is_empty() || item.track_id.trim().is_empty() {
                return Err(LibraryError::InvalidInput(
                    "queue item ids cannot be empty".to_owned(),
                ));
            }
            let exists: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM tracks WHERE id = ?1)",
                params![item.track_id],
                |row| row.get(0),
            )?;
            if !exists {
                return Err(LibraryError::InvalidInput(format!(
                    "queue track {} is not in the library",
                    item.track_id
                )));
            }
            tx.execute(
                "INSERT INTO queue (position, queue_id, track_id, source, added_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![position as i64, item.id, item.track_id, normalize_queue_source(&item.source), item.added_at.max(0)],
            )?;
        }
        tx.commit()?;
        self.get_queue()
    }

    pub fn record_recent_play(&mut self, track_id: &str, position_ms: i64) -> LibraryResult<()> {
        let exists: bool = self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM tracks WHERE id = ?1)",
            params![track_id],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(LibraryError::NotFound(format!("track {track_id}")));
        }
        self.conn.execute(
            "INSERT INTO recent_plays (track_id, played_at, position_ms) VALUES (?1, ?2, ?3)",
            params![track_id, now_ms(), position_ms.max(0)],
        )?;
        self.conn.execute(
            "DELETE FROM recent_plays WHERE id NOT IN (SELECT id FROM recent_plays ORDER BY played_at DESC LIMIT 100)",
            [],
        )?;
        Ok(())
    }

    #[cfg(test)]
    pub fn schema_version(&self) -> LibraryResult<i64> {
        Ok(self.conn.query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )?)
    }

    fn collect_candidates(&self, folder: &Path) -> CandidateCollection {
        let mut items = Vec::new();
        let mut metadata_errors = 0;
        for entry in WalkDir::new(folder)
            .follow_links(false)
            .into_iter()
            .filter_map(Result::ok)
        {
            if !entry.file_type().is_file() || !is_supported_extension(entry.path()) {
                continue;
            }
            let Ok(path) = fs::canonicalize(entry.path()) else {
                continue;
            };
            if !path.starts_with(folder) {
                continue;
            }
            let Ok(metadata) = fs::metadata(&path) else {
                continue;
            };
            let (raw_metadata, metadata_failed) =
                match read_audio_metadata(&path, &self.artwork_dir) {
                    Ok(metadata) => (metadata, false),
                    Err(_) => (RawMetadata::from_path(&path), true),
                };
            if metadata_failed {
                metadata_errors += 1;
            }
            let modified_ms = metadata
                .modified()
                .ok()
                .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_millis() as i64)
                .unwrap_or_default();
            items.push(IndexedTrack {
                source_path: path.to_string_lossy().into_owned(),
                extension: path
                    .extension()
                    .and_then(|extension| extension.to_str())
                    .unwrap_or_default()
                    .to_ascii_lowercase(),
                byte_length: metadata.len() as i64,
                modified_ms,
                metadata: raw_metadata,
            });
        }
        CandidateCollection {
            items,
            metadata_errors,
        }
    }

    fn reconcile_track(
        tx: &Transaction<'_>,
        folder_id: &str,
        candidate: &IndexedTrack,
        timestamp: i64,
    ) -> LibraryResult<()> {
        let artist_names = if candidate.metadata.artists.is_empty() {
            vec!["Unknown artist".to_owned()]
        } else {
            candidate.metadata.artists.clone()
        };
        let artist_ids = artist_names
            .iter()
            .map(|name| upsert_artist(tx, name))
            .collect::<LibraryResult<Vec<_>>>()?;
        let album_artist_name = candidate
            .metadata
            .album_artist
            .clone()
            .unwrap_or_else(|| artist_names[0].clone());
        let album_artist_id = upsert_artist(tx, &album_artist_name)?;
        let album_id = candidate.metadata.album.as_ref().and_then(|album| {
            if album.is_empty() {
                None
            } else {
                Some(stable_id(
                    "album",
                    &format!("{}\0{}", normalize_text(album), album_artist_id),
                ))
            }
        });

        if let Some(album_id) = &album_id {
            tx.execute(
                "INSERT INTO albums (id, title, normalized_title, year, artwork_ref)
                 VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(id) DO UPDATE SET
                   title = excluded.title,
                   normalized_title = excluded.normalized_title,
                   year = excluded.year,
                   artwork_ref = COALESCE(excluded.artwork_ref, albums.artwork_ref)",
                params![
                    album_id,
                    candidate.metadata.album.as_deref().unwrap_or_default(),
                    normalize_text(candidate.metadata.album.as_deref().unwrap_or_default()),
                    candidate.metadata.year,
                    candidate.metadata.artwork_ref.as_deref(),
                ],
            )?;
            tx.execute(
                "DELETE FROM album_artists WHERE album_id = ?1",
                params![album_id],
            )?;
            tx.execute(
                "INSERT OR IGNORE INTO album_artists (album_id, artist_id, position) VALUES (?1, ?2, 0)",
                params![album_id, album_artist_id],
            )?;
        }

        let track_id = stable_id("track", &candidate.source_path);
        tx.execute(
            "INSERT INTO tracks (
                id, watched_folder_id, album_id, album_artist_id, title, normalized_title,
                track_number, disc_number, year, genre, duration_ms, source_path, extension,
                byte_length, modified_ms, artwork_ref, available, last_seen_ms
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, 1, ?17)
             ON CONFLICT(id) DO UPDATE SET
                watched_folder_id = excluded.watched_folder_id,
                album_id = excluded.album_id,
                album_artist_id = excluded.album_artist_id,
                title = excluded.title,
                normalized_title = excluded.normalized_title,
                track_number = excluded.track_number,
                disc_number = excluded.disc_number,
                year = excluded.year,
                genre = excluded.genre,
                duration_ms = excluded.duration_ms,
                extension = excluded.extension,
                byte_length = excluded.byte_length,
                modified_ms = excluded.modified_ms,
                artwork_ref = COALESCE(excluded.artwork_ref, tracks.artwork_ref),
                available = 1,
                last_seen_ms = excluded.last_seen_ms",
            params![
                track_id,
                folder_id,
                album_id,
                album_artist_id,
                &candidate.metadata.title,
                normalize_text(&candidate.metadata.title),
                candidate.metadata.track_number,
                candidate.metadata.disc_number,
                candidate.metadata.year,
                candidate.metadata.genre.as_deref(),
                candidate.metadata.duration_ms,
                &candidate.source_path,
                &candidate.extension,
                candidate.byte_length,
                candidate.modified_ms,
                candidate.metadata.artwork_ref.as_deref(),
                timestamp,
            ],
        )?;
        tx.execute(
            "DELETE FROM track_artists WHERE track_id = ?1",
            params![track_id],
        )?;
        for (position, artist_id) in artist_ids.iter().enumerate() {
            tx.execute(
                "INSERT INTO track_artists (track_id, artist_id, position) VALUES (?1, ?2, ?3)",
                params![track_id, artist_id, position as i64],
            )?;
        }
        Ok(())
    }

    fn load_artists(&self) -> LibraryResult<Vec<ArtistDto>> {
        let mut statement = self
            .conn
            .prepare("SELECT id, name FROM artists ORDER BY normalized_name, id")?;
        let artists = statement
            .query_map([], |row| {
                Ok(ArtistDto {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    artwork_path: None,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(artists)
    }

    fn load_albums(&self) -> LibraryResult<Vec<AlbumDto>> {
        let mut artists_by_album: HashMap<String, Vec<String>> = HashMap::new();
        let mut artist_statement = self
            .conn
            .prepare("SELECT album_id, artist_id FROM album_artists ORDER BY album_id, position")?;
        for row in artist_statement.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })? {
            let (album_id, artist_id) = row?;
            artists_by_album
                .entry(album_id)
                .or_default()
                .push(artist_id);
        }

        let mut statement = self.conn.prepare(
            "SELECT id, title, year, artwork_ref FROM albums ORDER BY normalized_title, id",
        )?;
        let albums = statement
            .query_map([], |row| {
                let id: String = row.get(0)?;
                let artwork_ref: Option<String> = row.get(3)?;
                Ok(AlbumDto {
                    artist_ids: artists_by_album.get(&id).cloned().unwrap_or_default(),
                    id,
                    title: row.get(1)?,
                    year: row.get(2)?,
                    artwork_path: artwork_ref.and_then(|value| self.resolve_artwork_ref(&value)),
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(albums)
    }

    fn load_tracks(&self) -> LibraryResult<Vec<TrackDto>> {
        let mut artists_by_track: HashMap<String, Vec<String>> = HashMap::new();
        let mut artist_statement = self
            .conn
            .prepare("SELECT track_id, artist_id FROM track_artists ORDER BY track_id, position")?;
        for row in artist_statement.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })? {
            let (track_id, artist_id) = row?;
            artists_by_track
                .entry(track_id)
                .or_default()
                .push(artist_id);
        }

        let mut statement = self.conn.prepare(
            "SELECT t.id, t.title, t.album_id, t.duration_ms, t.track_number, t.disc_number, t.year,
                    t.genre, t.artwork_ref, t.source_path, t.extension, t.byte_length, t.available, f.path
             FROM tracks t
             JOIN watched_folders f ON f.id = t.watched_folder_id
             ORDER BY normalized_title, disc_number, track_number, source_path",
        )?;
        let tracks = statement
            .query_map([], |row| {
                let id: String = row.get(0)?;
                let database_available: bool = row.get::<_, i64>(12)? != 0;
                let artwork_ref: Option<String> = row.get(8)?;
                let source_path: String = row.get(9)?;
                let folder_path: String = row.get(13)?;
                let available = database_available
                    && fs::canonicalize(&source_path)
                        .ok()
                        .zip(fs::canonicalize(&folder_path).ok())
                        .map(|(source, folder)| source.is_file() && source.starts_with(folder))
                        .unwrap_or(false);
                Ok(TrackDto {
                    artist_ids: artists_by_track.get(&id).cloned().unwrap_or_default(),
                    id,
                    title: row.get(1)?,
                    album_id: row.get(2)?,
                    duration_ms: row.get(3)?,
                    track_number: row.get(4)?,
                    disc_number: row.get(5)?,
                    year: row.get(6)?,
                    genre: row.get(7)?,
                    artwork_path: artwork_ref.and_then(|value| self.resolve_artwork_ref(&value)),
                    source_path: if available {
                        fs::canonicalize(&source_path)
                            .ok()
                            .map(|path| path.to_string_lossy().into_owned())
                    } else {
                        None
                    },
                    format: row.get(10)?,
                    byte_length: row.get(11)?,
                    available,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(tracks)
    }

    fn get_recent_track_ids(&self) -> LibraryResult<Vec<String>> {
        let mut statement = self.conn.prepare(
            "SELECT track_id FROM recent_plays GROUP BY track_id ORDER BY MAX(played_at) DESC LIMIT 20",
        )?;
        let ids = statement
            .query_map([], |row| row.get(0))?
            .collect::<Result<Vec<String>, _>>()?;
        Ok(ids)
    }

    fn resolve_artwork_ref(&self, reference: &str) -> Option<String> {
        if Path::new(reference).components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        }) {
            return None;
        }
        let path = self.data_dir.join(reference);
        let canonical_artwork_dir = fs::canonicalize(&self.artwork_dir).ok()?;
        let canonical_path = fs::canonicalize(path).ok()?;
        canonical_path
            .starts_with(canonical_artwork_dir)
            .then(|| canonical_path.to_string_lossy().into_owned())
            .filter(|path| Path::new(path).is_file())
    }
}

struct CandidateCollection {
    items: Vec<IndexedTrack>,
    metadata_errors: usize,
}

struct IndexedTrack {
    source_path: String,
    extension: String,
    byte_length: i64,
    modified_ms: i64,
    metadata: RawMetadata,
}

#[derive(Clone, Debug)]
struct RawMetadata {
    title: String,
    artists: Vec<String>,
    album: Option<String>,
    album_artist: Option<String>,
    track_number: Option<i64>,
    disc_number: Option<i64>,
    year: Option<i64>,
    genre: Option<String>,
    duration_ms: i64,
    artwork_ref: Option<String>,
}

impl RawMetadata {
    fn from_path(path: &Path) -> Self {
        let title = path
            .file_stem()
            .and_then(|value| value.to_str())
            .map(normalize_display)
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "Untitled".to_owned());
        Self {
            title,
            artists: vec!["Unknown artist".to_owned()],
            album: None,
            album_artist: None,
            track_number: None,
            disc_number: None,
            year: None,
            genre: None,
            duration_ms: 0,
            artwork_ref: None,
        }
    }
}

fn read_audio_metadata(path: &Path, artwork_dir: &Path) -> LibraryResult<RawMetadata> {
    let tagged_file =
        lofty::read_from_path(path).map_err(|error| LibraryError::Metadata(error.to_string()))?;
    let properties = tagged_file.properties();
    let tag = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag());
    let fallback = RawMetadata::from_path(path);
    let Some(tag) = tag else {
        return Ok(RawMetadata {
            duration_ms: properties.duration().as_millis() as i64,
            ..fallback
        });
    };

    let title = tag
        .title()
        .map(|value| normalize_display(&value))
        .filter(|value| !value.is_empty())
        .unwrap_or(fallback.title);
    let artist_credit = tag
        .get_string(&ItemKey::TrackArtist)
        .map(ToOwned::to_owned)
        .or_else(|| tag.artist().map(|value| value.into_owned()));
    let artists = artist_credit
        .as_deref()
        .map(parse_artist_credit)
        .unwrap_or_else(|| vec!["Unknown artist".to_owned()]);
    let album = tag
        .album()
        .map(|value| normalize_display(&value))
        .filter(|value| !value.is_empty());
    let album_artist = tag
        .get_string(&ItemKey::AlbumArtist)
        .map(normalize_display)
        .filter(|value| !value.is_empty());
    let genre = tag
        .genre()
        .map(|value| normalize_display(&value))
        .filter(|value| !value.is_empty());
    let artwork_ref = match tag.pictures().first() {
        Some(picture) => save_artwork(picture, artwork_dir).transpose()?,
        None => None,
    };

    Ok(RawMetadata {
        title,
        artists,
        album,
        album_artist,
        track_number: tag
            .track()
            .map(i64::from)
            .or_else(|| parse_tag_number(tag, ItemKey::TrackNumber)),
        disc_number: tag
            .disk()
            .map(i64::from)
            .or_else(|| parse_tag_number(tag, ItemKey::DiscNumber)),
        year: tag.year().map(i64::from),
        genre,
        duration_ms: properties.duration().as_millis() as i64,
        artwork_ref,
    })
}

fn parse_tag_number(tag: &lofty::tag::Tag, key: ItemKey) -> Option<i64> {
    tag.get_string(&key)
        .and_then(|value| value.split('/').next()?.trim().parse().ok())
}

fn save_artwork(
    picture: &lofty::picture::Picture,
    artwork_dir: &Path,
) -> Option<LibraryResult<String>> {
    let bytes = picture.data();
    if bytes.is_empty() || bytes.len() > MAX_ARTWORK_BYTES || !valid_image_signature(bytes) {
        return None;
    }
    let extension = image_extension(picture.mime_type().map(|mime| mime.as_str()), bytes)?;
    let digest = Sha256::digest(bytes);
    let filename = format!("{}.{}", hex_digest(&digest), extension);
    let target = artwork_dir.join(&filename);
    if !target.exists() {
        if let Err(error) = fs::write(&target, bytes) {
            return Some(Err(error.into()));
        }
    }
    Some(Ok(format!("artwork/{filename}")))
}

fn image_extension(mime: Option<&str>, bytes: &[u8]) -> Option<&'static str> {
    match mime {
        Some("image/jpeg") | Some("image/jpg") if bytes.starts_with(&[0xff, 0xd8, 0xff]) => {
            Some("jpg")
        }
        Some("image/png") if bytes.starts_with(b"\x89PNG\r\n\x1a\n") => Some("png"),
        Some("image/gif") if bytes.starts_with(b"GIF8") => Some("gif"),
        Some("image/webp") if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") => {
            Some("webp")
        }
        _ if bytes.starts_with(&[0xff, 0xd8, 0xff]) => Some("jpg"),
        _ if bytes.starts_with(b"\x89PNG\r\n\x1a\n") => Some("png"),
        _ if bytes.starts_with(b"GIF8") => Some("gif"),
        _ if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") => Some("webp"),
        _ => None,
    }
}

fn valid_image_signature(bytes: &[u8]) -> bool {
    image_extension(None, bytes).is_some()
}

fn cleanup_orphans(tx: &Transaction<'_>) -> LibraryResult<()> {
    tx.execute(
        "DELETE FROM albums WHERE id NOT IN (SELECT album_id FROM tracks WHERE album_id IS NOT NULL)",
        [],
    )?;
    tx.execute(
        "DELETE FROM artists WHERE id NOT IN (SELECT artist_id FROM track_artists UNION SELECT artist_id FROM album_artists)",
        [],
    )?;
    Ok(())
}

fn upsert_artist(tx: &Transaction<'_>, name: &str) -> LibraryResult<String> {
    let display_name = normalize_display(name);
    let normalized_name = normalize_text(&display_name);
    let id = stable_id("artist", &normalized_name);
    tx.execute(
        "INSERT INTO artists (id, name, normalized_name) VALUES (?1, ?2, ?3)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, normalized_name = excluded.normalized_name",
        params![id, display_name, normalized_name],
    )?;
    Ok(id)
}

fn parse_artist_credit(value: &str) -> Vec<String> {
    let mut seen = HashSet::new();
    value
        .split(';')
        .map(normalize_display)
        .filter(|name| !name.is_empty())
        .filter(|name| seen.insert(normalize_text(name)))
        .collect()
}

fn normalize_display(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn normalize_text(value: &str) -> String {
    normalize_display(value).to_lowercase()
}

fn normalize_queue_source(value: &str) -> String {
    match value {
        "recommendation" | "playlist" => value.to_owned(),
        _ => "user".to_owned(),
    }
}

fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

fn canonicalize_directory(raw_path: &str) -> LibraryResult<PathBuf> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() || trimmed.len() > 32_000 {
        return Err(LibraryError::InvalidPath(
            "folder path is empty or too long".to_owned(),
        ));
    }
    let path = Path::new(trimmed);
    let canonical = fs::canonicalize(path)
        .map_err(|error| LibraryError::InvalidPath(format!("{trimmed}: {error}")))?;
    if !canonical.is_dir() {
        return Err(LibraryError::InvalidPath(
            "watched path is not a directory".to_owned(),
        ));
    }
    Ok(canonical)
}

fn is_supported_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            SUPPORTED_EXTENSIONS
                .iter()
                .any(|supported| extension.eq_ignore_ascii_case(supported))
        })
        .unwrap_or(false)
}

fn stable_id(prefix: &str, value: &str) -> String {
    let digest = Sha256::digest(format!("{prefix}\0{value}").as_bytes());
    format!("{prefix}_{}", hex_digest(&digest)[..32].to_owned())
}

fn hex_digest(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::STANDARD, Engine};

    fn temp_root(label: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("cadmium-{label}-{}", now_ms()));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn copy_fixture_tone(path: &Path) {
        let encoded = include_str!("../tests/fixtures/tone.wav.b64");
        let bytes = STANDARD.decode(encoded.trim()).unwrap();
        fs::write(path, bytes).unwrap();
    }

    #[test]
    fn migrations_create_the_persistent_schema() {
        let root = temp_root("migrations");
        let repository = LibraryRepository::open_in_memory(&root).unwrap();
        assert_eq!(repository.schema_version().unwrap(), 2);
        let tables: i64 = repository
            .conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('watched_folders', 'artists', 'albums', 'tracks', 'recent_plays', 'settings', 'queue', 'playback_state')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(tables, 8);
    }

    #[test]
    fn scan_search_and_missing_file_reconciliation_are_transactional() {
        let root = temp_root("scan");
        let music = root.join("music");
        fs::create_dir_all(&music).unwrap();
        copy_fixture_tone(&music.join("Signal.wav"));
        let mut repository = LibraryRepository::open_in_memory(&root).unwrap();
        let summary = repository
            .add_watched_folder(music.to_str().unwrap())
            .unwrap();
        assert_eq!(summary.tracks_indexed, 1);
        let library = repository.get_library().unwrap();
        assert_eq!(library.tracks.len(), 1);
        assert_eq!(library.tracks[0].title, "Signal");
        assert!(repository.search("signal").unwrap().track_ids.len() == 1);

        fs::remove_file(music.join("Signal.wav")).unwrap();
        let rescanned = repository
            .rescan_watched_folder(&summary.folder_id)
            .unwrap();
        assert_eq!(rescanned.unavailable_count, 1);
        assert!(!repository.get_library().unwrap().tracks[0].available);
    }

    #[test]
    fn input_normalization_and_path_validation_are_narrow() {
        assert_eq!(normalize_text("  The   Signal  "), "the signal");
        assert_eq!(parse_artist_credit("One; Two; One"), vec!["One", "Two"]);
        assert!(canonicalize_directory("").is_err());
    }
}
