use std::path::PathBuf;
use tauri_plugin_shell::ShellExt;

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

#[tauri::command]
async fn extract_frame(
    app: tauri::AppHandle,
    video_path: String,
) -> Result<String, String> {
    let video = PathBuf::from(&video_path);
    let parent = video
        .parent()
        .ok_or_else(|| format!("Cannot determine parent folder of {}", video_path))?;
    let stem = video
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| format!("Cannot determine filename stem of {}", video_path))?;

    let thumbs_dir = parent.join("_thumbnails");
    std::fs::create_dir_all(&thumbs_dir)
        .map_err(|e| format!("Failed to create _thumbnails folder: {}", e))?;

    let png_path = thumbs_dir.join(format!("{}.png", stem));
    let png_str = png_path
        .to_str()
        .ok_or_else(|| "Output path contains invalid characters".to_string())?
        .to_string();

    let sidecar = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| format!("FFmpeg sidecar error: {}", e))?;

    let output = sidecar
        .args([
            "-i",
            &video_path,
            "-frames:v",
            "1",
            "-y",
            &png_str,
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to run FFmpeg: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let last_line = stderr
            .lines()
            .filter(|l| !l.trim().is_empty())
            .last()
            .unwrap_or("unknown error");
        return Err(format!("FFmpeg failed: {}", last_line));
    }

    Ok(png_str)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![list_video_files, extract_frame])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
