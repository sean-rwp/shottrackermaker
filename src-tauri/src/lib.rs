use std::path::PathBuf;

const VIDEO_EXTENSIONS: &[&str] = &["mov", "mp4", "mxf", "r3d", "avi", "mkv"];

#[tauri::command]
fn list_video_files(folder: String) -> Result<Vec<String>, String> {
    let path = PathBuf::from(&folder);
    if !path.is_dir() {
        return Err(format!("Not a directory: {}", folder));
    }

    let mut files: Vec<String> = std::fs::read_dir(&path)
        .map_err(|e| format!("Failed to read folder: {}", e))?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let p = entry.path();
            if !p.is_file() {
                return None;
            }
            let ext = p.extension()?.to_str()?.to_lowercase();
            if VIDEO_EXTENSIONS.contains(&ext.as_str()) {
                p.to_str().map(String::from)
            } else {
                None
            }
        })
        .collect();

    files.sort();
    Ok(files)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![list_video_files])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
