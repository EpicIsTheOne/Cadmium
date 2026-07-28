//! Android (mobile) integration layer.
//!
//! This module contains the Rust side of Cadmium's Android support. It is
//! compiled on every target (so `cargo test` exercises the shared logic) but
//! the parts that touch Android-only facilities — MediaStore queries and the
//! Media3 playback service bridge — are gated behind `cfg(target_os =
//! "android")` and return a clear "unsupported on this platform" error
//! elsewhere. The Cadmium Android app runs these through the same Tauri
//! invoke handler as the desktop commands.

pub mod commands;
pub mod media_store;
pub mod playback;
pub mod plugins;
