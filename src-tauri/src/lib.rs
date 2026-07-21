mod commands;
mod library;

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
            commands::record_recent_play
        ])
        .run(tauri::generate_context!())
        .expect("error while running Cadmium");
}
