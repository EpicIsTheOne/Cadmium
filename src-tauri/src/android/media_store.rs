use crate::library::{AndroidMediaCandidate, LibraryRepository, ScanSummaryDto};
use serde::{Deserialize, Serialize};

/// Wire format sent by the Kotlin `MediaStorePlugin`. Mirrors the fields the
/// plugin reads off the main thread so Rust never touches Android content
/// resolvers directly.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidMediaCandidateDto {
    pub volume_name: String,
    pub media_id: String,
    pub content_uri: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_id: Option<String>,
    pub duration_ms: i64,
    pub track_number: Option<i64>,
    pub disc_number: Option<i64>,
    pub year: Option<i64>,
    pub genre: Option<String>,
    pub format: String,
    pub byte_length: i64,
    pub modified_at_ms: i64,
    pub artwork_cache_path: Option<String>,
}

impl AndroidMediaCandidateDto {
    fn into_domain(self) -> AndroidMediaCandidate {
        AndroidMediaCandidate {
            volume_name: self.volume_name,
            media_id: self.media_id,
            content_uri: self.content_uri,
            title: self.title,
            artist: self.artist,
            album: self.album,
            album_id: self.album_id,
            duration_ms: self.duration_ms,
            track_number: self.track_number,
            disc_number: self.disc_number,
            year: self.year,
            genre: self.genre,
            format: self.format,
            byte_length: self.byte_length,
            modified_at_ms: self.modified_at_ms,
            artwork_cache_path: self.artwork_cache_path,
        }
    }
}

/// Reconcile a MediaStore candidate set into the shared library. Pure logic;
/// compiles and is tested on every target.
pub fn reconcile(
    repository: &mut LibraryRepository,
    candidates: &[AndroidMediaCandidateDto],
) -> Result<ScanSummaryDto, String> {
    let domain: Vec<AndroidMediaCandidate> = candidates
        .iter()
        .cloned()
        .map(|c| c.into_domain())
        .collect();
    repository
        .reconcile_android_media(&domain)
        .map_err(|error| error.to_string())
}

/// Additive import of SAF-picked document URIs. Unlike `reconcile`, this does
/// NOT mark unseen Android tracks unavailable, so a partial picker set can
/// safely flow through it without disturbing the scanned library.
pub fn import(
    repository: &mut LibraryRepository,
    candidates: &[AndroidMediaCandidateDto],
) -> Result<ScanSummaryDto, String> {
    let domain: Vec<AndroidMediaCandidate> = candidates
        .iter()
        .cloned()
        .map(|c| c.into_domain())
        .collect();
    repository
        .import_android_picked(&domain)
        .map_err(|error| error.to_string())
}

/// On Android, query MediaStore.Audio.Media off the main thread and return the
/// candidates. On other targets this is unreachable at runtime (the command
/// handler rejects non-Android platforms before calling it).
#[cfg(target_os = "android")]
pub fn query_media_store(_app: &tauri::AppHandle) -> Result<ScanSummaryDto, String> {
    // The Kotlin `MediaStorePlugin` performs the real query and returns the
    // serialized candidates over the Tauri bridge; Rust forwards them to
    // `reconcile`. This function is the documented integration point and is
    // only linked on the Android target where the plugin is registered.
    Err("MediaStore query is handled by the Kotlin plugin; see MediaStorePlugin".to_owned())
}
