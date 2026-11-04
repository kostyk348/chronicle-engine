// Chronicle Engine — Tauri (Rust) native backend.
// Provides real filesystem persistence + native dialogs for the React core.
mod link;

use std::fs;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

// ------------------------------------------------------------ Chronicle Link

/// Активная сетевая сессия (не более одной на окно процесса).
enum LinkSession {
    Host(link::HostHandle),
    Client(link::ClientHandle),
}

struct LinkState {
    session: Option<LinkSession>,
    table: String,
    role: String,
}

impl Default for LinkState {
    fn default() -> Self {
        LinkState {
            session: None,
            table: String::new(),
            role: String::new(),
        }
    }
}

/// Пересылка сетевых событий в окно: LinkEvent → JSON → emit("link-event").
fn forward_events(app: AppHandle, rx: std::sync::mpsc::Receiver<link::LinkEvent>) {
    use link::LinkEvent;
    use tauri::Emitter;
    std::thread::spawn(move || {
        for ev in rx {
            let payload = match ev {
                LinkEvent::Roster(players) => serde_json::json!({ "kind": "roster", "players": players }),
                LinkEvent::Message(env) => serde_json::json!({ "kind": "message", "envelope": env }),
                LinkEvent::Closed(reason) => serde_json::json!({ "kind": "closed", "reason": reason }),
                LinkEvent::Notice(text) => serde_json::json!({ "kind": "notice", "text": text }),
            };
            let _ = app.emit("link-event", payload);
        }
    });
}

#[tauri::command]
fn link_host(
    app: AppHandle,
    state: State<Mutex<LinkState>>,
    port: u16,
    table: String,
    player_name: String,
    actors: Vec<String>,
    master_seed_commit: String,
    campaign_eml: Option<String>,
) -> Result<u16, String> {
    {
        let st = state.lock().map_err(|_| "poisoned")?;
        if st.session.is_some() {
            return Err("Сессия уже активна — сначала покиньте стол".into());
        }
    }
    let (tx, rx) = std::sync::mpsc::channel();
    let handle = link::run_host(port, &table, &player_name, actors, &master_seed_commit, campaign_eml, tx)?;
    forward_events(app, rx);
    let real_port = handle.port;
    let mut st = state.lock().map_err(|_| "poisoned")?;
    st.session = Some(LinkSession::Host(handle));
    st.table = table.clone();
    st.role = "host".into();
    Ok(real_port)
}

#[tauri::command]
fn link_join(
    app: AppHandle,
    state: State<Mutex<LinkState>>,
    addr: String,
    player_name: String,
    actors: Vec<String>,
) -> Result<String, String> {
    {
        let st = state.lock().map_err(|_| "poisoned")?;
        if st.session.is_some() {
            return Err("Сессия уже активна — сначала покиньте стол".into());
        }
    }
    let (tx, rx) = std::sync::mpsc::channel();
    let handle = link::run_client(&addr, &player_name, actors, tx)?;
    forward_events(app, rx);
    let server = handle.server_addr.clone();
    let mut st = state.lock().map_err(|_| "poisoned")?;
    st.session = Some(LinkSession::Client(handle));
    st.role = "client".into();
    Ok(server)
}

/// Отправка конверта: host — broadcast, client — хосту. body приходит строкой JSON.
#[tauri::command]
fn link_send(state: State<Mutex<LinkState>>, kind: String, body_json: String) -> Result<(), String> {
    let body: serde_json::Value =
        serde_json::from_str(&body_json).map_err(|e| format!("bad body json: {e}"))?;
    let mut st = state.lock().map_err(|_| "poisoned")?;
    match &st.session {
        Some(LinkSession::Host(h)) => h.broadcast(&kind, body),
        Some(LinkSession::Client(c)) => c.send(&kind, body),
        None => Err("Нет активной сессии".into()),
    }
}

#[tauri::command]
fn link_leave(state: State<Mutex<LinkState>>) -> Result<(), String> {
    let mut st = state.lock().map_err(|_| "poisoned")?;
    match st.session.take() {
        Some(LinkSession::Host(h)) => h.leave(),
        Some(LinkSession::Client(c)) => c.leave(),
        None => {}
    }
    st.table.clear();
    st.role.clear();
    Ok(())
}

#[derive(serde::Serialize)]
struct LinkStatus {
    active: bool,
    role: String,
    table: String,
}

#[tauri::command]
fn link_status(state: State<Mutex<LinkState>>) -> LinkStatus {
    let st = state.lock().unwrap_or_else(|e| e.into_inner());
    LinkStatus {
        active: st.session.is_some(),
        role: st.role.clone(),
        table: st.table.clone(),
    }
}

/// Read a UTF-8 text file from disk (campaign JSON, .eml logs, exports).
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("read failed: {e}"))
}

/// Write a UTF-8 text file to disk (atomic-ish: write to temp, then rename).
#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    let tmp = format!("{path}.tmp");
    fs::write(&tmp, content).map_err(|e| format!("write failed: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("commit failed: {e}"))
}

/// Check whether a path exists on disk.
#[tauri::command]
fn path_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

/// Write a binary file (base64 payload) to disk — used for EPUB/PDF exports.
#[tauri::command]
fn write_binary_file(path: String, base64_content: String) -> Result<(), String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&base64_content)
        .map_err(|e| format!("base64 decode failed: {e}"))?;
    let tmp = format!("{path}.tmp");
    fs::write(&tmp, &bytes).map_err(|e| format!("write failed: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("commit failed: {e}"))
}

/// Native "Save As…" dialog. Returns chosen path or None if cancelled.
#[tauri::command]
async fn pick_save_path(app: AppHandle, default_name: String) -> Result<Option<String>, String> {
    let picked = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .blocking_save_file();
    Ok(picked.and_then(|p| p.into_path().ok()).map(|p| p.display().to_string()))
}

/// Native "Open…" dialog with an optional extension filter.
#[tauri::command]
async fn pick_open_path(
    app: AppHandle,
    filter_ext: Option<String>,
) -> Result<Option<String>, String> {
    let mut builder = app.dialog().file();
    if let Some(ext) = filter_ext {
        let name = format!("*{ext}");
        builder = builder.add_filter("Data", &[name.as_str()]);
    }
    let picked = builder.blocking_pick_file();
    Ok(picked.and_then(|p| p.into_path().ok()).map(|p| p.display().to_string()))
}

/// Cross-platform app data directory (per-user, versioned). Creates it if missing.
#[tauri::command]
fn app_data_dir(app: AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir failed: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir failed: {e}"))?;
    Ok(dir.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            write_binary_file,
            path_exists,
            pick_save_path,
            pick_open_path,
            app_data_dir,
            link_host,
            link_join,
            link_send,
            link_leave,
            link_status,
        ])
        .manage(Mutex::<LinkState>::default())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
