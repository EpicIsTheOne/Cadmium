use crate::library::{
    DiscoveryDto, GeneratedPlaylistDto, LibraryRepository, NormalizedLibraryDto, PlaybackStateDto,
    QueueItemDto, RadioSessionDto, RhythmProfileDto, ScanSummaryDto, SearchResultsDto, SettingsDto,
    WatchedFolderDto,
};
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

pub struct AppState {
    pub repository: Mutex<LibraryRepository>,
}

impl AppState {
    pub fn new(data_dir: &Path) -> Result<Self, String> {
        Ok(Self {
            repository: Mutex::new(
                LibraryRepository::open(data_dir).map_err(|error| error.to_string())?,
            ),
        })
    }
}

fn lock_repository<'a>(
    state: &'a State<'a, AppState>,
) -> Result<std::sync::MutexGuard<'a, LibraryRepository>, String> {
    state
        .repository
        .lock()
        .map_err(|_| "library repository lock is poisoned".to_owned())
}

fn allow_library_assets(app: &AppHandle, library: &NormalizedLibraryDto) -> Result<(), String> {
    let scope = app.asset_protocol_scope();
    for track in &library.tracks {
        if let Some(path) = &track.source_path {
            if let Ok(path) = std::fs::canonicalize(path) {
                scope
                    .allow_file(path)
                    .map_err(|error| format!("could not scope track asset: {error}"))?;
            }
        }
        if let Some(path) = &track.artwork_path {
            if let Ok(path) = std::fs::canonicalize(path) {
                scope
                    .allow_file(path)
                    .map_err(|error| format!("could not scope artwork asset: {error}"))?;
            }
        }
    }
    for album in &library.albums {
        if let Some(path) = &album.artwork_path {
            if let Ok(path) = std::fs::canonicalize(path) {
                scope
                    .allow_file(path)
                    .map_err(|error| format!("could not scope album artwork asset: {error}"))?;
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn select_watched_folder(app: AppHandle) -> Result<Option<String>, String> {
    let selected = app
        .dialog()
        .file()
        .set_title("Choose a music folder")
        .blocking_pick_folder();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|error| format!("selected path is not local: {error}"))?;
    let canonical = std::fs::canonicalize(&path)
        .map_err(|error| format!("selected folder is unavailable: {error}"))?;
    if !canonical.is_dir() {
        return Err("selected path is not a folder".to_owned());
    }
    Ok(Some(canonical.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn list_watched_folders(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<WatchedFolderDto>, String> {
    let folders = lock_repository(&state)?
        .list_watched_folders()
        .map_err(|error| error.to_string())?;
    let scope = app.asset_protocol_scope();
    for folder in &folders {
        if let Ok(path) = std::fs::canonicalize(&folder.path) {
            if !path.is_dir() {
                continue;
            }
            scope
                .allow_directory(&path, true)
                .map_err(|error| format!("could not scope watched folder: {error}"))?;
        }
    }
    Ok(folders)
}

#[tauri::command]
pub fn add_watched_folder(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<ScanSummaryDto, String> {
    let mut repository = lock_repository(&state)?;
    let summary = repository
        .add_watched_folder(&path)
        .map_err(|error| error.to_string())?;
    let folder = repository
        .list_watched_folders()
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|folder| folder.id == summary.folder_id)
        .ok_or_else(|| "watched folder disappeared after add".to_owned())?;
    let canonical_folder = std::fs::canonicalize(&folder.path)
        .map_err(|error| format!("watched folder disappeared: {error}"))?;
    app.asset_protocol_scope()
        .allow_directory(canonical_folder, true)
        .map_err(|error| format!("could not scope watched folder: {error}"))?;
    let library = repository
        .get_library()
        .map_err(|error| error.to_string())?;
    allow_library_assets(&app, &library)?;
    Ok(summary)
}

#[tauri::command]
pub fn rescan_watched_folder(
    app: AppHandle,
    state: State<'_, AppState>,
    folder_id: String,
) -> Result<ScanSummaryDto, String> {
    let mut repository = lock_repository(&state)?;
    let summary = repository
        .rescan_watched_folder(folder_id.trim())
        .map_err(|error| error.to_string())?;
    let folder = repository
        .list_watched_folders()
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|folder| folder.id == summary.folder_id)
        .ok_or_else(|| "watched folder disappeared after rescan".to_owned())?;
    let canonical_folder = std::fs::canonicalize(&folder.path)
        .map_err(|error| format!("watched folder disappeared: {error}"))?;
    app.asset_protocol_scope()
        .allow_directory(canonical_folder, true)
        .map_err(|error| format!("could not scope watched folder: {error}"))?;
    let library = repository
        .get_library()
        .map_err(|error| error.to_string())?;
    allow_library_assets(&app, &library)?;
    Ok(summary)
}

#[tauri::command]
pub fn remove_watched_folder(
    app: AppHandle,
    state: State<'_, AppState>,
    folder_id: String,
) -> Result<bool, String> {
    let mut repository = lock_repository(&state)?;
    let path = repository
        .list_watched_folders()
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|folder| folder.id == folder_id.trim())
        .map(|folder| folder.path);
    let assets_to_forbid = if path.is_some() {
        repository
            .get_library()
            .map_err(|error| error.to_string())?
            .tracks
            .into_iter()
            .filter_map(|track| track.source_path)
            .filter(|track_path| {
                path.as_ref()
                    .map(|folder_path| Path::new(track_path).starts_with(folder_path))
                    .unwrap_or(false)
            })
            .collect::<Vec<_>>()
    } else {
        Vec::new()
    };
    let removed = repository
        .remove_watched_folder(folder_id.trim())
        .map_err(|error| error.to_string())?;
    if removed {
        let scope = app.asset_protocol_scope();
        if let Some(path) = path {
            let _ = scope.forbid_directory(path, true);
        }
        for asset in assets_to_forbid {
            let _ = scope.forbid_file(asset);
        }
    }
    Ok(removed)
}

#[tauri::command]
pub fn get_library(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<NormalizedLibraryDto, String> {
    let library = lock_repository(&state)?
        .get_library()
        .map_err(|error| error.to_string())?;
    allow_library_assets(&app, &library)?;
    Ok(library)
}

#[tauri::command]
pub fn search_library(
    state: State<'_, AppState>,
    query: String,
) -> Result<SearchResultsDto, String> {
    lock_repository(&state)?
        .search(&query)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<SettingsDto, String> {
    lock_repository(&state)?
        .get_settings()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_settings(
    state: State<'_, AppState>,
    settings: SettingsDto,
) -> Result<SettingsDto, String> {
    lock_repository(&state)?
        .save_settings(&settings)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_playback_state(state: State<'_, AppState>) -> Result<PlaybackStateDto, String> {
    lock_repository(&state)?
        .get_playback_state()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_playback_state(
    state: State<'_, AppState>,
    playback_state: PlaybackStateDto,
) -> Result<PlaybackStateDto, String> {
    lock_repository(&state)?
        .save_playback_state(&playback_state)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_queue(state: State<'_, AppState>) -> Result<Vec<QueueItemDto>, String> {
    lock_repository(&state)?
        .get_queue()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_queue(
    state: State<'_, AppState>,
    items: Vec<QueueItemDto>,
) -> Result<Vec<QueueItemDto>, String> {
    lock_repository(&state)?
        .save_queue(&items)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_favorite_track_ids(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    lock_repository(&state)?
        .get_favorite_track_ids()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_track_favorite(
    state: State<'_, AppState>,
    track_id: String,
    favorite: bool,
) -> Result<bool, String> {
    lock_repository(&state)?
        .set_track_favorite(&track_id, favorite)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn record_recent_play(
    state: State<'_, AppState>,
    track_id: String,
    position_ms: i64,
) -> Result<(), String> {
    lock_repository(&state)?
        .record_recent_play(track_id.trim(), position_ms)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_discovery(state: State<'_, AppState>) -> Result<DiscoveryDto, String> {
    lock_repository(&state)?
        .get_discovery()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn generate_ai_playlist(
    state: State<'_, AppState>,
    prompt: String,
) -> Result<GeneratedPlaylistDto, String> {
    lock_repository(&state)?
        .generate_playlist(&prompt)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn start_radio(
    state: State<'_, AppState>,
    seed_track_id: String,
) -> Result<RadioSessionDto, String> {
    lock_repository(&state)?
        .start_radio(seed_track_id.trim())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn analyze_rhythm(
    state: State<'_, AppState>,
    track_id: String,
) -> Result<RhythmProfileDto, String> {
    lock_repository(&state)?
        .analyze_rhythm(track_id.trim())
        .map_err(|error| error.to_string())
}
