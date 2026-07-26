use crate::ai::{AiCatalogTrack, AiError, AiLoginDto, AiService, AiStatusDto};
use crate::dj::{
    DjQueueSnapshotDto, DjRecoveryDto, DjSetDto, FishService, FishStatusDto, FishVoiceDto,
    NarrationDto,
};
use crate::library::{
    DiscoveryDto, GeneratedPlaylistDto, LibraryRepository, NormalizedLibraryDto, PlaybackStateDto,
    QueueItemDto, RadioSessionDto, RhythmProfileDto, RhythmScanResultDto, ScanSummaryDto, SearchResultsDto, SettingsDto,
    TrackReasonDto, WatchedFolderDto,
};
use crate::whisper::{TranscriptionDto, WhisperService, WhisperStatusDto};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

pub struct AppState {
    pub repository: Arc<Mutex<LibraryRepository>>,
    pub ai: AiService,
    pub fish: FishService,
    pub whisper: Arc<WhisperService>,
}

impl AppState {
    pub fn new(data_dir: &Path) -> Result<Self, String> {
        let repository = LibraryRepository::open(data_dir).map_err(|error| error.to_string())?;
        let cloud_enabled = repository
            .get_ai_cloud_enabled()
            .map_err(|error| error.to_string())?;
        Ok(Self {
            repository: Arc::new(Mutex::new(repository)),
            ai: AiService::new(data_dir, cloud_enabled),
            fish: FishService::new(data_dir),
            whisper: Arc::new(WhisperService::new(data_dir)),
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
    // Desktop-only: the folder picker dialog does not exist on Android (the
    // mobile app ingests via MediaStore instead). Keep the command registered
    // on every target so the invoke handler stays uniform.
    #[cfg(desktop)]
    {
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
    #[cfg(not(desktop))]
    {
        let _ = app;
        Err("folder picking is not available on Android; use MediaStore ingestion".to_owned())
    }
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
pub fn remove_track(
    state: State<'_, AppState>,
    track_id: String,
) -> Result<bool, String> {
    lock_repository(&state)?
        .remove_track(track_id.trim())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_track_album(
    state: State<'_, AppState>,
    track_id: String,
    album_id: String,
) -> Result<bool, String> {
    lock_repository(&state)?
        .set_track_album(track_id.trim(), album_id.trim())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn create_playlist(state: State<'_, AppState>, name: String) -> Result<String, String> {
    lock_repository(&state)?
        .create_playlist(&name)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn rename_playlist(
    state: State<'_, AppState>,
    playlist_id: String,
    name: String,
) -> Result<bool, String> {
    lock_repository(&state)?
        .rename_playlist(playlist_id.trim(), &name)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_playlist(state: State<'_, AppState>, playlist_id: String) -> Result<bool, String> {
    lock_repository(&state)?
        .delete_playlist(playlist_id.trim())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn add_track_to_playlist(
    state: State<'_, AppState>,
    playlist_id: String,
    track_id: String,
) -> Result<bool, String> {
    lock_repository(&state)?
        .add_track_to_playlist(playlist_id.trim(), track_id.trim())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn remove_track_from_playlist(
    state: State<'_, AppState>,
    playlist_id: String,
    track_id: String,
) -> Result<bool, String> {
    lock_repository(&state)?
        .remove_track_from_playlist(playlist_id.trim(), track_id.trim())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn create_album(
    state: State<'_, AppState>,
    title: String,
    artist_id: Option<String>,
) -> Result<String, String> {
    lock_repository(&state)?
        .create_album(&title, artist_id.as_deref())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_playlist(
    state: State<'_, AppState>,
    playlist_id: String,
    name: Option<String>,
    description: Option<String>,
    artwork_ref: Option<String>,
) -> Result<bool, String> {
    lock_repository(&state)?
        .update_playlist(
            playlist_id.trim(),
            name.as_deref().map(|value| value.trim()),
            description.as_deref(),
            artwork_ref.as_deref(),
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_album(
    state: State<'_, AppState>,
    album_id: String,
    title: Option<String>,
    description: Option<String>,
    artwork_ref: Option<String>,
    artist_id: Option<String>,
) -> Result<bool, String> {
    lock_repository(&state)?
        .update_album(
            album_id.trim(),
            title.as_deref().map(|value| value.trim()),
            description.as_deref(),
            artwork_ref.as_deref(),
            artist_id.as_deref(),
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_collection_artwork(state: State<'_, AppState>, data_url: String) -> Result<String, String> {
    lock_repository(&state)?
        .set_collection_artwork(&data_url)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn resolve_artist_by_name(state: State<'_, AppState>, name: String) -> Result<Option<String>, String> {
    lock_repository(&state)?
        .resolve_artist_by_name(&name)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn remove_track_from_album(
    state: State<'_, AppState>,
    track_id: String,
) -> Result<bool, String> {
    lock_repository(&state)?
        .remove_track_from_album(track_id.trim())
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
    let prompt = prompt.trim().to_owned();
    if prompt.is_empty() || prompt.chars().count() > 200 {
        return Err("playlist prompt must contain 1 to 200 characters".to_owned());
    }
    let library = lock_repository(&state)?
        .get_library()
        .map_err(|error| error.to_string())?;
    let artists = library
        .artists
        .iter()
        .map(|artist| (artist.id.clone(), artist.name.clone()))
        .collect::<HashMap<_, _>>();
    let albums = library
        .albums
        .iter()
        .map(|album| (album.id.clone(), album.title.clone()))
        .collect::<HashMap<_, _>>();
    let catalog = library
        .tracks
        .iter()
        .filter(|track| track.available)
        .take(250)
        .map(|track| AiCatalogTrack {
            id: track.id.clone(),
            title: track.title.clone(),
            artist: track
                .artist_ids
                .iter()
                .filter_map(|id| artists.get(id))
                .cloned()
                .collect::<Vec<_>>()
                .join(", "),
            album: track
                .album_id
                .as_ref()
                .and_then(|id| albums.get(id))
                .cloned()
                .unwrap_or_default(),
            genre: track.genre.clone().unwrap_or_default(),
            year: track.year,
            duration_ms: track.duration_ms,
        })
        .collect::<Vec<_>>();
    if catalog.is_empty() {
        return Err("add music before generating a playlist".to_owned());
    }
    match state.ai.generate(&prompt, &catalog) {
        Ok(draft) => {
            let available = catalog
                .iter()
                .map(|track| track.id.clone())
                .collect::<HashSet<_>>();
            let mut seen = HashSet::new();
            let mut track_ids = draft
                .tracks
                .iter()
                .filter(|track| available.contains(&track.id) && seen.insert(track.id.clone()))
                .take(25)
                .map(|track| track.id.clone())
                .collect::<Vec<_>>();
            for track in &catalog {
                if track_ids.len() >= 25 {
                    break;
                }
                if seen.insert(track.id.clone()) {
                    track_ids.push(track.id.clone());
                }
            }
            let reasons = draft
                .tracks
                .iter()
                .filter(|choice| track_ids.contains(&choice.id))
                .map(|choice| TrackReasonDto {
                    track_id: choice.id.clone(),
                    reason: choice.reason.clone(),
                })
                .collect::<Vec<_>>();
            lock_repository(&state)?
                .save_generated_playlist(
                    &prompt,
                    &draft.name,
                    &draft.rationale,
                    &track_ids,
                    &reasons,
                    "codex",
                    (!draft.model.is_empty()).then_some(draft.model.as_str()),
                    None,
                )
                .map_err(|error| error.to_string())
        }
        Err(AiError::Cancelled) => Err("AI playlist generation was cancelled".to_owned()),
        Err(error) => {
            let mut playlist = lock_repository(&state)?
                .generate_playlist(&prompt)
                .map_err(|fallback_error| fallback_error.to_string())?;
            playlist.fallback_reason = Some(error.to_string());
            Ok(playlist)
        }
    }
}

#[tauri::command]
pub fn get_ai_status(state: State<'_, AppState>) -> AiStatusDto {
    state.ai.status()
}

#[tauri::command]
pub fn start_codex_login(state: State<'_, AppState>) -> Result<AiLoginDto, String> {
    state.ai.start_login().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn cancel_codex_login(state: State<'_, AppState>, login_id: String) -> Result<(), String> {
    state
        .ai
        .cancel_login(login_id.trim())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_ai_cloud_enabled(state: State<'_, AppState>, enabled: bool) -> Result<bool, String> {
    let persisted = lock_repository(&state)?
        .set_ai_cloud_enabled(enabled)
        .map_err(|error| error.to_string())?;
    state.ai.set_cloud_enabled(persisted);
    Ok(persisted)
}

#[tauri::command]
pub fn cancel_ai_generation(state: State<'_, AppState>) {
    state.ai.cancel();
}

#[tauri::command]
pub fn delete_generated_playlist(
    state: State<'_, AppState>,
    playlist_id: String,
) -> Result<bool, String> {
    lock_repository(&state)?
        .delete_generated_playlist(playlist_id.trim())
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

#[tauri::command]
pub fn scan_rhythm(state: State<'_, AppState>) -> Result<RhythmScanResultDto, String> {
    lock_repository(&state)?.scan_rhythm().map_err(|error| error.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DjStatusDto {
    active_model: Option<String>,
    luna_available: bool,
    ai: AiStatusDto,
    fish: FishStatusDto,
}

#[tauri::command]
pub fn get_dj_status(state: State<'_, AppState>) -> Result<DjStatusDto, String> {
    let ai = state.ai.status();
    let luna_available = ai.models.iter().any(|model| model == "gpt-5.6-luna");
    let (voice_id, voice_label) = lock_repository(&state)?
        .get_fish_voice()
        .map_err(|error| error.to_string())?;
    let fish = state.fish.status(voice_id, voice_label);
    Ok(DjStatusDto {
        active_model: luna_available.then_some("gpt-5.6-luna".to_owned()),
        luna_available,
        ai,
        fish,
    })
}

#[tauri::command]
pub fn get_dj_crossfade_ms(state: State<'_, AppState>) -> Result<i64, String> {
    lock_repository(&state)?
        .get_dj_crossfade_ms()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_dj_crossfade_ms(state: State<'_, AppState>, value: i64) -> Result<i64, String> {
    lock_repository(&state)?
        .set_dj_crossfade_ms(value)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_fish_credential(state: State<'_, AppState>, api_key: String) -> Result<(), String> {
    state.fish.set_credential(&api_key)
}

#[tauri::command]
pub fn clear_fish_credential(state: State<'_, AppState>) -> Result<(), String> {
    state.fish.clear_credential()
}

#[tauri::command]
pub fn search_fish_voices(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<FishVoiceDto>, String> {
    state.fish.search(&query, 8)
}

#[tauri::command]
pub fn select_fish_voice(
    state: State<'_, AppState>,
    voice_id: String,
    voice_label: String,
) -> Result<(), String> {
    lock_repository(&state)?
        .set_fish_voice(&voice_id, &voice_label)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn preview_fish_voice(
    app: AppHandle,
    state: State<'_, AppState>,
    voice_id: String,
) -> Result<NarrationDto, String> {
    let narration = state
        .fish
        .synthesize("This is Cadmium DJ. Let’s find the next signal.", &voice_id)?;
    let canonical = std::fs::canonicalize(&narration.path).map_err(|error| error.to_string())?;
    app.asset_protocol_scope()
        .allow_file(canonical)
        .map_err(|error| error.to_string())?;
    Ok(narration)
}

#[tauri::command]
pub fn get_whisper_status(state: State<'_, AppState>) -> WhisperStatusDto {
    state.whisper.status()
}

#[tauri::command]
pub async fn download_whisper_model(
    state: State<'_, AppState>,
) -> Result<WhisperStatusDto, String> {
    let whisper = Arc::clone(&state.whisper);
    tauri::async_runtime::spawn_blocking(move || whisper.download_model())
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn cancel_whisper_download(state: State<'_, AppState>) {
    state.whisper.cancel_download();
}

#[tauri::command]
pub async fn transcribe_dj_request(
    state: State<'_, AppState>,
    wav_bytes: Vec<u8>,
) -> Result<TranscriptionDto, String> {
    let whisper = Arc::clone(&state.whisper);
    tauri::async_runtime::spawn_blocking(move || whisper.transcribe(wav_bytes))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn record_dj_feedback(
    state: State<'_, AppState>,
    session_id: String,
    track_id: String,
    sentiment: String,
) -> Result<(), String> {
    lock_repository(&state)?
        .record_dj_feedback(&session_id, &track_id, &sentiment)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_dj_recovery(state: State<'_, AppState>) -> Result<Option<DjRecoveryDto>, String> {
    lock_repository(&state)?
        .get_dj_recovery()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_dj_recovery(
    state: State<'_, AppState>,
    session_id: String,
    current_set_id: String,
    ordinary_queue: DjQueueSnapshotDto,
    dj_queue: DjQueueSnapshotDto,
) -> Result<(), String> {
    lock_repository(&state)?
        .save_dj_recovery(&session_id, &current_set_id, &ordinary_queue, &dj_queue)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn generate_dj_set(
    state: State<'_, AppState>,
    session_id: Option<String>,
    prompt: String,
) -> Result<DjSetDto, String> {
    let prompt = prompt.trim().to_owned();
    if prompt.is_empty() || prompt.chars().count() > 200 {
        return Err("DJ request must contain 1 to 200 characters".to_owned());
    }
    let (library, signals) = {
        let mut repository = lock_repository(&state)?;
        (
            repository
                .ensure_playable_library()
                .map_err(|error| error.to_string())?,
            repository
                .listening_signals()
                .map_err(|error| error.to_string())?,
        )
    };
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let session_id = session_id
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| format!("dj-session-{timestamp}"));
    let artists = library
        .artists
        .iter()
        .map(|artist| (artist.id.clone(), artist.name.clone()))
        .collect::<HashMap<_, _>>();
    let albums = library
        .albums
        .iter()
        .map(|album| (album.id.clone(), album.title.clone()))
        .collect::<HashMap<_, _>>();
    let recent_set_ids = signals
        .get("recentSetTrackIds")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(serde_json::Value::as_str)
        .collect::<HashSet<_>>();
    let available_count = library
        .tracks
        .iter()
        .filter(|track| track.available)
        .count();
    let mut available_tracks = library
        .tracks
        .iter()
        .filter(|track| track.available)
        .collect::<Vec<_>>();
    let unseen_count = available_tracks
        .iter()
        .filter(|track| !recent_set_ids.contains(track.id.as_str()))
        .count();
    available_tracks.sort_by(|left, right| {
        dj_track_score(&right.id, &signals, &session_id).cmp(&dj_track_score(
            &left.id,
            &signals,
            &session_id,
        ))
    });
    let catalog = available_tracks
        .into_iter()
        .filter(|track| {
            available_count <= 12 || unseen_count < 4 || !recent_set_ids.contains(track.id.as_str())
        })
        .take(250)
        .map(|track| AiCatalogTrack {
            id: track.id.clone(),
            title: track.title.clone(),
            artist: track
                .artist_ids
                .iter()
                .filter_map(|id| artists.get(id))
                .cloned()
                .collect::<Vec<_>>()
                .join(", "),
            album: track
                .album_id
                .as_ref()
                .and_then(|id| albums.get(id))
                .cloned()
                .unwrap_or_default(),
            genre: track.genre.clone().unwrap_or_default(),
            year: track.year,
            duration_ms: track.duration_ms,
        })
        .collect::<Vec<_>>();
    if catalog.is_empty() {
        return Err("No playable music files were found. Rescan your sources or import Spotify Local Files again.".to_owned());
    }
    let available = catalog
        .iter()
        .map(|track| track.id.clone())
        .collect::<HashSet<_>>();
    let (title, rationale, narration, model, mode, fallback_reason, choices) = match state
        .ai
        .generate_dj(&prompt, &catalog, &signals)
    {
        Ok(draft) => (
            draft.set_title,
            draft.rationale,
            draft.narration,
            Some(draft.model),
            "luna".to_owned(),
            None,
            draft.tracks,
        ),
        Err(AiError::Cancelled) => return Err("DJ generation was cancelled".to_owned()),
        Err(error) => {
            let choices = catalog
                .iter()
                .take(6)
                .map(|track| crate::ai::AiTrackChoice {
                    id: track.id.clone(),
                    reason: "Selected by Cadmium's local library fallback.".to_owned(),
                })
                .collect();
            ("Local Signal".to_owned(), "A deterministic local set because Luna is currently unavailable.".to_owned(), "Luna is unavailable right now, so I pulled a local set from your library. No pretending; just music.".to_owned(), None, "local_fallback".to_owned(), Some(error.to_string()), choices)
        }
    };
    let mut seen = HashSet::new();
    let artist_by_id = catalog
        .iter()
        .map(|track| (track.id.as_str(), track.artist.as_str()))
        .collect::<HashMap<_, _>>();
    let diverse_artists = artist_by_id
        .values()
        .filter(|value| !value.is_empty())
        .collect::<HashSet<_>>()
        .len()
        > 1;
    let mut chosen = Vec::new();
    let mut last_artist = "";
    for choice in choices {
        if chosen.len() >= 6 || !available.contains(&choice.id) || !seen.insert(choice.id.clone()) {
            continue;
        }
        let artist = artist_by_id.get(choice.id.as_str()).copied().unwrap_or("");
        if diverse_artists && !artist.is_empty() && artist == last_artist {
            seen.remove(&choice.id);
            continue;
        }
        last_artist = artist;
        chosen.push(choice);
    }
    for track in &catalog {
        if chosen.len() >= 4 {
            break;
        }
        if seen.insert(track.id.clone())
            && (!diverse_artists || track.artist.is_empty() || track.artist != last_artist)
        {
            last_artist = &track.artist;
            chosen.push(crate::ai::AiTrackChoice {
                id: track.id.clone(),
                reason: "Filled locally to keep the set playable.".to_owned(),
            });
        }
    }
    for track in &catalog {
        if chosen.len() >= 4 {
            break;
        }
        if seen.insert(track.id.clone()) {
            chosen.push(crate::ai::AiTrackChoice {
                id: track.id.clone(),
                reason: "Filled locally to keep the set playable.".to_owned(),
            });
        }
    }
    let track_ids = chosen
        .iter()
        .map(|choice| choice.id.clone())
        .collect::<Vec<_>>();
    let track_reasons = chosen
        .into_iter()
        .map(|choice| TrackReasonDto {
            track_id: choice.id,
            reason: choice.reason.chars().take(180).collect(),
        })
        .collect::<Vec<_>>();
    let sequence = lock_repository(&state)?
        .next_dj_sequence(&session_id)
        .map_err(|error| error.to_string())?;
    let set = DjSetDto {
        id: format!("dj-set-{timestamp}"),
        session_id,
        title,
        rationale,
        narration,
        model,
        generation_mode: mode,
        track_ids,
        track_reasons,
        fallback_reason,
        sequence,
        state: "active".to_owned(),
        created_at: timestamp,
    };
    lock_repository(&state)?
        .save_dj_set(&set, &prompt)
        .map_err(|error| error.to_string())?;
    Ok(set)
}

fn dj_track_score(track_id: &str, signals: &serde_json::Value, seed: &str) -> i64 {
    let stats = signals
        .get("tracks")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .find(|item| item.get("trackId").and_then(serde_json::Value::as_str) == Some(track_id));
    let plays = stats
        .and_then(|item| item.get("plays"))
        .and_then(serde_json::Value::as_i64)
        .unwrap_or(0);
    let completions = stats
        .and_then(|item| item.get("completions"))
        .and_then(serde_json::Value::as_i64)
        .unwrap_or(0);
    let skips = stats
        .and_then(|item| item.get("skips"))
        .and_then(serde_json::Value::as_i64)
        .unwrap_or(0);
    let feedback = signals
        .get("feedback")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .find(|item| item.get("trackId").and_then(serde_json::Value::as_str) == Some(track_id));
    let more = feedback
        .and_then(|item| item.get("more"))
        .and_then(serde_json::Value::as_i64)
        .unwrap_or(0);
    let less = feedback
        .and_then(|item| item.get("less"))
        .and_then(serde_json::Value::as_i64)
        .unwrap_or(0);
    let favorite = signals
        .get("favoriteTrackIds")
        .and_then(serde_json::Value::as_array)
        .is_some_and(|items| items.iter().any(|item| item.as_str() == Some(track_id)));
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    seed.hash(&mut hasher);
    track_id.hash(&mut hasher);
    let variety = (hasher.finish() % 100) as i64;
    variety + if plays == 0 { 85 } else { 0 } + completions * 9 - skips * 14 + more * 60
        - less * 120
        + if favorite { 75 } else { 0 }
}

#[tauri::command]
pub fn synthesize_dj_narration(
    app: AppHandle,
    state: State<'_, AppState>,
    text: String,
) -> Result<NarrationDto, String> {
    let (voice_id, _) = lock_repository(&state)?
        .get_fish_voice()
        .map_err(|error| error.to_string())?;
    let narration = state
        .fish
        .synthesize(&text, voice_id.as_deref().unwrap_or(""))?;
    let canonical = std::fs::canonicalize(&narration.path).map_err(|error| error.to_string())?;
    app.asset_protocol_scope()
        .allow_file(canonical)
        .map_err(|error| error.to_string())?;
    Ok(narration)
}

#[tauri::command]
pub fn record_listening_event(
    state: State<'_, AppState>,
    track_id: String,
    event_type: String,
    source: String,
    position_ms: i64,
    duration_ms: i64,
    session_id: Option<String>,
) -> Result<(), String> {
    lock_repository(&state)?
        .record_listening_event(
            &track_id,
            &event_type,
            &source,
            position_ms,
            duration_ms,
            session_id.as_deref(),
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn end_dj_session(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    lock_repository(&state)?
        .end_dj_session(&session_id)
        .map_err(|error| error.to_string())
}

// Spotify import functions

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyImportDto {
    pub folders_found: usize,
    pub folders_added: usize,
    pub tracks_indexed: usize,
    pub metadata_errors: usize,
    pub sfx_skipped: usize,
    pub sfx_pruned: usize,
    pub paths: Vec<String>,
    pub message: String,
}

fn spotify_local_index_files() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(app_data) = std::env::var_os("APPDATA") {
        roots.push(PathBuf::from(app_data).join("Spotify").join("Users"));
    }
    if let Some(local_data) = std::env::var_os("LOCALAPPDATA") {
        roots.push(
            PathBuf::from(local_data)
                .join("Packages")
                .join("SpotifyAB.SpotifyMusic_zpdnekdrzrea0")
                .join("LocalState")
                .join("Spotify")
                .join("Users"),
        );
    }

    roots
        .into_iter()
        .filter_map(|root| std::fs::read_dir(root).ok())
        .flat_map(|entries| entries.filter_map(Result::ok))
        .map(|entry| entry.path().join("local-files.bnk"))
        .filter(|path| path.is_file())
        .collect()
}

fn spotify_paths_from_bytes(bytes: &[u8]) -> Vec<PathBuf> {
    const EXTENSIONS: [&[u8]; 6] = [b".mp3", b".flac", b".wav", b".ogg", b".m4a", b".aac"];
    let lower = bytes.iter().map(u8::to_ascii_lowercase).collect::<Vec<_>>();
    let mut paths = Vec::new();
    let mut index = 0;
    while index + 3 < bytes.len() {
        let starts_path = bytes[index].is_ascii_alphabetic()
            && bytes[index + 1] == b':'
            && matches!(bytes[index + 2], b'\\' | b'/');
        if !starts_path {
            index += 1;
            continue;
        }
        let end = EXTENSIONS
            .iter()
            .filter_map(|extension| {
                lower[index + 3..]
                    .windows(extension.len())
                    .position(|window| window == *extension)
                    .map(|offset| index + 3 + offset + extension.len())
            })
            .min();
        let Some(end) = end else {
            index += 3;
            continue;
        };
        paths.push(PathBuf::from(
            String::from_utf8_lossy(&bytes[index..end]).into_owned(),
        ));
        index = end;
    }
    paths
}

fn spotify_local_exact_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    for index in spotify_local_index_files() {
        let Ok(bytes) = std::fs::read(index) else {
            continue;
        };
        for path in spotify_paths_from_bytes(&bytes) {
            if path.is_file() {
                if let Some(canonical) = std::fs::canonicalize(&path).ok() {
                    paths.push(canonical);
                }
            }
        }
    }
    paths.sort();
    paths.dedup();
    paths
}

fn spotify_legacy_roots(paths: &[PathBuf]) -> Vec<PathBuf> {
    let mut folders = paths
        .iter()
        .filter_map(|path| path.parent().map(Path::to_path_buf))
        .collect::<Vec<_>>();
    folders.sort();
    folders.dedup();
    let mut roots = Vec::new();
    for folder in folders {
        if !roots.iter().any(|root: &PathBuf| folder.starts_with(root)) {
            roots.push(folder);
        }
    }
    roots
}

#[tauri::command]
pub async fn import_spotify_local_files(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<SpotifyImportDto, String> {
    let repository = Arc::clone(&state.repository);
    let (paths, indexed, metadata_errors, sfx_skipped, sfx_pruned, library) =
        tauri::async_runtime::spawn_blocking(move || {
            let paths = spotify_local_exact_paths();
            if paths.is_empty() {
                return Ok((paths, 0, 0, 0, 0, None::<NormalizedLibraryDto>));
            }
            let mut repository = repository
                .lock()
                .map_err(|_| "library repository lock is poisoned".to_owned())?;
            let legacy_roots = spotify_legacy_roots(&paths);
            let summary = repository
                .reconcile_spotify_local_files(&paths, &legacy_roots)
                .map_err(|error| error.to_string())?;
            let library = repository
                .get_library()
                .map_err(|error| error.to_string())?;
            Ok::<_, String>((
                paths,
                summary.tracks_indexed,
                summary.metadata_errors,
                summary.sfx_skipped,
                summary.sfx_pruned,
                Some(library),
            ))
        })
        .await
        .map_err(|error| format!("Spotify import worker stopped: {error}"))??;

    if paths.is_empty() {
        return Ok(SpotifyImportDto {
            folders_found: 0,
            folders_added: 0,
            tracks_indexed: 0,
            metadata_errors: 0,
            sfx_skipped: 0,
            sfx_pruned: 0,
            paths: Vec::new(),
            message: "No Spotify Local Files were found. Add a Local Files source in Spotify first, or choose the folder directly in Cadmium.".to_owned(),
        });
    }

    for path in &paths {
        app.asset_protocol_scope()
            .allow_file(path)
            .map_err(|error| format!("could not scope Spotify Local Files file: {error}"))?;
    }
    if let Some(library) = library.as_ref() {
        allow_library_assets(&app, library)?;
    }

    let display_paths = paths
        .iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect::<Vec<_>>();
    let message = if indexed == 0 {
        format!(
            "All {} Spotify Local Files are already indexed.",
            paths.len()
        )
    } else {
        let mut text = format!(
            "Indexed {} track(s) from {} Spotify Local File(s).",
            indexed,
            paths.len()
        );
        if sfx_skipped > 0 {
            text.push_str(&format!(
                " Skipped {} bundled sound effect(s).",
                sfx_skipped
            ));
        }
        if sfx_pruned > 0 {
            text.push_str(&format!(
                " Removed {} leftover sound effect(s) from a previous import.",
                sfx_pruned
            ));
        }
        text
    };
    Ok(SpotifyImportDto {
        folders_found: paths.len(),
        folders_added: 0,
        tracks_indexed: indexed,
        metadata_errors,
        sfx_skipped: sfx_skipped,
        sfx_pruned: sfx_pruned,
        paths: display_paths,
        message,
    })
}

#[cfg(test)]
mod spotify_tests {
    use super::spotify_paths_from_bytes;

    #[test]
    fn extracts_paths_embedded_in_spotify_protobuf_bytes() {
        let bytes = b"\x0aLocalFilesStorage\x27C:\\Users\\Epic\\Downloads\\song.mp3\x12metadata\x4fD:\\Music\\set\\track.m4a\x00";
        let paths = spotify_paths_from_bytes(bytes);
        assert_eq!(paths.len(), 2);
        assert!(paths[0].to_string_lossy().ends_with("song.mp3"));
        assert!(paths[1].to_string_lossy().ends_with("track.m4a"));
    }
}
