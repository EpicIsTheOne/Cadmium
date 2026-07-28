use serde::{de::DeserializeOwned, Serialize};
use std::marker::PhantomData;
#[cfg(target_os = "android")]
use tauri::plugin::PluginHandle;
use tauri::{
    plugin::{Builder, PluginApi, TauriPlugin},
    AppHandle, Manager, Runtime,
};

macro_rules! native_bridge {
    ($state:ident, $init:ident, $plugin_name:literal, $android_class:literal) => {
        pub struct $state<R: Runtime> {
            #[cfg(target_os = "android")]
            handle: PluginHandle<R>,
            #[cfg(not(target_os = "android"))]
            _runtime: PhantomData<fn() -> R>,
        }

        impl<R: Runtime> $state<R> {
            #[cfg(target_os = "android")]
            pub fn run<T: DeserializeOwned, P: Serialize>(
                &self,
                command: &str,
                payload: P,
            ) -> Result<T, String> {
                self.handle
                    .run_mobile_plugin(command, payload)
                    .map_err(|error| error.to_string())
            }

            #[cfg(not(target_os = "android"))]
            pub fn run<T: DeserializeOwned, P: Serialize>(
                &self,
                _command: &str,
                _payload: P,
            ) -> Result<T, String> {
                Err("native Android bridge is unavailable on this platform".to_owned())
            }
        }

        pub fn $init<R: Runtime>() -> TauriPlugin<R> {
            Builder::new($plugin_name)
                .setup(|app: &AppHandle<R>, api: PluginApi<R, ()>| {
                    #[cfg(target_os = "android")]
                    let bridge = $state {
                        handle: api.register_android_plugin("com.cadmium.music", $android_class)?,
                    };
                    #[cfg(not(target_os = "android"))]
                    let bridge = {
                        let _ = api;
                        $state::<R> {
                            _runtime: PhantomData,
                        }
                    };
                    app.manage(bridge);
                    Ok(())
                })
                .build()
        }
    };
}

native_bridge!(
    PermissionBridge,
    permission_bridge,
    "permissionbridge",
    "PermissionBridge"
);
native_bridge!(
    MediaStoreBridge,
    media_store,
    "mediastore",
    "MediaStorePlugin"
);
native_bridge!(
    ArtworkBridge,
    artwork_bridge,
    "artworkbridge",
    "ArtworkBridge"
);
native_bridge!(RustBridge, rust_bridge, "rustbridge", "RustBridge");
