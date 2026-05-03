use std::path::PathBuf;
use tauri_plugin_shell::ShellExt;

const VIDEO_EXTENSIONS: &[&str] = &["mov", "mp4", "mxf", "r3d", "avi", "mkv"];

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ExtractError {
    short: String,
    category: String,
    details: String,
}

impl ExtractError {
    fn new(short: impl Into<String>, category: &str, details: impl Into<String>) -> Self {
        ExtractError {
            short: short.into(),
            category: category.to_string(),
            details: details.into(),
        }
    }
}

fn categorize_ffmpeg_stderr(stderr: &str) -> (&'static str, &'static str) {
    let lower = stderr.to_lowercase();
    if lower.contains("invalid data found when processing input") {
        return ("codec", "Corrupt file or unsupported codec");
    }
    if lower.contains("decoder") && lower.contains("not found") {
        return ("codec", "Unsupported video codec");
    }
    if lower.contains("could not find codec parameters") {
        return ("codec", "Codec parameters unreadable");
    }
    if lower.contains("moov atom not found") {
        return ("codec", "Unfinalized or corrupt .mov file");
    }
    if lower.contains("permission denied") || lower.contains("operation not permitted") {
        return ("permission", "Permission denied");
    }
    if lower.contains("no such file or directory") {
        return ("io", "File not found");
    }
    if lower.contains("no space left on device") || lower.contains("disk full") {
        return ("io", "Disk full");
    }
    ("ffmpeg", "FFmpeg failed")
}

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
) -> Result<String, ExtractError> {
    let video = PathBuf::from(&video_path);
    let parent = video.parent().ok_or_else(|| {
        ExtractError::new(
            "Cannot determine parent folder",
            "internal",
            format!("Path: {}", video_path),
        )
    })?;
    let stem = video
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| {
            ExtractError::new(
                "Cannot determine filename stem",
                "internal",
                format!("Path: {}", video_path),
            )
        })?;

    let thumbs_dir = parent.join("_thumbnails");
    std::fs::create_dir_all(&thumbs_dir).map_err(|e| {
        ExtractError::new(
            "Failed to create _thumbnails folder",
            "io",
            e.to_string(),
        )
    })?;

    let png_path = thumbs_dir.join(format!("{}.png", stem));
    let png_str = png_path
        .to_str()
        .ok_or_else(|| {
            ExtractError::new(
                "Output path contains invalid characters",
                "internal",
                format!("Path: {:?}", png_path),
            )
        })?
        .to_string();

    let sidecar = app.shell().sidecar("ffmpeg").map_err(|e| {
        ExtractError::new(
            "Failed to locate FFmpeg sidecar",
            "internal",
            e.to_string(),
        )
    })?;

    let output = sidecar
        .args(["-i", &video_path, "-frames:v", "1", "-y", &png_str])
        .output()
        .await
        .map_err(|e| {
            ExtractError::new("Failed to launch FFmpeg", "internal", e.to_string())
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let (category, short) = categorize_ffmpeg_stderr(&stderr);
        return Err(ExtractError::new(short, category, stderr));
    }

    Ok(png_str)
}

#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
fn write_file_bytes(path: String, bytes: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, bytes).map_err(|e| format!("Failed to write {}: {}", path, e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_video_files,
            extract_frame,
            read_file_bytes,
            write_file_bytes
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
