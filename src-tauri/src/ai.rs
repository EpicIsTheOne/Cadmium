use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
const TURN_TIMEOUT: Duration = Duration::from_secs(90);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStatusDto {
    pub state: String,
    pub connected: bool,
    pub cloud_enabled: bool,
    pub plan_type: Option<String>,
    pub models: Vec<String>,
    pub message: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiLoginDto {
    pub login_id: String,
    pub auth_url: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiCatalogTrack {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub genre: String,
    pub year: Option<i64>,
    pub duration_ms: i64,
}

#[derive(Clone, Debug)]
pub struct AiPlaylistDraft {
    pub name: String,
    pub rationale: String,
    pub model: String,
    pub tracks: Vec<AiTrackChoice>,
}

#[derive(Clone, Debug)]
pub struct AiDjDraft {
    pub set_title: String,
    pub rationale: String,
    pub narration: String,
    pub model: String,
    pub tracks: Vec<AiTrackChoice>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AiTrackChoice {
    pub id: String,
    #[serde(default)]
    pub reason: String,
}

#[derive(Debug, Deserialize)]
struct AiModelOutput {
    name: String,
    rationale: String,
    tracks: Vec<AiTrackChoice>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiDjModelOutput {
    set_title: String,
    rationale: String,
    narration: String,
    tracks: Vec<AiTrackChoice>,
}

#[derive(Debug)]
pub enum AiError {
    Missing(String),
    SignedOut(String),
    Cancelled,
    Protocol(String),
}

impl std::fmt::Display for AiError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Missing(message) | Self::SignedOut(message) | Self::Protocol(message) => {
                write!(formatter, "{message}")
            }
            Self::Cancelled => write!(formatter, "AI playlist generation was cancelled"),
        }
    }
}

pub struct AiService {
    client: Mutex<Option<CodexClient>>,
    cancel_requested: AtomicBool,
    cloud_enabled: AtomicBool,
    cwd: String,
}

impl AiService {
    pub fn new(cwd: &std::path::Path, cloud_enabled: bool) -> Self {
        Self {
            client: Mutex::new(None),
            cancel_requested: AtomicBool::new(false),
            cloud_enabled: AtomicBool::new(cloud_enabled),
            cwd: cwd.to_string_lossy().into_owned(),
        }
    }

    pub fn set_cloud_enabled(&self, enabled: bool) {
        self.cloud_enabled.store(enabled, Ordering::SeqCst);
        if !enabled {
            self.cancel_requested.store(true, Ordering::SeqCst);
            if let Ok(mut client) = self.client.lock() {
                if let Some(client) = client.as_mut() {
                    client.shutdown();
                }
                *client = None;
            }
        }
    }

    pub fn cloud_enabled(&self) -> bool {
        self.cloud_enabled.load(Ordering::SeqCst)
    }

    pub fn cancel(&self) {
        self.cancel_requested.store(true, Ordering::SeqCst);
    }

    pub fn status(&self) -> AiStatusDto {
        if !self.cloud_enabled() {
            return AiStatusDto {
                state: "disabled".to_owned(),
                connected: false,
                cloud_enabled: false,
                plan_type: None,
                models: Vec::new(),
                message:
                    "Codex curation is disabled for Cadmium. Local generation remains available."
                        .to_owned(),
            };
        }
        match self.with_client(|client| client.status()) {
            Ok(status) => status,
            Err(AiError::Missing(message)) => AiStatusDto {
                state: "codexMissing".to_owned(),
                connected: false,
                cloud_enabled: true,
                plan_type: None,
                models: Vec::new(),
                message,
            },
            Err(error) => AiStatusDto {
                state: "error".to_owned(),
                connected: false,
                cloud_enabled: true,
                plan_type: None,
                models: Vec::new(),
                message: sanitize_error(&error.to_string()),
            },
        }
    }

    pub fn start_login(&self) -> Result<AiLoginDto, AiError> {
        self.set_cloud_enabled(true);
        self.with_client(|client| client.start_login())
    }

    pub fn cancel_login(&self, login_id: &str) -> Result<(), AiError> {
        self.with_client(|client| client.cancel_login(login_id))
    }

    pub fn generate(
        &self,
        prompt: &str,
        catalog: &[AiCatalogTrack],
    ) -> Result<AiPlaylistDraft, AiError> {
        if !self.cloud_enabled() {
            return Err(AiError::SignedOut("Codex curation is disabled".to_owned()));
        }
        self.cancel_requested.store(false, Ordering::SeqCst);
        let cwd = self.cwd.clone();
        let result = self
            .with_client(|client| client.generate(prompt, catalog, &cwd, &self.cancel_requested));
        if matches!(result, Err(AiError::Cancelled)) {
            if let Ok(mut client) = self.client.lock() {
                if let Some(client) = client.as_mut() {
                    client.shutdown();
                }
                *client = None;
            }
        }
        result
    }

    pub fn generate_dj(
        &self,
        prompt: &str,
        catalog: &[AiCatalogTrack],
        listening_signals: &Value,
    ) -> Result<AiDjDraft, AiError> {
        if !self.cloud_enabled() {
            return Err(AiError::SignedOut("Codex curation is disabled".to_owned()));
        }
        self.cancel_requested.store(false, Ordering::SeqCst);
        let cwd = self.cwd.clone();
        self.with_client(|client| {
            client.generate_dj(
                prompt,
                catalog,
                listening_signals,
                &cwd,
                &self.cancel_requested,
            )
        })
    }

    fn with_client<T>(
        &self,
        operation: impl FnOnce(&mut CodexClient) -> Result<T, AiError>,
    ) -> Result<T, AiError> {
        let mut guard = self
            .client
            .lock()
            .map_err(|_| AiError::Protocol("Codex service lock is poisoned".to_owned()))?;
        if guard.is_none() {
            *guard = Some(CodexClient::start()?);
        }
        let result = operation(guard.as_mut().expect("client initialized"));
        if result.is_err() && !matches!(result, Err(AiError::SignedOut(_))) {
            if let Some(client) = guard.as_mut() {
                if !client.is_alive() {
                    *guard = None;
                }
            }
        }
        result
    }
}

struct CodexClient {
    child: Child,
    stdin: ChildStdin,
    incoming: mpsc::Receiver<Value>,
    pending: VecDeque<Value>,
    next_id: i64,
}

impl CodexClient {
    fn start() -> Result<Self, AiError> {
        let mut command = Command::new(resolve_codex_executable());
        command
            .args(["app-server", "--stdio"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(windows)]
        command.creation_flags(0x08000000);
        let mut child = command.spawn().map_err(|error| {
            AiError::Missing(format!(
                "Codex CLI is unavailable. Install or repair Codex to enable OAuth curation: {error}"
            ))
        })?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| AiError::Protocol("Codex stdin was unavailable".to_owned()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| AiError::Protocol("Codex stdout was unavailable".to_owned()))?;
        let (sender, incoming) = mpsc::channel();
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if let Ok(value) = serde_json::from_str::<Value>(&line) {
                    if sender.send(value).is_err() {
                        break;
                    }
                }
            }
        });
        let mut client = Self {
            child,
            stdin,
            incoming,
            pending: VecDeque::new(),
            next_id: 1,
        };
        client.request(
            "initialize",
            json!({
                "clientInfo": {"name": "cadmium", "title": "Cadmium", "version": "0.1.0"},
                "capabilities": {"experimentalApi": true}
            }),
            REQUEST_TIMEOUT,
        )?;
        client.notify("initialized", json!({}))?;
        Ok(client)
    }

    fn is_alive(&mut self) -> bool {
        self.child.try_wait().ok().flatten().is_none()
    }

    fn shutdown(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }

    fn status(&mut self) -> Result<AiStatusDto, AiError> {
        let account = self.request(
            "account/read",
            json!({"refreshToken": false}),
            REQUEST_TIMEOUT,
        )?;
        let account_value = account.get("account").filter(|value| !value.is_null());
        let models = self.list_models().unwrap_or_default();
        let connected = account_value.is_some();
        Ok(AiStatusDto {
            state: if connected { "connected" } else { "signedOut" }.to_owned(),
            connected,
            cloud_enabled: true,
            plan_type: account_value
                .and_then(|value| value.get("planType"))
                .and_then(Value::as_str)
                .map(str::to_owned),
            models,
            message: if connected {
                "Codex is connected. Playlist metadata will be sent only when you generate."
                    .to_owned()
            } else {
                "Connect ChatGPT through Codex for AI curation, or generate locally.".to_owned()
            },
        })
    }

    fn list_models(&mut self) -> Result<Vec<String>, AiError> {
        let mut cursor: Option<String> = None;
        let mut models = Vec::new();
        for _ in 0..8 {
            let value = self.request(
                "model/list",
                json!({"cursor": cursor, "limit": 100}),
                REQUEST_TIMEOUT,
            )?;
            models.extend(
                value
                    .get("data")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .filter_map(|model| {
                        model
                            .get("id")
                            .or_else(|| model.get("model"))
                            .or_else(|| model.get("slug"))
                            .and_then(Value::as_str)
                            .map(str::to_owned)
                    }),
            );
            cursor = value
                .get("nextCursor")
                .and_then(Value::as_str)
                .map(str::to_owned);
            if cursor.is_none() {
                break;
            }
        }
        models.sort();
        models.dedup();
        Ok(models)
    }

    fn start_login(&mut self) -> Result<AiLoginDto, AiError> {
        let result = self.request(
            "account/login/start",
            json!({"type": "chatgpt", "useHostedLoginSuccessPage": true, "appBrand": "chatgpt"}),
            REQUEST_TIMEOUT,
        )?;
        let login_id = required_string(&result, "loginId")?;
        let auth_url = required_string(&result, "authUrl")?;
        if !(auth_url.starts_with("https://chatgpt.com/")
            || auth_url.starts_with("https://auth.openai.com/"))
        {
            return Err(AiError::Protocol(
                "Codex returned an unexpected login URL".to_owned(),
            ));
        }
        open_login_url(&auth_url)?;
        Ok(AiLoginDto { login_id, auth_url })
    }

    fn cancel_login(&mut self, login_id: &str) -> Result<(), AiError> {
        self.request(
            "account/login/cancel",
            json!({"loginId": login_id}),
            REQUEST_TIMEOUT,
        )?;
        Ok(())
    }

    fn generate(
        &mut self,
        prompt: &str,
        catalog: &[AiCatalogTrack],
        cwd: &str,
        cancel: &AtomicBool,
    ) -> Result<AiPlaylistDraft, AiError> {
        let status = self.status()?;
        if !status.connected {
            return Err(AiError::SignedOut("Codex is not signed in".to_owned()));
        }
        let model = status.models.first().cloned().unwrap_or_default();
        let developer_instructions = "You are Cadmium's playlist curator. Do not use tools, browse, execute commands, or access files. Return only one strict JSON object with keys name, rationale, and tracks. tracks must be an array of objects with id and reason. Choose only IDs present in the supplied catalog, never invent IDs, avoid duplicates, and return at most 25 tracks.";
        let mut thread_params = json!({
            "cwd": cwd,
            "ephemeral": true,
            "approvalPolicy": "never",
            "sandbox": "read-only",
            "developerInstructions": developer_instructions
        });
        if !model.is_empty() {
            thread_params["model"] = Value::String(model.clone());
        }
        let thread = self.request("thread/start", thread_params, REQUEST_TIMEOUT)?;
        let thread_id = thread
            .pointer("/thread/id")
            .and_then(Value::as_str)
            .ok_or_else(|| AiError::Protocol("Codex returned no thread id".to_owned()))?
            .to_owned();
        let input = json!({
            "request": prompt,
            "maximumTracks": 25,
            "catalog": catalog
        });
        let turn = self.request(
            "turn/start",
            json!({
                "threadId": thread_id,
                "input": [{"type": "text", "text": input.to_string()}],
                "effort": "low",
                "cwd": cwd
            }),
            REQUEST_TIMEOUT,
        )?;
        let turn_id = turn
            .pointer("/turn/id")
            .and_then(Value::as_str)
            .ok_or_else(|| AiError::Protocol("Codex returned no turn id".to_owned()))?
            .to_owned();
        let text = self.collect_turn(&thread_id, &turn_id, cancel)?;
        let output = parse_model_output(&text)?;
        Ok(AiPlaylistDraft {
            name: output.name.trim().chars().take(80).collect(),
            rationale: output.rationale.trim().chars().take(600).collect(),
            model,
            tracks: output.tracks,
        })
    }

    fn generate_dj(
        &mut self,
        prompt: &str,
        catalog: &[AiCatalogTrack],
        listening_signals: &Value,
        cwd: &str,
        cancel: &AtomicBool,
    ) -> Result<AiDjDraft, AiError> {
        let status = self.status()?;
        if !status.connected {
            return Err(AiError::SignedOut("Codex is not signed in".to_owned()));
        }
        let model = status.models.iter().find(|model| model.as_str() == "gpt-5.6-luna").cloned().ok_or_else(|| AiError::Missing("GPT-5.6 Luna is unavailable. Update Codex CLI to 0.144.0 or newer and confirm Luna access for this account.".to_owned()))?;
        let developer_instructions = "You are Cadmium's local-library DJ. Do not use tools, browse, execute commands, or access files. Return only strict JSON with setTitle, rationale, narration, and tracks. tracks is 4 to 6 objects with id and reason. Use only supplied IDs, avoid duplicates, and ground every claim in supplied metadata. narration is 1 to 3 short expressive radio-host sentences and must not invent facts.";
        let thread = self.request(
            "thread/start",
            json!({
                "cwd": cwd, "ephemeral": true, "approvalPolicy": "never", "sandbox": "read-only",
                "model": model, "developerInstructions": developer_instructions
            }),
            REQUEST_TIMEOUT,
        )?;
        let thread_id = thread
            .pointer("/thread/id")
            .and_then(Value::as_str)
            .ok_or_else(|| AiError::Protocol("Codex returned no thread id".to_owned()))?
            .to_owned();
        let input = json!({"request":prompt, "setSize":{"minimum":4,"maximum":6}, "listeningSignals":listening_signals, "catalog":catalog});
        let turn = self.request("turn/start", json!({
            "threadId":thread_id, "input":[{"type":"text","text":input.to_string()}], "effort":"low", "cwd":cwd
        }), REQUEST_TIMEOUT)?;
        let turn_id = turn
            .pointer("/turn/id")
            .and_then(Value::as_str)
            .ok_or_else(|| AiError::Protocol("Codex returned no turn id".to_owned()))?
            .to_owned();
        let text = self.collect_turn(&thread_id, &turn_id, cancel)?;
        let output: AiDjModelOutput = serde_json::from_str(extract_json_object(&text))
            .map_err(|_| AiError::Protocol("Luna returned malformed DJ output".to_owned()))?;
        if output.set_title.trim().is_empty()
            || output.narration.trim().is_empty()
            || output.tracks.is_empty()
        {
            return Err(AiError::Protocol(
                "Luna returned an incomplete DJ set".to_owned(),
            ));
        }
        Ok(AiDjDraft {
            set_title: output.set_title.trim().chars().take(80).collect(),
            rationale: output.rationale.trim().chars().take(500).collect(),
            narration: output.narration.trim().chars().take(600).collect(),
            model,
            tracks: output.tracks,
        })
    }

    fn collect_turn(
        &mut self,
        thread_id: &str,
        turn_id: &str,
        cancel: &AtomicBool,
    ) -> Result<String, AiError> {
        let deadline = Instant::now() + TURN_TIMEOUT;
        let mut text = String::new();
        let mut completed_text: HashMap<String, String> = HashMap::new();
        loop {
            if cancel.load(Ordering::SeqCst) {
                return Err(AiError::Cancelled);
            }
            let now = Instant::now();
            if now >= deadline {
                return Err(AiError::Protocol(
                    "Codex playlist generation timed out".to_owned(),
                ));
            }
            let message = match self.next_message(Duration::from_millis(250)) {
                Ok(message) => message,
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(_) => return Err(AiError::Protocol("Codex app-server stopped".to_owned())),
            };
            if message.get("id").is_some() && message.get("method").is_some() {
                self.respond_to_server_request(&message)?;
                continue;
            }
            let method = message.get("method").and_then(Value::as_str).unwrap_or("");
            let params = message.get("params").cloned().unwrap_or(Value::Null);
            let message_thread = params
                .get("threadId")
                .or_else(|| params.pointer("/turn/threadId"))
                .and_then(Value::as_str)
                .unwrap_or("");
            if !message_thread.is_empty() && message_thread != thread_id {
                continue;
            }
            if method == "item/agentMessage/delta" {
                text.push_str(params.get("delta").and_then(Value::as_str).unwrap_or(""));
            } else if method == "item/completed" {
                if let Some(item) = params.get("item") {
                    if item.get("type").and_then(Value::as_str) == Some("agentMessage") {
                        if let Some(item_text) = item.get("text").and_then(Value::as_str) {
                            completed_text.insert(
                                item.get("id")
                                    .and_then(Value::as_str)
                                    .unwrap_or("assistant")
                                    .to_owned(),
                                item_text.to_owned(),
                            );
                        }
                    }
                }
            } else if method == "turn/completed" {
                let completed_turn = params.get("turn").unwrap_or(&params);
                let completed_id = completed_turn
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or(turn_id);
                if completed_id != turn_id {
                    continue;
                }
                if completed_turn.get("status").and_then(Value::as_str) == Some("failed") {
                    let error = completed_turn
                        .pointer("/error/message")
                        .and_then(Value::as_str)
                        .unwrap_or("Codex playlist generation failed");
                    return Err(AiError::Protocol(sanitize_error(error)));
                }
                if let Some(last) = completed_text.values().last() {
                    text = last.clone();
                }
                return Ok(text);
            } else if method == "error" {
                return Err(AiError::Protocol(sanitize_error(
                    params
                        .pointer("/error/message")
                        .or_else(|| params.get("message"))
                        .and_then(Value::as_str)
                        .unwrap_or("Codex app-server error"),
                )));
            }
        }
    }

    fn request(
        &mut self,
        method: &str,
        params: Value,
        timeout: Duration,
    ) -> Result<Value, AiError> {
        let id = self.next_id;
        self.next_id += 1;
        self.write(json!({"id": id, "method": method, "params": params}))?;
        let deadline = Instant::now() + timeout;
        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err(AiError::Protocol(format!("{method} timed out")));
            }
            let message = self.incoming.recv_timeout(remaining).map_err(|_| {
                AiError::Protocol(format!("{method} failed: Codex app-server stopped"))
            })?;
            if message.get("id").and_then(Value::as_i64) == Some(id)
                && message.get("method").is_none()
            {
                if let Some(error) = message.get("error") {
                    return Err(AiError::Protocol(sanitize_error(
                        error
                            .get("message")
                            .and_then(Value::as_str)
                            .unwrap_or("Codex request failed"),
                    )));
                }
                return Ok(message.get("result").cloned().unwrap_or(Value::Null));
            }
            if message.get("id").is_some() && message.get("method").is_some() {
                self.respond_to_server_request(&message)?;
            } else {
                self.pending.push_back(message);
            }
        }
    }

    fn next_message(&mut self, timeout: Duration) -> Result<Value, mpsc::RecvTimeoutError> {
        self.pending
            .pop_front()
            .map(Ok)
            .unwrap_or_else(|| self.incoming.recv_timeout(timeout))
    }

    fn respond_to_server_request(&mut self, message: &Value) -> Result<(), AiError> {
        let id = message.get("id").cloned().unwrap_or(Value::Null);
        let method = message.get("method").and_then(Value::as_str).unwrap_or("");
        let result = if method.contains("requestApproval") {
            json!({"decision": "decline"})
        } else if method == "item/tool/requestUserInput" {
            json!({"answers": {}})
        } else if method == "item/tool/call" {
            json!({"success": false, "contentItems": [{"type": "inputText", "text": "Tools are disabled for playlist curation."}]})
        } else {
            json!({})
        };
        self.write(json!({"id": id, "result": result}))
    }

    fn notify(&mut self, method: &str, params: Value) -> Result<(), AiError> {
        self.write(json!({"method": method, "params": params}))
    }

    fn write(&mut self, value: Value) -> Result<(), AiError> {
        writeln!(self.stdin, "{value}")
            .and_then(|_| self.stdin.flush())
            .map_err(|error| {
                AiError::Protocol(format!("Could not communicate with Codex: {error}"))
            })
    }
}

fn resolve_codex_executable() -> std::path::PathBuf {
    if let Some(path) = std::env::var_os("CADMIUM_CODEX_PATH")
        .map(std::path::PathBuf::from)
        .filter(|path| path.is_file())
    {
        return path;
    }
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        let winget = std::path::PathBuf::from(local)
            .join("Microsoft")
            .join("WinGet")
            .join("Packages")
            .join("OpenAI.Codex_Microsoft.Winget.Source_8wekyb3d8bbwe")
            .join("codex-x86_64-pc-windows-msvc.exe");
        if winget.is_file() {
            return winget;
        }
    }
    std::path::PathBuf::from("codex")
}

impl Drop for CodexClient {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn required_string(value: &Value, key: &str) -> Result<String, AiError> {
    value
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_owned)
        .ok_or_else(|| AiError::Protocol(format!("Codex returned no {key}")))
}

fn parse_model_output(raw: &str) -> Result<AiModelOutput, AiError> {
    let json_text = extract_json_object(raw);
    let output: AiModelOutput = serde_json::from_str(json_text)
        .map_err(|_| AiError::Protocol("Codex returned malformed playlist data".to_owned()))?;
    if output.name.trim().is_empty() || output.tracks.is_empty() {
        return Err(AiError::Protocol(
            "Codex returned an empty playlist".to_owned(),
        ));
    }
    Ok(output)
}

fn extract_json_object(raw: &str) -> &str {
    let trimmed = raw.trim();
    if trimmed.starts_with("```") {
        trimmed
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
    } else if let (Some(start), Some(end)) = (trimmed.find('{'), trimmed.rfind('}')) {
        &trimmed[start..=end]
    } else {
        trimmed
    }
}

fn sanitize_error(message: &str) -> String {
    let compact = message.split_whitespace().collect::<Vec<_>>().join(" ");
    compact.chars().take(400).collect()
}

fn open_login_url(url: &str) -> Result<(), AiError> {
    #[cfg(windows)]
    {
        Command::new("rundll32.exe")
            .arg("url.dll,FileProtocolHandler")
            .arg(url)
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|error| AiError::Protocol(format!("Could not open Codex login: {error}")))?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = url;
        Err(AiError::Protocol(
            "Automatic Codex login opening is currently Windows-only".to_owned(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dj_output_requires_structured_commentary_and_tracks() {
        let raw = r#"{"setTitle":"Night Signal","rationale":"Recent favorites","narration":"[calm] Let us ease into this one.","tracks":[{"id":"track-1","reason":"Fits the signal"}]}"#;
        let output: AiDjModelOutput = serde_json::from_str(extract_json_object(raw)).unwrap();
        assert_eq!(output.set_title, "Night Signal");
        assert_eq!(output.tracks[0].id, "track-1");
    }

    #[test]
    fn parses_strict_or_fenced_playlist_json() {
        let raw = r#"```json
        {"name":"Night Drive","rationale":"Low light.","tracks":[{"id":"track_1","reason":"Fits"}]}
        ```"#;
        let output = parse_model_output(raw).unwrap();
        assert_eq!(output.name, "Night Drive");
        assert_eq!(output.tracks[0].id, "track_1");
    }

    #[test]
    fn rejects_empty_or_malformed_model_output() {
        assert!(parse_model_output("not json").is_err());
        assert!(parse_model_output(r#"{"name":"","rationale":"","tracks":[]}"#).is_err());
    }

    #[test]
    fn sanitizes_and_bounds_protocol_errors() {
        let message = " noisy\n\n error ".repeat(100);
        let sanitized = sanitize_error(&message);
        assert!(!sanitized.contains('\n'));
        assert!(sanitized.chars().count() <= 400);
    }
}
