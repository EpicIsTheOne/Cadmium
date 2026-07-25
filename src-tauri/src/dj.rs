use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::Ordering;
use std::sync::{mpsc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const CREDENTIAL_TARGET: &str = "Cadmium/FishAudio";
const TAGGING_JS: &str = include_str!("../../node_modules/fish-audio-tts-toolkit/src/tagging.js");
const SEARCH_JS: &str = include_str!("../../node_modules/fish-audio-tts-toolkit/src/search.js");
const FISH_JS: &str = include_str!("../../node_modules/fish-audio-tts-toolkit/src/fish.js");
const TOOLKIT_COMMIT: &str = "df7f36c918ab9c9bdeb7efc9f55bb728e93b31af";

const WORKER_JS: &str = r#"
import readline from 'node:readline';
import fs from 'node:fs/promises';
import { tagTtsText } from './tagging.js';
import { searchFishModelsByName } from './search.js';
import { buildDirectFishTtsSettings, buildFishTtsPayload, callFishTTS } from './fish.js';

const apiKey = process.env.FISH_AUDIO_API_KEY || '';
const baseUrl = process.env.FISH_AUDIO_BASE_URL || 'https://api.fish.audio';
const cache = new Map();
const reply = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);

for await (const line of readline.createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  let request;
  try {
    request = JSON.parse(line);
    if (!apiKey) throw new Error('Fish Audio credential is missing');
    if (request.method === 'search') {
      const result = await searchFishModelsByName(request.query, {
        apiKey, baseUrl, cache, limit: Math.max(1, Math.min(12, request.limit || 8))
      });
      reply({ id: request.id, ok: true, result });
    } else if (request.method === 'synthesize') {
      const tagged = await tagTtsText({ text: request.text });
      const settings = buildDirectFishTtsSettings({ voiceId: request.voiceId, format: 'mp3', latency: 'low' });
      const payload = buildFishTtsPayload({ text: tagged.taggedText, settings });
      const audio = await callFishTTS({ apiKey, baseUrl, backend: 's2-pro', payload });
      await fs.writeFile(request.outputPath, audio.buffer);
      reply({ id: request.id, ok: true, result: { path: request.outputPath, taggedText: tagged.taggedText, spokenText: tagged.spokenText, tags: tagged.tags } });
    } else {
      throw new Error('Unknown Fish worker request');
    }
  } catch (error) {
    reply({ id: request?.id || 0, ok: false, error: String(error?.message || error).slice(0, 300) });
  }
}
"#;

const FISH_AUDIO_STUB: &str = r#"
export class FishAudioClient { constructor() { throw new Error('Realtime Fish streaming is disabled in Cadmium'); } }
export const RealtimeEvents = { OPEN:'open', AUDIO_CHUNK:'audio_chunk', ERROR:'error', CLOSE:'close' };
"#;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FishStatusDto {
    pub configured: bool,
    pub node_available: bool,
    pub voice_id: Option<String>,
    pub voice_label: Option<String>,
    pub toolkit_commit: String,
    pub message: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FishVoiceDto {
    pub id: String,
    pub title: String,
    pub description: String,
    pub languages: Vec<String>,
    pub tags: Vec<String>,
    pub match_reasons: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NarrationDto {
    pub path: String,
    pub tagged_text: String,
    pub spoken_text: String,
    pub tags: Vec<String>,
    pub cached: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DjSetDto {
    pub id: String,
    pub session_id: String,
    pub title: String,
    pub rationale: String,
    pub narration: String,
    pub model: Option<String>,
    pub generation_mode: String,
    pub track_ids: Vec<String>,
    pub track_reasons: Vec<crate::library::TrackReasonDto>,
    pub fallback_reason: Option<String>,
    pub sequence: i64,
    pub state: String,
    pub created_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DjQueueSnapshotDto {
    pub queue: Vec<crate::library::QueueItemDto>,
    pub queue_index: usize,
    pub current_track_id: Option<String>,
    pub position_ms: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DjRecoveryDto {
    pub session_id: String,
    pub current_set: DjSetDto,
    pub ordinary_queue: DjQueueSnapshotDto,
    pub dj_queue: DjQueueSnapshotDto,
}

const NODE_CHECK_TTL_MS: u64 = 5_000;

pub struct FishService {
    data_dir: PathBuf,
    worker: Mutex<Option<FishWorker>>,
}

impl FishService {
    pub fn new(data_dir: &Path) -> Self {
        Self {
            data_dir: data_dir.to_path_buf(),
            worker: Mutex::new(None),
        }
    }

    /// Check if node is available with caching to avoid blocking on every status call
    fn check_node_available_cached() -> bool {
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        // Try to read from static cache (simple approach without RwLock for this hot path)
        // Node availability is fairly stable, so we check once and cache for 5 seconds
        static NODE_AVAILABLE_CACHE: std::sync::atomic::AtomicU64 =
            std::sync::atomic::AtomicU64::new(0);
        static NODE_AVAILABLE_RESULT: std::sync::atomic::AtomicU64 =
            std::sync::atomic::AtomicU64::new(0);

        let cached_timestamp = NODE_AVAILABLE_CACHE.load(Ordering::Relaxed);
        let cached_result = NODE_AVAILABLE_RESULT.load(Ordering::Relaxed);

        if now_ms.saturating_sub(cached_timestamp) < NODE_CHECK_TTL_MS && cached_result != 0 {
            return cached_result == 1;
        }

        // Check node availability
        let available = node_available();
        let result = if available { 1 } else { 2 }; // 1 = available, 2 = not available

        NODE_AVAILABLE_CACHE.store(now_ms, Ordering::Relaxed);
        NODE_AVAILABLE_RESULT.store(result, Ordering::Relaxed);

        available
    }

    pub fn status(&self, voice_id: Option<String>, voice_label: Option<String>) -> FishStatusDto {
        let configured = read_credential()
            .map(|value| value.is_some_and(|item| !item.is_empty()))
            .unwrap_or(false);
        let node_available = Self::check_node_available_cached();
        FishStatusDto {
            configured,
            node_available,
            voice_id,
            voice_label,
            toolkit_commit: TOOLKIT_COMMIT.to_owned(),
            message: if !configured {
                "Add a Fish Audio key to enable spoken DJ introductions.".to_owned()
            } else if !node_available {
                "Node.js is required for the pinned Fish Audio toolkit worker.".to_owned()
            } else {
                "Fish Audio is ready.".to_owned()
            },
        }
    }

    pub fn set_credential(&self, value: &str) -> Result<(), String> {
        let trimmed = value.trim();
        if trimmed.len() < 16 || trimmed.len() > 512 {
            return Err("Fish Audio key looks invalid".to_owned());
        }
        write_credential(trimmed)?;
        self.stop_worker();
        Ok(())
    }

    pub fn clear_credential(&self) -> Result<(), String> {
        delete_credential()?;
        self.stop_worker();
        Ok(())
    }

    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<FishVoiceDto>, String> {
        if query.trim().is_empty() || query.chars().count() > 80 {
            return Err("voice search must contain 1 to 80 characters".to_owned());
        }
        let value = self.call(
            json!({"method":"search", "query":query.trim(), "limit":limit.clamp(1, 12)}),
            Duration::from_secs(35),
        )?;
        Ok(value
            .pointer("/items")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(map_voice)
            .collect())
    }

    pub fn synthesize(&self, text: &str, voice_id: &str) -> Result<NarrationDto, String> {
        let text = text.trim();
        let voice_id = voice_id.trim();
        if text.is_empty() || text.chars().count() > 600 {
            return Err("DJ narration must contain 1 to 600 characters".to_owned());
        }
        if voice_id.is_empty() {
            return Err("Choose a Fish Audio voice first".to_owned());
        }
        if voice_id.chars().count() > 160 {
            return Err("Fish Audio voice id is invalid".to_owned());
        }
        let cache_dir = self.data_dir.join("dj-narration");
        std::fs::create_dir_all(&cache_dir).map_err(|error| error.to_string())?;
        let mut hasher = Sha256::new();
        hasher.update(voice_id.as_bytes());
        hasher.update([0]);
        hasher.update(text.as_bytes());
        let output = cache_dir.join(format!("{:x}.mp3", hasher.finalize()));
        if output.is_file() {
            return Ok(NarrationDto {
                path: output.to_string_lossy().into_owned(),
                tagged_text: text.to_owned(),
                spoken_text: text.to_owned(),
                tags: Vec::new(),
                cached: true,
            });
        }
        let value = self.call(
            json!({"method":"synthesize", "text":text, "voiceId":voice_id, "outputPath":output}),
            Duration::from_secs(125),
        )?;
        trim_cache(&cache_dir, 250 * 1024 * 1024);
        Ok(NarrationDto {
            path: value
                .get("path")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned(),
            tagged_text: value
                .get("taggedText")
                .and_then(Value::as_str)
                .unwrap_or(text)
                .to_owned(),
            spoken_text: value
                .get("spokenText")
                .and_then(Value::as_str)
                .unwrap_or(text)
                .to_owned(),
            tags: value
                .get("tags")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect(),
            cached: false,
        })
    }

    fn call(&self, mut request: Value, timeout: Duration) -> Result<Value, String> {
        let mut guard = self
            .worker
            .lock()
            .map_err(|_| "Fish worker lock is poisoned".to_owned())?;
        if guard.is_none() {
            *guard = Some(FishWorker::start(&self.data_dir)?);
        }
        let result = guard
            .as_mut()
            .expect("worker initialized")
            .call(&mut request, timeout);
        if result.is_err() {
            if let Some(worker) = guard.as_mut() {
                worker.shutdown();
            }
            *guard = None;
        }
        result
    }

    fn stop_worker(&self) {
        if let Ok(mut guard) = self.worker.lock() {
            if let Some(worker) = guard.as_mut() {
                worker.shutdown();
            }
            *guard = None;
        }
    }
}

struct FishWorker {
    child: Child,
    stdin: ChildStdin,
    incoming: mpsc::Receiver<Value>,
    next_id: i64,
}

impl FishWorker {
    fn start(data_dir: &Path) -> Result<Self, String> {
        let api_key =
            read_credential()?.ok_or_else(|| "Fish Audio credential is missing".to_owned())?;
        let runtime = data_dir.join("fish-toolkit");
        materialize_worker(&runtime)?;
        let mut command = Command::new("node");
        command
            .arg(runtime.join("worker.mjs"))
            .env("FISH_AUDIO_API_KEY", api_key)
            .env("FISH_AUDIO_BASE_URL", "https://api.fish.audio")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(windows)]
        command.creation_flags(0x08000000);
        let mut child = command
            .spawn()
            .map_err(|error| format!("Could not start Fish toolkit worker: {error}"))?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Fish worker stdin unavailable".to_owned())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Fish worker stdout unavailable".to_owned())?;
        let (sender, incoming) = mpsc::channel();
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if let Ok(value) = serde_json::from_str(&line) {
                    if sender.send(value).is_err() {
                        break;
                    }
                }
            }
        });
        Ok(Self {
            child,
            stdin,
            incoming,
            next_id: 1,
        })
    }

    fn call(&mut self, request: &mut Value, timeout: Duration) -> Result<Value, String> {
        let id = self.next_id;
        self.next_id += 1;
        request["id"] = Value::from(id);
        writeln!(self.stdin, "{}", request)
            .and_then(|_| self.stdin.flush())
            .map_err(|_| "Fish worker stopped".to_owned())?;
        loop {
            let response = self
                .incoming
                .recv_timeout(timeout)
                .map_err(|_| "Fish Audio request timed out".to_owned())?;
            if response.get("id").and_then(Value::as_i64) != Some(id) {
                continue;
            }
            if response.get("ok").and_then(Value::as_bool) != Some(true) {
                return Err(sanitize(
                    response
                        .get("error")
                        .and_then(Value::as_str)
                        .unwrap_or("Fish Audio failed"),
                ));
            }
            return Ok(response.get("result").cloned().unwrap_or(Value::Null));
        }
    }

    fn shutdown(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn materialize_worker(root: &Path) -> Result<(), String> {
    let module_dir = root.join("node_modules").join("fish-audio");
    std::fs::create_dir_all(&module_dir).map_err(|error| error.to_string())?;
    for (path, value) in [
        (root.join("package.json"), "{\"type\":\"module\"}"),
        (root.join("worker.mjs"), WORKER_JS),
        (root.join("tagging.js"), TAGGING_JS),
        (root.join("search.js"), SEARCH_JS),
        (root.join("fish.js"), FISH_JS),
        (
            module_dir.join("package.json"),
            "{\"type\":\"module\",\"exports\":\"./index.js\"}",
        ),
        (module_dir.join("index.js"), FISH_AUDIO_STUB),
    ] {
        if std::fs::read_to_string(&path).ok().as_deref() != Some(value) {
            std::fs::write(path, value).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn map_voice(value: &Value) -> Option<FishVoiceDto> {
    Some(FishVoiceDto {
        id: value.get("_id")?.as_str()?.to_owned(),
        title: value
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or("Untitled voice")
            .to_owned(),
        description: value
            .get("description")
            .and_then(Value::as_str)
            .unwrap_or("")
            .chars()
            .take(220)
            .collect(),
        languages: strings(value.get("languages")),
        tags: strings(value.get("tags")),
        match_reasons: strings(value.get("matchReasons")),
    })
}

fn strings(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_owned)
        .collect()
}
fn sanitize(value: &str) -> String {
    value.replace(['\r', '\n'], " ").chars().take(300).collect()
}
fn node_available() -> bool {
    Command::new("node")
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn trim_cache(root: &Path, limit: u64) {
    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };
    let mut files = entries
        .flatten()
        .filter_map(|entry| {
            let meta = entry.metadata().ok()?;
            Some((entry.path(), meta.len(), meta.modified().ok()))
        })
        .collect::<Vec<_>>();
    let mut total: u64 = files.iter().map(|item| item.1).sum();
    files.sort_by_key(|item| item.2);
    for (path, size, _) in files {
        if total <= limit {
            break;
        }
        if std::fs::remove_file(path).is_ok() {
            total = total.saturating_sub(size);
        }
    }
}

#[cfg(windows)]
#[repr(C)]
struct CredentialW {
    flags: u32,
    kind: u32,
    target: *mut u16,
    comment: *mut u16,
    written: [u64; 1],
    blob_size: u32,
    blob: *mut u8,
    persist: u32,
    attributes: u32,
    attribute: *mut u8,
    alias: *mut u16,
    user: *mut u16,
}

#[cfg(windows)]
#[link(name = "Advapi32")]
extern "system" {
    fn CredWriteW(credential: *const CredentialW, flags: u32) -> i32;
    fn CredReadW(
        target: *const u16,
        kind: u32,
        flags: u32,
        credential: *mut *mut CredentialW,
    ) -> i32;
    fn CredDeleteW(target: *const u16, kind: u32, flags: u32) -> i32;
    fn CredFree(buffer: *mut std::ffi::c_void);
}

#[cfg(windows)]
fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(Some(0)).collect()
}

#[cfg(windows)]
fn write_credential(value: &str) -> Result<(), String> {
    let mut target = wide(CREDENTIAL_TARGET);
    let mut user = wide("Cadmium");
    let mut blob = value.as_bytes().to_vec();
    let credential = CredentialW {
        flags: 0,
        kind: 1,
        target: target.as_mut_ptr(),
        comment: std::ptr::null_mut(),
        written: [0],
        blob_size: blob.len() as u32,
        blob: blob.as_mut_ptr(),
        persist: 2,
        attributes: 0,
        attribute: std::ptr::null_mut(),
        alias: std::ptr::null_mut(),
        user: user.as_mut_ptr(),
    };
    if unsafe { CredWriteW(&credential, 0) } == 0 {
        Err("Windows Credential Manager rejected the Fish Audio key".to_owned())
    } else {
        Ok(())
    }
}

#[cfg(windows)]
fn read_credential() -> Result<Option<String>, String> {
    let target = wide(CREDENTIAL_TARGET);
    let mut pointer = std::ptr::null_mut();
    if unsafe { CredReadW(target.as_ptr(), 1, 0, &mut pointer) } == 0 {
        return Ok(None);
    }
    let credential = unsafe { &*pointer };
    let bytes =
        unsafe { std::slice::from_raw_parts(credential.blob, credential.blob_size as usize) };
    let value = String::from_utf8(bytes.to_vec())
        .map_err(|_| "Fish Audio credential is invalid".to_owned())?;
    unsafe { CredFree(pointer.cast()) };
    Ok(Some(value))
}

#[cfg(windows)]
fn delete_credential() -> Result<(), String> {
    let target = wide(CREDENTIAL_TARGET);
    unsafe { CredDeleteW(target.as_ptr(), 1, 0) };
    Ok(())
}

#[cfg(not(windows))]
fn write_credential(_: &str) -> Result<(), String> {
    Err("Fish credential storage currently requires Windows".to_owned())
}
#[cfg(not(windows))]
fn read_credential() -> Result<Option<String>, String> {
    Ok(None)
}
#[cfg(not(windows))]
fn delete_credential() -> Result<(), String> {
    Ok(())
}
