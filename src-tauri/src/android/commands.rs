//! Tauri command wrappers for the Android integration layer.
//!
//! Command names are the contract the mobile renderer (src/mobile) invokes.
//! Read-only library commands (get_library / search_library / get_user_playlists
//! / get_favorite_track_ids / set_track_favorite) are intentionally shared with
//! the desktop — the same Rust handlers serve both products.

use crate::android::media_store::{self, AndroidMediaCandidateDto};
use crate::android::playback::{
    self, AndroidQueueItem, NativePlaybackState,
};
use crate::library::{NormalizedLibraryDto, ScanSummaryDto, SearchResultsDto};
use tauri::State;

use crate::commands::{lock_repository, AppState};

#[tauri::command]
pub fn android_media_store_scan(_app: tauri::AppHandle) -> Result<ScanSummaryDto, String> {
    // On Android, the Kotlin MediaStorePlugin performs the query off the main
    // thread and calls android_reconcile_media with the candidates. Off-device
    // the scan cannot run, so it returns a clear error and the renderer degrades
    // to showing the last reconciled library.
    #[cfg(target_os = "android")]
    {
        media_store::query_media_store(&_app)
    }
    #[cfg(not(target_os = "android"))]
    {
        Err("android_media_store_scan is only supported on Android".to_owned())
    }
}

#[tauri::command]
pub fn android_reconcile_media(
    state: State<'_, AppState>,
    candidates: Vec<AndroidMediaCandidateDto>,
) -> Result<ScanSummaryDto, String> {
    let mut repository = state
        .repository
        .lock()
        .map_err(|_| "library repository lock is poisoned".to_owned())?;
    media_store::reconcile(&mut repository, &candidates)
}

#[tauri::command]
pub fn android_set_queue(_app: tauri::AppHandle, queue: Vec<AndroidQueueItem>) -> Result<(), String> {
    let state = NativePlaybackState {
        current_index: None,
        current_track_id: queue.first().map(|item| item.track_id.clone()),
        is_playing: false,
        position_ms: 0,
        duration_ms: queue.first().map(|item| item.duration_ms).unwrap_or(0),
        volume: 1.0,
        repeat_mode: "off".to_owned(),
        is_shuffle: false,
        queue,
    };
    playback::set_queue(&state)
}

#[tauri::command]
pub fn android_play(_app: tauri::AppHandle) -> Result<(), String> {
    playback::play()
}

#[tauri::command]
pub fn android_pause(_app: tauri::AppHandle) -> Result<(), String> {
    playback::pause()
}

#[tauri::command]
pub fn android_toggle(_app: tauri::AppHandle) -> Result<(), String> {
    playback::toggle()
}

#[tauri::command]
pub fn android_next(_app: tauri::AppHandle) -> Result<(), String> {
    playback::next()
}

#[tauri::command]
pub fn android_previous(_app: tauri::AppHandle) -> Result<(), String> {
    playback::previous()
}

#[tauri::command]
pub fn android_seek(_app: tauri::AppHandle, position_ms: u64) -> Result<(), String> {
    playback::seek(position_ms)
}

#[tauri::command]
pub fn android_set_volume(_app: tauri::AppHandle, volume: f32) -> Result<(), String> {
    playback::set_volume(volume)
}

#[tauri::command]
pub fn android_set_repeat_mode(_app: tauri::AppHandle, mode: String) -> Result<(), String> {
    playback::set_repeat_mode(mode)
}

#[tauri::command]
pub fn android_set_shuffle(_app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    playback::set_shuffle(enabled)
}

#[tauri::command]
pub fn android_accept_playback_state(state: NativePlaybackState) -> Result<(), String> {
    // On Android this wakes the renderer subscription; on other targets the
    // command is registered for parity but the bridge does nothing.
    let _ = state;
    playback::accept_state(NativePlaybackState {
        current_index: None,
        current_track_id: None,
        is_playing: false,
        position_ms: 0,
        duration_ms: 0,
        volume: 1.0,
        repeat_mode: "off".to_owned(),
        is_shuffle: false,
        queue: Vec::new(),
    })
}

// ── Library read surface ────────────────────────────────────────────────────
// These mirror the desktop read commands but are exposed under android_* names
// so the mobile renderer has a stable, product-specific contract. They read the
// shared repository that MediaStore reconciliation populates.

#[tauri::command]
pub fn android_get_library(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<NormalizedLibraryDto, String> {
    let library = lock_repository(&state)?
        .get_library()
        .map_err(|error| error.to_string())?;
    crate::commands::allow_library_assets(&app, &library)?;
    Ok(library)
}

#[tauri::command]
pub fn android_search_library(
    state: State<'_, AppState>,
    query: String,
) -> Result<SearchResultsDto, String> {
    lock_repository(&state)?
        .search(&query)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn android_get_favorite_track_ids(
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    lock_repository(&state)?
        .get_favorite_track_ids()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn android_set_track_favorite(
    state: State<'_, AppState>,
    track_id: String,
    favorite: bool,
) -> Result<bool, String> {
    lock_repository(&state)?
        .set_track_favorite(&track_id, favorite)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn android_get_recent_track_ids(
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    lock_repository(&state)?
        .get_recent_track_ids()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn android_record_recent_play(
    state: State<'_, AppState>,
    track_id: String,
    position_ms: u64,
) -> Result<(), String> {
    lock_repository(&state)?
        .record_recent_play(&track_id, position_ms as i64)
        .map_err(|error| error.to_string())
}
