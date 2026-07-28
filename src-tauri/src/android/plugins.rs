use tauri::{plugin::{Builder, TauriPlugin}, Runtime};

fn native_plugin<R: Runtime>(
    name: &'static str,
    android_class: &'static str,
) -> TauriPlugin<R> {
    Builder::new(name)
        .setup(move |_app, api| {
            #[cfg(target_os = "android")]
            {
                api.register_android_plugin("com.cadmium.music", android_class)?;
            }
            #[cfg(not(target_os = "android"))]
            {
                let _ = (api, android_class);
            }
            Ok(())
        })
        .build()
}

pub fn permission_bridge<R: Runtime>() -> TauriPlugin<R> {
    native_plugin("permissionbridge", "PermissionBridge")
}

pub fn media_store<R: Runtime>() -> TauriPlugin<R> {
    native_plugin("mediastore", "MediaStorePlugin")
}

pub fn artwork_bridge<R: Runtime>() -> TauriPlugin<R> {
    native_plugin("artworkbridge", "ArtworkBridge")
}

pub fn rust_bridge<R: Runtime>() -> TauriPlugin<R> {
    native_plugin("rustbridge", "RustBridge")
}
