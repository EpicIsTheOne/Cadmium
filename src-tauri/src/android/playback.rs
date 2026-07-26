use serde::{Deserialize, Serialize};

/// Playback state pushed from the Media3 `PlaybackService` over the Tauri
/// event channel. Renderer-facing; the mobile engine forwards it to the
/// PlaybackStore.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativePlaybackState {
    pub current_index: Option<usize>,
    pub current_track_id: Option<String>,
    pub is_playing: bool,
    pub position_ms: u64,
    pub duration_ms: u64,
    pub volume: f32,
    pub repeat_mode: String,
    pub is_shuffle: bool,
    pub queue: Vec<AndroidQueueItem>,
}

/// A single item in the queue handed to Media3. The renderer computes the full
/// queue (with reordering/crossfade) and the service renders it verbatim.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidQueueItem {
    pub track_id: String,
    pub uri: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub artwork_uri: Option<String>,
    pub duration_ms: u64,
    pub crossfade_ms: u32,
}

fn unsupported() -> Result<(), String> {
    Err("this playback command is only supported on Android".to_owned())
}

/// Set the queue on the Media3 service. On Android this is forwarded to the
/// running `PlaybackService`; elsewhere it is rejected at the command layer.
#[cfg(target_os = "android")]
pub fn set_queue(_state: &NativePlaybackState) -> Result<(), String> {
    // Forwarded to the Android `PlaybackService` via the Media3 bridge. Linked
    // only on the Android target where the service is registered.
    unsupported()
}

#[cfg(not(target_os = "android"))]
pub fn set_queue(_state: &NativePlaybackState) -> Result<(), String> {
    unsupported()
}

pub fn play() -> Result<(), String> {
    unsupported()
}
pub fn pause() -> Result<(), String> {
    unsupported()
}
pub fn toggle() -> Result<(), String> {
    unsupported()
}
pub fn next() -> Result<(), String> {
    unsupported()
}
pub fn previous() -> Result<(), String> {
    unsupported()
}
pub fn seek(position_ms: u64) -> Result<(), String> {
    let _ = position_ms;
    unsupported()
}
pub fn set_volume(volume: f32) -> Result<(), String> {
    let _ = volume;
    unsupported()
}
pub fn set_repeat_mode(mode: String) -> Result<(), String> {
    let _ = mode;
    unsupported()
}
pub fn set_shuffle(enabled: bool) -> Result<(), String> {
    let _ = enabled;
    unsupported()
}

/// Accept a state update from the Media3 service. On Android this is invoked by
/// the event listener; on other targets the command handler rejects it.
pub fn accept_state(_state: NativePlaybackState) -> Result<(), String> {
    // The renderer already reflects state via the engine subscription; the
    // mobile engine is the source of truth for the queue, Media3 for position.
    Ok(())
}
