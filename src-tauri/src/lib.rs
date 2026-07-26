mod ai;
mod android;
mod commands;
mod dj;
mod library;
mod whisper;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let state = commands::AppState::new(&data_dir)
                .map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error))?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::select_watched_folder,
            commands::list_watched_folders,
            commands::add_watched_folder,
            commands::import_spotify_local_files,
            commands::rescan_watched_folder,
            commands::remove_watched_folder,
            commands::get_library,
            commands::search_library,
            commands::get_settings,
            commands::save_settings,
            commands::get_playback_state,
            commands::save_playback_state,
            commands::get_queue,
            commands::save_queue,
            commands::get_favorite_track_ids,
            commands::set_track_favorite,
            commands::remove_track,
            commands::set_track_album,
            commands::create_playlist,
            commands::rename_playlist,
            commands::delete_playlist,
            commands::add_track_to_playlist,
            commands::remove_track_from_playlist,
            commands::create_album,
            commands::remove_track_from_album,
            commands::update_playlist,
            commands::update_album,
            commands::set_collection_artwork,
            commands::resolve_artist_by_name,
            commands::record_recent_play,
            commands::get_discovery,
            commands::get_ai_status,
            commands::start_codex_login,
            commands::cancel_codex_login,
            commands::set_ai_cloud_enabled,
            commands::generate_ai_playlist,
            commands::cancel_ai_generation,
            commands::delete_generated_playlist,
            commands::start_radio,
            commands::analyze_rhythm,
            commands::scan_rhythm,
            commands::get_dj_status,
            commands::get_dj_crossfade_ms,
            commands::set_dj_crossfade_ms,
            commands::set_fish_credential,
            commands::clear_fish_credential,
            commands::search_fish_voices,
            commands::select_fish_voice,
            commands::preview_fish_voice,
            commands::get_whisper_status,
            commands::download_whisper_model,
            commands::cancel_whisper_download,
            commands::transcribe_dj_request,
            commands::generate_dj_set,
            commands::record_dj_feedback,
            commands::get_dj_recovery,
            commands::save_dj_recovery,
            commands::synthesize_dj_narration,
            commands::record_listening_event,
            commands::end_dj_session,
            android::commands::android_media_store_scan,
            android::commands::android_reconcile_media,
            android::commands::android_set_queue,
            android::commands::android_play,
            android::commands::android_pause,
            android::commands::android_toggle,
            android::commands::android_next,
            android::commands::android_previous,
            android::commands::android_seek,
            android::commands::android_set_volume,
            android::commands::android_set_repeat_mode,
            android::commands::android_set_shuffle,
            android::commands::android_accept_playback_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running Cadmium");
}
