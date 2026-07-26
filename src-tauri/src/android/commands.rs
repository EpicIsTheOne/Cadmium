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
use crate::library::ScanSummaryDto;
use tauri::State;

use crate::commands::AppState;

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
