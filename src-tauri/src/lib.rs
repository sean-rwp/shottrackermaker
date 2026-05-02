use tauri_plugin_shell::ShellExt;

#[tauri::command]
async fn test_ffmpeg(app: tauri::AppHandle) -> Result<String, String> {
    let sidecar = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| format!("Failed to locate ffmpeg sidecar: {}", e))?;

    let output = sidecar
        .args(["-version"])
        .output()
        .await
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "ffmpeg exited with code {:?}: {}",
            output.status.code(),
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![test_ffmpeg])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
