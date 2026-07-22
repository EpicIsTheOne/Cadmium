use reqwest::blocking::Client;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const MODEL_URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin";
const MODEL_SHA256: &str = "a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002";
const MODEL_BYTES: u64 = 147_964_211;
const RUNTIME_URL: &str = "https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.1/whisper-bin-x64.zip";
const RUNTIME_SHA256: &str = "7d8be46ecd31828e1eb7a2ecdd0d6b314feafd82163038ab6092594b0a063539";
const RUNTIME_BYTES: u64 = 7_982_101;
const TOTAL_BYTES: u64 = MODEL_BYTES + RUNTIME_BYTES;
const MAX_WAV_BYTES: usize = 500_000;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WhisperStatusDto {
    pub installed: bool,
    pub downloading: bool,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub progress: f64,
    pub model: String,
    pub message: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionDto {
    pub text: String,
    pub duration_ms: u64,
    pub model: String,
}

#[derive(Default)]
struct DownloadState { downloading: bool, downloaded_bytes: u64, message: String }

pub struct WhisperService {
    root: PathBuf,
    state: Mutex<DownloadState>,
    transcription: Mutex<()>,
    cancel: AtomicBool,
}

impl WhisperService {
    pub fn new(data_dir: &Path) -> Self {
        Self { root: data_dir.join("whisper"), state: Mutex::new(DownloadState::default()), transcription: Mutex::new(()), cancel: AtomicBool::new(false) }
    }

    fn model_path(&self) -> PathBuf { self.root.join("ggml-base.en.bin") }
    fn cli_path(&self) -> PathBuf { self.root.join("runtime").join("whisper-cli.exe") }

    pub fn status(&self) -> WhisperStatusDto {
        let model_ready = self.model_path().metadata().is_ok_and(|meta| meta.len() == MODEL_BYTES);
        let runtime_ready = self.cli_path().is_file();
        let installed = model_ready && runtime_ready;
        let state = self.state.lock().ok();
        let downloading = state.as_ref().is_some_and(|value| value.downloading);
        let downloaded_bytes = state.as_ref().map(|value| value.downloaded_bytes).unwrap_or(if installed { TOTAL_BYTES } else { 0 });
        let message = if installed { "Whisper base.en is installed and runs locally.".to_owned() }
        else if downloading { "Downloading the verified local Whisper runtime and model…".to_owned() }
        else { state.as_ref().map(|value| value.message.clone()).filter(|value| !value.is_empty()).unwrap_or_else(|| "Download Whisper base.en to enable private push-to-talk requests.".to_owned()) };
        WhisperStatusDto { installed, downloading, downloaded_bytes, total_bytes: TOTAL_BYTES, progress: downloaded_bytes as f64 / TOTAL_BYTES as f64, model: "base.en · whisper.cpp v1.9.1".to_owned(), message }
    }

    pub fn cancel_download(&self) { self.cancel.store(true, Ordering::SeqCst); }

    pub fn download_model(&self) -> Result<WhisperStatusDto, String> {
        if self.status().installed { return Ok(self.status()); }
        {
            let mut state = self.state.lock().map_err(|_| "Whisper download state is unavailable".to_owned())?;
            if state.downloading { return Err("Whisper is already downloading".to_owned()); }
            state.downloading = true; state.downloaded_bytes = 0; state.message.clear();
        }
        self.cancel.store(false, Ordering::SeqCst);
        let result = self.download_inner();
        if let Ok(mut state) = self.state.lock() { state.downloading = false; state.message = result.as_ref().err().cloned().unwrap_or_default(); }
        result.map(|_| self.status())
    }

    fn download_inner(&self) -> Result<(), String> {
        fs::create_dir_all(&self.root).map_err(|error| error.to_string())?;
        let client = Client::builder().connect_timeout(Duration::from_secs(15)).timeout(Duration::from_secs(600)).build().map_err(|error| error.to_string())?;
        let runtime_dir = self.root.join("runtime");
        if !self.cli_path().is_file() {
            let bytes = self.download_bytes(&client, RUNTIME_URL, RUNTIME_BYTES, RUNTIME_SHA256, 0)?;
            let temporary = self.root.join("runtime.next");
            let _ = fs::remove_dir_all(&temporary);
            fs::create_dir_all(&temporary).map_err(|error| error.to_string())?;
            let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|error| format!("Whisper runtime archive was invalid: {error}"))?;
            let mut extracted = 0usize;
            for index in 0..archive.len() {
                let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
                let Some(name) = Path::new(entry.name()).file_name().and_then(|value| value.to_str()) else { continue; };
                let allowed = name.eq_ignore_ascii_case("whisper-cli.exe") || name.to_ascii_lowercase().ends_with(".dll");
                if !allowed || entry.size() > 64 * 1024 * 1024 || extracted >= 32 { continue; }
                let mut output = File::create(temporary.join(name)).map_err(|error| error.to_string())?;
                std::io::copy(&mut entry, &mut output).map_err(|error| error.to_string())?;
                extracted += 1;
            }
            if !temporary.join("whisper-cli.exe").is_file() { let _ = fs::remove_dir_all(&temporary); return Err("Pinned Whisper runtime contained no CLI".to_owned()); }
            let _ = fs::remove_dir_all(&runtime_dir);
            fs::rename(&temporary, &runtime_dir).map_err(|error| error.to_string())?;
        }
        if !self.model_path().metadata().is_ok_and(|meta| meta.len() == MODEL_BYTES) {
            let temporary = self.root.join("ggml-base.en.bin.part");
            self.download_file(&client, MODEL_URL, MODEL_BYTES, MODEL_SHA256, RUNTIME_BYTES, &temporary)?;
            let _ = fs::remove_file(self.model_path());
            fs::rename(&temporary, self.model_path()).map_err(|error| error.to_string())?;
        }
        Ok(())
    }

    fn download_bytes(&self, client: &Client, url: &str, expected_size: u64, expected_hash: &str, offset: u64) -> Result<Vec<u8>, String> {
        let mut response = client.get(url).send().map_err(|error| format!("Whisper download failed: {error}"))?;
        if !response.status().is_success() { return Err(format!("Whisper download returned HTTP {}", response.status())); }
        if response.content_length().is_some_and(|length| length != expected_size) { return Err("Whisper artifact size did not match the pinned release".to_owned()); }
        let mut bytes = Vec::with_capacity(expected_size as usize);
        let mut hasher = Sha256::new();
        let mut buffer = [0u8; 64 * 1024];
        loop {
            if self.cancel.load(Ordering::SeqCst) { return Err("Whisper download cancelled".to_owned()); }
            let count = response.read(&mut buffer).map_err(|error| format!("Whisper download interrupted: {error}"))?;
            if count == 0 { break; }
            if bytes.len() + count > expected_size as usize { return Err("Whisper artifact exceeded its pinned size".to_owned()); }
            bytes.extend_from_slice(&buffer[..count]); hasher.update(&buffer[..count]);
            if let Ok(mut state) = self.state.lock() { state.downloaded_bytes = offset + bytes.len() as u64; }
        }
        if bytes.len() as u64 != expected_size || format!("{:x}", hasher.finalize()) != expected_hash { return Err("Whisper artifact failed integrity verification".to_owned()); }
        Ok(bytes)
    }

    fn download_file(&self, client: &Client, url: &str, expected_size: u64, expected_hash: &str, offset: u64, output: &Path) -> Result<(), String> {
        let result = (|| {
            let mut response = client.get(url).send().map_err(|error| format!("Whisper download failed: {error}"))?;
            if !response.status().is_success() { return Err(format!("Whisper download returned HTTP {}", response.status())); }
            if response.content_length().is_some_and(|length| length != expected_size) { return Err("Whisper artifact size did not match the pinned release".to_owned()); }
            let mut file = File::create(output).map_err(|error| error.to_string())?;
            let mut hasher = Sha256::new(); let mut total = 0u64; let mut buffer = [0u8; 64 * 1024];
            loop {
                if self.cancel.load(Ordering::SeqCst) { return Err("Whisper download cancelled".to_owned()); }
                let count = response.read(&mut buffer).map_err(|error| format!("Whisper download interrupted: {error}"))?;
                if count == 0 { break; }
                total = total.saturating_add(count as u64);
                if total > expected_size { return Err("Whisper artifact exceeded its pinned size".to_owned()); }
                file.write_all(&buffer[..count]).map_err(|error| error.to_string())?; hasher.update(&buffer[..count]);
                if let Ok(mut state) = self.state.lock() { state.downloaded_bytes = offset + total; }
            }
            file.flush().map_err(|error| error.to_string())?;
            if total != expected_size || format!("{:x}", hasher.finalize()) != expected_hash { return Err("Whisper artifact failed integrity verification".to_owned()); }
            Ok(())
        })();
        if result.is_err() { let _ = fs::remove_file(output); }
        result
    }

    pub fn transcribe(&self, wav_bytes: Vec<u8>) -> Result<TranscriptionDto, String> {
        let _guard = self.transcription.lock().map_err(|_| "Local Whisper is unavailable".to_owned())?;
        let channels = wav_bytes.get(22..24).map(|value| u16::from_le_bytes([value[0], value[1]])).unwrap_or(0);
        let sample_rate = wav_bytes.get(24..28).map(|value| u32::from_le_bytes([value[0], value[1], value[2], value[3]])).unwrap_or(0);
        let bits = wav_bytes.get(34..36).map(|value| u16::from_le_bytes([value[0], value[1]])).unwrap_or(0);
        if wav_bytes.len() < 44 || wav_bytes.len() > MAX_WAV_BYTES || &wav_bytes[0..4] != b"RIFF" || &wav_bytes[8..12] != b"WAVE" || channels != 1 || sample_rate != 16_000 || bits != 16 {
            return Err("DJ recordings must be valid WAV audio no longer than 15 seconds".to_owned());
        }
        if !self.status().installed { return Err("Download Whisper base.en before using push-to-talk".to_owned()); }
        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
        let wav_path = self.root.join(format!("request-{timestamp}.wav"));
        let output_prefix = self.root.join(format!("request-{timestamp}"));
        let text_path = self.root.join(format!("request-{timestamp}.txt"));
        fs::write(&wav_path, &wav_bytes).map_err(|error| error.to_string())?;
        let mut command = Command::new(self.cli_path());
        command.args(["-m"]).arg(self.model_path()).args(["-f"]).arg(&wav_path).args(["-l", "en", "-nt", "-np", "-otxt", "-of"]).arg(&output_prefix).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
        #[cfg(windows)] command.creation_flags(0x08000000);
        let result = (|| {
            let mut child = command.spawn().map_err(|error| format!("Could not start local Whisper: {error}"))?;
            let deadline = Instant::now() + Duration::from_secs(90);
            loop {
                if let Some(status) = child.try_wait().map_err(|error| error.to_string())? {
                    if !status.success() { return Err("Local Whisper transcription failed".to_owned()); }
                    break;
                }
                if Instant::now() >= deadline { let _ = child.kill(); let _ = child.wait(); return Err("Local Whisper transcription timed out".to_owned()); }
                thread::sleep(Duration::from_millis(80));
            }
            let text = fs::read_to_string(&text_path).map_err(|_| "Whisper produced no transcript".to_owned())?.split_whitespace().collect::<Vec<_>>().join(" ");
            if text.is_empty() { return Err("Whisper did not hear a request".to_owned()); }
            Ok(TranscriptionDto { text: text.chars().take(200).collect(), duration_ms: wav_bytes.len().saturating_sub(44) as u64 * 1000 / 32_000, model: "base.en - whisper.cpp v1.9.1".to_owned() })
        })();
        let _ = fs::remove_file(wav_path); let _ = fs::remove_file(text_path);
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_oversized_audio_before_starting_runtime() {
        let service = WhisperService::new(Path::new("missing"));
        assert!(service.transcribe(vec![0; MAX_WAV_BYTES + 1]).unwrap_err().contains("15 seconds"));
    }
}
