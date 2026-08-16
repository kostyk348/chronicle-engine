// Chronicle Engine — Tauri (Rust) native backend.
// Provides real filesystem persistence + native dialogs for the React core.
use std::fs;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
